import CreateServer, { FastifyInstance, ServerOptions } from 'fastify';
import CreateRedis, { Redis } from 'ioredis'
import FastifyCookie from 'fastify-cookie'
import FastifySession from 'fastify-session'
import Store from './server/RedisSessionStore'
import { connect as ConnectRethink, Connection } from 'rethinkdb'
import { verify } from 'jsonwebtoken'
import User from './dataStructures/User'
const { 
    SECRET,
    JWT_KEY,
    RETHINK,
    RETHINK_PORT,
    RETHINK_DB,
    RETHINK_PASSWORD,
    RETHINK_USER,
    REDIS
} = process.env

export type MiddlewareOptions = {
    prometheus: boolean,
    healthEndpoint: boolean,
    authRequired: boolean
}

export default class Service {
    public redis: Redis
    public server: FastifyInstance
    public rethink: Connection
    constructor(middlewareOptions: MiddlewareOptions = {
        prometheus: true,
        healthEndpoint: true,
        authRequired: true
    }) {

        this.redis = new CreateRedis(REDIS)
        this.server = CreateServer({ logger: true })
        const store = new Store()
        this.server.register(FastifyCookie)
        this.server.register(FastifySession, {
            secret: SECRET,
            cookieName: 'session_id',
            cookie: { secure: false},
            store
        } as any)
        this.server.register(require('fastify-cors'), { 
            // put your options here
        })
        if(middlewareOptions.authRequired)
        {
            this.server.decorateRequest('user', {})
            this.server.addHook('preValidation', (request, response, done) => {
                if(request.headers['authorization'] && (request.headers['authorization'] as string).startsWith('Bearer ')) {
                    const rawToken = request.headers['authorization'].substr(7, request.headers['authorization'].length)
                    try {
                        request.user = <User>verify(rawToken, JWT_KEY)
                        return done()
                    } catch(e) {}
                }
                response.code(401)
                done(new Error('Authorization needed.'))
            })
        }
        if(middlewareOptions.prometheus)
            this.server.get('/metrics', (_, res) => { res.send('') })
        if(middlewareOptions.healthEndpoint)
            this.server.get('/_health', (_, res) => { res.send('OK') })

        ConnectRethink({
            host: RETHINK,
            port: parseInt(RETHINK_PORT),
            user: RETHINK_USER,
            password: RETHINK_PASSWORD,
            db: RETHINK_DB
        }, (error, conn) => {
            if(error) process.exit(1)
            this.rethink = conn
            
            this.server.decorateRequest('rethink', {})
            this.server.addHook('preValidation', (request, _, done) => {
                request.rethink = this.rethink
                done()
            })

            console.log('CONNECTED! ', this.rethink.open)

            this.server.listen(3000, '0.0.0.0')
        })
    }
}
