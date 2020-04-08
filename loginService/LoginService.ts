import ServiceServer from '../ServiceServer'
import { parse } from 'url'
import fetch from 'node-fetch'
import FormData from 'form-data'
import { sign, verify } from 'jsonwebtoken'
import { randomBytes } from 'crypto'
import Enmap from 'enmap'
import { Flake } from '../Flake'


const { 
    DISCORD_ID,
    DISCORD_SECRET,
    GOOGLE_ID,
    GOOGLE_SECRET,
    REDIS_URL,
    JWT_KEY,
    DOMAIN
 } = process.env

// The structure of a user in the database.
type User = {
    id: string,
    discord?: { id: string, avatar: string, locale: string, username: string },
    google?:  { id: string, avatar: string, locale: string, username: string }
}

const { server } = new ServiceServer({}, { prometheus: true, healthEndpoint: true }, REDIS_URL)

// The flake service for generating ids.
const flake = new Flake
// Enmap used for developement purposes.
const db = new Enmap<string, User>()

server.get('/oauth/discord', async (request, response) => {
        const { code, state, redirect } = request.query
        let { linkAccount } = request.query
        const uri = `${DOMAIN}${parse(request.raw.url).pathname}`
        // Check if we need to redirect the user to discord auth.
        if (request.session.state !== state || !code || !state ) {
            // Generating the random state.
            const state = randomBytes(15).toString('hex')
            response.redirect(`https://discordapp.com/api/oauth2/authorize?response_type=code&scope=identify&state=${state}&redirect_uri=${uri}&client_id=${DISCORD_ID}`)
            // Store the data in the secured session.
            Object.assign(request.session, { linkAccount, state, redirect })
            return
        }
        
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
        
        const { id, username, avatar, locale } = await fetch('https://discordapp.com/api/v6/users/@me', {
            headers: {
                'Authorization': `Bearer ${discord_token}`
            }
        }).then(x => x.json())

        request.session.state = undefined

        const { linkAccount: linkAccount_request, redirect_request } = request.session
        let user: User
        // First of all, we try to understand if there is a linkAccount token linked to this link request.
        if(linkAccount_request) {
            // We want to link an account
            // Se we have a link token represents the user's token.
            // We just have to retieve the user_id from the token.
            // Don't forget to verify the validity of the token.
            try {
                const { id: account_id } = verify(linkAccount_request, JWT_KEY) as any
                // Now we have the id corresponding to the user.
                // Let's link the acocunt!
                // but first we need to check if the account exists.
                if (db.has(`user:${account_id}`)) {
                    // Let's check if the account is already linked.
                    user = db.get(`user:${account_id}`)
                    if (user.discord) {
                        // The user already have an discord account linked.
                        // We deny the request
                        return response.code(401)
                    }
                    // Lets create the link info.
                    user.discord = { id, avatar, locale, username }
                    // And we update the account in the database.
                    db.set(`user:${account_id}`, user)

                } else {
                    // The user doesn't have an account.
                    // We deny the request.
                    return response.code(401)
                }
            } catch(e) {
                // The token signature isn't ours, we deny the request.
                return response.code(401)
            }
        } else {
            // No link requested.
            user = db.filter(user => user.discord && user.discord.id === id)[0]
            if(!user) {
                // No user in the database
                // Let's create one!
                user = {
                    discord: { id, avatar, locale, username },
                    id: flake.gen()
                }
                db.set(`user:${user.id}`, user)
            }
        }

        const token = sign(user, JWT_KEY)
        if(redirect_request) {
            return response.redirect(`https://${redirect_request}?token=${token}`)
        }
        response.send(
            response.serialize({
                user: user,
                access_token: token
            })
        )
})

server.get('/oauth/google', async (request, response) => {
    const { code, state, redirect } = request.query
    let { linkAccount } = request.query
    const uri = `${DOMAIN}${parse(request.raw.url).pathname}`

    // Check if we need to redirect the user to discord auth.
    if (request.session.state !== state || !code || !state) {
        // Generating the random state.
        const state = randomBytes(15).toString('hex')
        response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?response_type=code&scope=https://www.googleapis.com/auth/userinfo.profile&state=${state}&redirect_uri=${uri}&client_id=${GOOGLE_ID}`)
        // Store the data in the secured session.
        Object.assign(request.session, { linkAccount, state, redirect })
        return
    }

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
    
    const { id, name: username, picture: avatar, locale } = await fetch(`https://www.googleapis.com/oauth2/v2/userinfo?oauth_token=${access_token}`)
    .then(x => x.json())

    request.session.state = undefined

    const { linkAccount: linkAccount_request, redirect_request } = request.session
    let user: User
    // First of all, we try to understand if there is a linkAccount token linked to this link request.
    if(linkAccount_request) {
        // We want to link an account
        // Se we have a link token represents the user's token.
        // We just have to retieve the user_id from the token.
        // Don't forget to verify the validity of the token.
        try {
            const { id: account_id } = verify(linkAccount_request, JWT_KEY) as any
            // Now we have the id corresponding to the user.
            // Let's link the acocunt!
            // but first we need to check if the account exists.
            if (db.has(`user:${account_id}`)) {
                // Let's check if the account is already linked.
                user = db.get(`user:${account_id}`)
                if (user.google) {
                    // The user already have a googne account linked.
                    // We deny the request
                    return response.code(401)
                }
                // Lets create the link info.
                user.google = { id, avatar, locale, username }
                // And we update the account in the database.
                db.set(`user:${account_id}`, user)

            } else {
                // The user doesn't have an account.
                // We deny the request.
                return response.code(401)
            }
        } catch(e) {
            // The token signature isn't ours, we deny the request.
            return response.code(401)
        }
    } else {
        // No link requested.
        user = db.filter(user => user.google && user.google.id === id)[0]
        if(!user) {
            // No user in the database
            // Let's create one!
            user = {
                google: { id, avatar, locale, username },
                id: flake.gen()
            }
            db.set(`user:${user.id}`, user)
        }
    }

    const token = sign(user, JWT_KEY)
    if(redirect_request) {
        return response.redirect(`https://${redirect_request}?token=${token}`)
    }
    response.send(
        response.serialize({
            user: user,
            access_token: token
        })
    )
})