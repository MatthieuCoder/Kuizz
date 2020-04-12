import ServiceServer from '../common/ServiceServer'
import r from 'rethinkdb'
import Flake from '../common/utils/Flake'
import User, { AvatarSource } from '../common/dataStructures/User'
import Role, { getRoles, ROLES_ENUM } from '../common/dataStructures/Role'

// The flake service for generating ids.
const flake = new Flake

const authHeadersSchema = {
    type: 'object',
    properties: {
        'authorization': { type: 'string' }
    },
    required: ['authorization']
}

const { server } = new ServiceServer({ prometheus: true, healthEndpoint: true, authRequired: true })

server.get('/api/users/:user', {
    schema: {
        headers: authHeadersSchema,
        params: {
            user: { type: 'string' }
        }
    }
}, async (request, response) => {
    let { user } = request.params
    if(user === '@me')
        user = request.user.id
    const exists = await r.db('kuizz')
                    .table('users')
                    .filter({ id: user })
                    .count()
                    .eq(1)
                    .run(request.rethink)
    
    if(exists) {
        let databaseUser = <User>await r.db('kuizz')
                      .table('users')
                      .filter({ id: user })
                      .nth(0)
                      .run(request.rethink)
        let ret
        if(!(databaseUser.id === request.user.id || getRoles(request.user.roles).some(x => x.bit === ROLES_ENUM.Administrator.bit))) {
            ret = { 
                ...databaseUser,
                discord: null,
                google: null,
                locale: null,
                avatarSource: null,
                roles: getRoles(databaseUser.roles),
                avatar: ( databaseUser.avatarSource === AvatarSource.Discord ? databaseUser.discord.id : databaseUser.google.avatar )
            }
        } else {
            ret = {
                ...databaseUser,
                roles: getRoles(databaseUser.roles)
            }
        }
        response.send(ret)
    } else {
        response.send({ error: 'Not found', code: 404 })
    }
})

server.get('/api/users/leaderboard',{
    schema: {
        headers: authHeadersSchema
    }
}, async (request, response) => {
    let users = []
    const cursor = await r.db('kuizz')
        .table('users')
        .orderBy((d) => (d.wins / d.lost) || 0)
        .limit(10)
        .run(request.rethink)
    
    cursor.each((err,databaseUser) => {
        if(!err) {
            users = [...users, { 
                ...databaseUser,
                discord: null,
                google: null,
                locale: null,
                avatarSource: null,
                roles: getRoles(databaseUser.roles),
                avatar: ( databaseUser.avatarSource === AvatarSource.Discord ? databaseUser.discord.id : databaseUser.google.avatar )
            }]
        }
    }, () => response.send(users))
})

server.delete('/api/users/:user', {
    schema: {
        headers: authHeadersSchema,
        params: {
            user: { type: 'string' }
        }
    }
}, async (request, response) => { 
    let { user } = request.params
    if(user === '@me')
        user = request.user.id
    
    if(user === request.user.id || getRoles(request.user.roles).some(x => x.bit === ROLES_ENUM.Administrator.bit || x.bit === ROLES_ENUM.Moderator.bit)) {
        await r.db('kuizz')
                .table('users')
                .filter({ id: user })
                .delete()
                .run(request.rethink)
        response.send({
            code: 200
        })
    } else {
        response.code(401)
        response.send({
            code: 401,
            message: 'Unauthorized.'
        })
    }
})


server.post('/api/user/reputation', (request, response) => {

})