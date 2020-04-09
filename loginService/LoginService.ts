import ServiceServer from '../ServiceServer'
import { parse } from 'url'
import fetch from 'node-fetch'
import FormData from 'form-data'
import { sign, verify } from 'jsonwebtoken'
import { randomBytes } from 'crypto'
import { Flake } from '../Flake'
import r from 'rethinkdb'

const { 
    DISCORD_ID,
    DISCORD_SECRET,
    GOOGLE_ID,
    GOOGLE_SECRET,
    REDIS_URL,
    JWT_KEY,
    DOMAIN,
    RETHINK,
    RETHINK_PASSWORD,
    RETHINK_USER,
    RETHINK_PORT,
    RETHINK_DB
 } = process.env

// The structure of a user in the database.
type User = {
    id: string,
    discord?: string,
    google?:  string,
    username: string,
    locale: string,
    score: number,
    avatar: string
}

const { server } = new ServiceServer({}, { prometheus: true, healthEndpoint: true, authRequired: false }, REDIS_URL)

// The flake service for generating ids.
const flake = new Flake
// Rethinkdb
let db: r.Connection

(async () => {
    db = await r.connect({
        host: RETHINK,
        port: parseInt(RETHINK_PORT),
        db: RETHINK_DB,
        //password: "9TnSbk2b72jQd3PY6",
        //user: "kuizz"
    })
})()

async function getDiscordUserFromToken(code: string, uri: string) {
    const formData = new FormData
    formData.append('client_id', DISCORD_ID)
    formData.append('client_secret', DISCORD_SECRET)
    formData.append('grant_type', 'authorization_code')
    formData.append('code', code)
    formData.append('redirect_uri', uri)
    formData.append('scope', 'identify')

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

async function getGoogleUserFromToken(code, uri) {
    const formData = new FormData

    formData.append('client_id', GOOGLE_ID)
    formData.append('client_secret', GOOGLE_SECRET)
    formData.append('grant_type', 'authorization_code')
    formData.append('code', code)
    formData.append('redirect_uri', uri)

    const { access_token } = await fetch(`https://oauth2.googleapis.com/token`, {
        method: 'POST',
        headers: formData.getHeaders(),
        body: formData
    })
    .then(data => data.json())
    
    return await fetch(`https://www.googleapis.com/oauth2/v2/userinfo?oauth_token=${access_token}`)
    .then(x => x.json())
}

server.get('/oauth/discord', async (request, response) => {

    const { code, state } = request.query
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
    // Check the state.
    const { redirect, linkAccount }: { redirect: string, linkAccount: string } = <any>request.session

    const discordUser = await getDiscordUserFromToken(code, uri)

    let user: User

    if (linkAccount) {
        // We try to verify the key.
        try {
            const tokenAccount = <User>verify(linkAccount, JWT_KEY)
            // Check if the account exists
            const exists = await r.db('kuizz')
                            .table('users')
                            .filter({ id: tokenAccount.id })
                            .count()
                            .eq(1)
                            .run(db)
            if(exists) {
                const databaseAccount = <User>await r.db('kuizz')
                    .table('users')
                    .filter({ id: tokenAccount.id })
                    .nth(0)
                    .run(db)
                if(!databaseAccount.discord) {
                    databaseAccount.discord = discordUser.id
                    await r.db('kuizz')
                        .table('users')
                        .update(databaseAccount)
                        .run(db)
                    user = databaseAccount
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
                              .filter({ discord: discordUser.id })
                              .count()
                              .eq(1)
                              .run(db)
        if(!exists) {
            user = {
                id: flake.gen(),
                username: discordUser.username,
                avatar: `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png?size=256`,
                locale: discordUser.locale,
                score: 0,
                discord: discordUser.id
            }
            await r.db('kuizz')
                .table('users')
                .insert(user)
                .run(db)
        } else {
            user = <User>await r.db('kuizz')
                          .table('users')
                          .filter({ discord: discordUser.id })
                          .nth(0)
                          .run(db)
        }
    }

    if (user) {
        const token = sign({ id: user.id, locale: user.locale }, JWT_KEY)

        if(redirect) {
            const redirectUrl = parse(redirect)
            const myUrl = parse(uri)
    
            // check if the redirect is allowed.
            if(redirectUrl.protocol === 'https' && redirectUrl.port === '443' && redirectUrl.host === myUrl.host) {
                return response.redirect(`${redirectUrl}?token=${token}`)
            }
        }
        return response.send(token)
    }
})

server.get('/oauth/google', async (request, response) => {
    const { code, state } = request.query
    const uri = `${DOMAIN}${parse(request.raw.url).pathname}`

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
    // Check the state.
    const { redirect, linkAccount }: { redirect: string, linkAccount: string } = <any>request.session

    const googleUser = await getGoogleUserFromToken(code, uri)

    let user: User

    if (linkAccount) {
        // We try to verify the key.
        try {
            const tokenAccount = <User>verify(linkAccount, JWT_KEY)
            // Check if the account exists
            const exists = await r.db('kuizz')
                            .table('users')
                            .filter({ id: tokenAccount.id })
                            .count()
                            .eq(1)
                            .run(db)
            if(exists) {
                const databaseAccount = <User>await r.db('kuizz')
                    .table('users')
                    .filter({ id: tokenAccount.id })
                    .nth(0)
                    .run(db)
                if(!databaseAccount.google) {
                    databaseAccount.google = googleUser.id
                    await r.db('kuizz')
                        .table('users')
                        .update(databaseAccount)
                        .run(db)
                    user = databaseAccount
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
                              .filter({ google: googleUser.id })
                              .count()
                              .eq(1)
                              .run(db)
        if(!exists) {
            user = {
                id: flake.gen(),
                username: googleUser.name,
                avatar: googleUser.picture,
                locale: googleUser.locale,
                score: 0,
                google: googleUser.id
            }
            await r.db('kuizz')
                .table('users')
                .insert(user)
                .run(db)
        } else {
            user = <User>await r.db('kuizz')
                          .table('users')
                          .filter({ google: googleUser.id })
                          .nth(0)
                          .run(db)
        }
    }

    if (user) {
        const token = sign({ id: user.id, locale: user.locale }, JWT_KEY)

        if(redirect) {
            const redirectUrl = parse(redirect)
            const myUrl = parse(uri)
    
            // check if the redirect is allowed.
            if(redirectUrl.protocol === 'https' && redirectUrl.port === '443' && redirectUrl.host === myUrl.host) {
                return response.redirect(`${redirectUrl}?token=${token}`)
            }
        }
        return response.send(token)
    }
})