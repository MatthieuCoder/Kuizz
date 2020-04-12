import ServiceServer from '../common/ServiceServer'
import { parse } from 'url'
import fetch from 'node-fetch'
import FormData from 'form-data'
import { sign, verify } from 'jsonwebtoken'
import { randomBytes } from 'crypto'
import r from 'rethinkdb'
import Flake from '../common/utils/Flake'
import User, { AvatarSource } from '../common/dataStructures/User'

const { 
    DISCORD_ID,
    DISCORD_SECRET,
    GOOGLE_ID,
    GOOGLE_SECRET,
    JWT_KEY,
    DOMAIN,
 } = process.env

const { server } = new ServiceServer({ prometheus: true, healthEndpoint: true, authRequired: false })
// The flake service for generating ids.
const flake = new Flake
//#region Oauth code to token requests
function buildFormData(data: any) {
    const form = new FormData
    for(const [key, value] of Object.entries(data)) {
        form.append(key, value)
    }
    return form
}
async function getDiscordUserFromToken(code: string, uri: string) {
    const formData = buildFormData({
        client_id: DISCORD_ID,
        client_secret: DISCORD_SECRET,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: uri,
        scope: 'identify'
    })
    const { access_token: discord_token } = await fetch('https://discordapp.com/api/v6/oauth2/token', {
        method: 'POST',
        body: formData,
        headers: formData.getHeaders()
    }).then(x => x.json())
    return await fetch('https://discordapp.com/api/v6/users/@me', {
        headers: {
            'Authorization': `Bearer ${discord_token}`
        }
    }).then(x => x.json())
}
async function getGoogleUserFromToken(code: string, uri: string) {
    const formData = buildFormData({
        client_id: GOOGLE_ID,
        client_secret: GOOGLE_SECRET,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: uri
    })
    const { access_token } = await fetch(`https://oauth2.googleapis.com/token`, {
        method: 'POST',
        headers: formData.getHeaders(),
        body: formData
    })
    .then(data => data.json())
    return await fetch(`https://www.googleapis.com/oauth2/v2/userinfo?oauth_token=${access_token}`)
    .then(x => x.json())
}
//#endregion

server.get('/oauth/discord', async (request, response) => {
    const { code, state } = request.query
    const { rethink } = request
    const uri = `${DOMAIN}${parse(request.raw.url).pathname}`
    // Redirect
    {
        const { redirect, linkAccount } = request.query
        // Check if we need to redirect the user to discord auth.
        if (request.session.state !== state || !code || !state ) {
            // Generating the random state.
            const state = randomBytes(15).toString('hex')
            response.redirect(`https://discordapp.com/api/oauth2/authorize?response_type=code&scope=identify&state=${state}&redirect_uri=${uri}&client_id=${DISCORD_ID}`)
            // Store the data in the secured session.
            Object.assign(request.session, { linkAccount, state, redirect })
            return
        }
    }
    request.session.state = undefined
    // Get the state.
    const { redirect, linkAccount } = <{ redirect: string, linkAccount: string }><any>request.session
    const discordUser = await getDiscordUserFromToken(code, uri)
    
    if (linkAccount) {
        // We try to verify the key.
        try {
            const tokenAccount = <User>verify(linkAccount, JWT_KEY)
            // Check if the account exists
            const exists = await r.db('kuizz')
                            .table('users')
                            .filter({ id: tokenAccount.id } as User)
                            .count()
                            .eq(1)
                            .run(rethink)
            if(exists) {
                const databaseAccount = <User>await r.db('kuizz')
                    .table('users')
                    .filter({ id: tokenAccount.id })
                    .nth(0)
                    .run(rethink)
                if(!databaseAccount.discord) {
                    databaseAccount.discord = { 
                        avatar: `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png?size=256`,
                        id: discordUser.id
                    }
                    await r.db('kuizz')
                        .table('users')
                        .update(databaseAccount)
                        .run(rethink)
                    request.user = databaseAccount
                } else {
                    response.code(400)
                    response.send({ error: 'This account is already linked to a discord account.', code: 400 })
                }
            } else {
                response.code(400)
                response.send({ error: 'The user do not exist.', code: 400 })
            }
        } catch (error) {
            response.code(400)
            response.send({ error: 'This token isn\'t valid.', code: 400 })
        }
    } else {
        const exists = await r.db('kuizz')
                              .table('users')
                              .filter({ discord: { id: discordUser.id } })
                              .count()
                              .eq(1)
                              .run(rethink)
        if(!exists) {
            request.user = <User>{
                id: flake.gen(),
                discord: { 
                    avatar: `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png?size=256`,
                    id: discordUser.id
                },
                avatarSource: AvatarSource.Discord,
                roles: 0x0,
                username: discordUser.username,
                locale: discordUser.locale,
                reputation: 1,
                wins: 0,
                lost: 0
            }
            await r.db('kuizz')
                .table('users')
                .insert(request.user)
                .run(rethink)
        } else {
            request.user = <User>await r.db('kuizz')
                          .table('users')
                          .filter({ discord: { id: discordUser.id } })
                          .nth(0)
                          .run(rethink)
            if(request.user.discord.avatar !== `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png?size=256`) {
                request.user.discord.avatar = `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png?size=256`
                await r.db('kuizz')
                        .table('users')
                        .update(request.user)
                        .run(rethink)
            }
        }
    }

    if (request.user) {
        const token = sign({ id: request.user.id, locale: request.user.locale, roles: request.user.roles }, JWT_KEY)
        if(redirect) {
            const redirectUrl = parse(redirect)
            const myUrl = parse(uri)
            // check if the redirect is allowed.
            if(redirectUrl.host === myUrl.host) {
                return response.redirect(`${redirect}?token=${token}`)
            }
        }
        return response.send(token)
    } else {
        return response.send()
    }
})

server.get('/oauth/google', async (request, response) => {
    const { code, state } = request.query
    const uri = `${DOMAIN}${parse(request.raw.url).pathname}`
    const { rethink } = request
    // Redirect
    {
        const { redirect, linkAccount } = request.query
        // Check if we need to redirect the user to discord auth.
        if (request.session.state !== state || !code || !state) {
            // Generating the random state.
            const state = randomBytes(15).toString('hex')
            response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?response_type=code&scope=https://www.googleapis.com/auth/userinfo.profile&state=${state}&redirect_uri=${uri}&client_id=${GOOGLE_ID}`)
            // Store the data in the secured session.
            Object.assign(request.session, { linkAccount, state, redirect })
            return
        }
    }

    request.session.state = undefined

    const googleUser = await getGoogleUserFromToken(code, uri)

    // Get the state.
    const { redirect, linkAccount } = <{ redirect: string, linkAccount: string }><any>request.session
    if (linkAccount) {
        // We try to verify the key.
        try {
            const tokenAccount = <User>verify(linkAccount, JWT_KEY)
            // Check if the account exists
            const exists = await r.db('kuizz')
                            .table('users')
                            .filter({ id: tokenAccount.id } as User)
                            .count()
                            .eq(1)
                            .run(rethink)
            if(exists) {
                const databaseAccount = <User>await r.db('kuizz')
                    .table('users')
                    .filter({ id: tokenAccount.id })
                    .nth(0)
                    .run(rethink)
                if(!databaseAccount.google) {
                    databaseAccount.google = { 
                        avatar: googleUser.picture,
                        id: googleUser.id
                    }
                    await r.db('kuizz')
                        .table('users')
                        .update(databaseAccount)
                        .run(rethink)
                    request.user = databaseAccount
                } else {
                    response.code(400)
                    response.send({ error: 'This account is already linked to a google account.', code: 400 })
                }
            } else {
                response.code(400)
                response.send({ error: 'The user do not exist.', code: 400 })
            }
        } catch (error) {
            response.code(400)
            response.send({ error: 'This token isn\'t valid.', code: 400 })
        }
    } else {
        const exists = await r.db('kuizz')
                                .table('users')
                                .filter({ google: { id: googleUser.id } })
                                .count()
                                .eq(1)
                                .run(rethink)
        if(!exists) {
            request.user = <User>{
                id: flake.gen(),
                google: { 
                    avatar: googleUser.picture,
                    id: googleUser.id
                },
                avatarSource: AvatarSource.Google,
                roles: 0x0,
                username: googleUser.name,
                locale: googleUser.locale,
                reputation: 1,
                wins: 0,
                lost: 0
            }
            await r.db('kuizz')
                .table('users')
                .insert(request.user)
                .run(rethink)
        } else {
            request.user = <User>await r.db('kuizz')
                            .table('users')
                            .filter({ google: { id: googleUser.id } })
                            .nth(0)
                            .run(rethink)
            if(request.user.discord.avatar !== googleUser.picture) {
                request.user.discord.avatar = googleUser.picture
                await r.db('kuizz')
                        .table('users')
                        .update(request.user)
                        .run(rethink)
            }
        }
    }
    
    if (request.user) {
        const token = sign({ id: request.user.id, locale: request.user.locale, roles: request.user.roles }, JWT_KEY)
        if(redirect) {
            const redirectUrl = parse(redirect)
            const myUrl = parse(uri)
            // check if the redirect is allowed.
            if(redirectUrl.host === myUrl.host) {
                return response.redirect(`${redirect}?token=${token}`)
            }
        }
        return response.send(token)
    } else {
        return response.send()
    }
})