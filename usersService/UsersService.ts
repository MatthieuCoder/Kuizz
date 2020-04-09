import ServiceServer from '../ServiceServer'
import { verify } from 'jsonwebtoken'
import { Flake } from '../Flake'
import r from 'rethinkdb'

const { 
    REDIS_URL,
    JWT_KEY,
    PREFIX = '/api/questions',
    RETHINK,
    RETHINK_PASSWORD,
    RETHINK_USER,
    RETHINK_PORT,
    RETHINK_DB
 } = process.env

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

const { server } = new ServiceServer({}, { prometheus: true, healthEndpoint: true, authRequired: true }, REDIS_URL)

server.get('/api/users/:user', async (request, response) => {
    let { user } = request.params
    const currentUser = verify(request.headers['authorization'].substr(7, request.headers['authorization'].length), JWT_KEY) as User

    if(user === '@me')
        user = currentUser.id
    
    const exists = await r.db('kuizz')
                    .table('users')
                    .filter({ id: user })
                    .count()
                    .eq(1)
                    .run(db)
    if(exists) {
        const databaseUser = <User>await r.db('kuizz')
                      .table('users')
                      .filter({ id: user })
                      .nth(0)
                      .run(db)

        response.send(currentUser.id === user ? databaseUser : { id: databaseUser.id, avatar: databaseUser.avatar, username: databaseUser.username, score: databaseUser.score })
    } else {
        response.send({ error: 'Not found', code: 404 })
    }
})

server.get('/api/leaderboard', async (request, response) => {
    let users = []
    const cursor = await r.db('kuizz')
        .table('users')
        .orderBy('score')
        .limit(10)
        .run(db)
    
    cursor.each((err,databaseUser) => {
        if(!err) {
            users = [...users, { id: databaseUser.id, avatar: databaseUser.avatar, username: databaseUser.username, score: databaseUser.score }]
        }
    }, () => response.send(users))
})