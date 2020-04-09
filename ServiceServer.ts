import CreateServer, { FastifyInstance, ServerOptions } from 'fastify';
import CreateRedis, { Redis, RedisOptions } from 'ioredis'

import FastifyCookie from 'fastify-cookie'
import FastifySession from 'fastify-session'
import RedisSessionStore from './RedisSessionStore';
import { verify } from 'jsonwebtoken';

const { SECRET, JWT_KEY } = process.env

export type MiddlewareOptions = {
    prometheus: boolean,
    healthEndpoint: boolean,
    authRequired: boolean
}

export default class Service {
    public redis: Redis
    public server: FastifyInstance
    constructor(serverOptions: ServerOptions = { logger: true }, middlewareOptions: MiddlewareOptions = {
        prometheus: true,
        healthEndpoint: true,
        authRequired: true
    }, redisOptions: any) {

        this.redis = new CreateRedis(redisOptions)
        this.server = CreateServer(serverOptions)

        const store = new RedisSessionStore(this.redis)

        this.server.register(FastifyCookie)
        this.server.register(FastifySession, {
            secret: SECRET,
            cookieName: 'session_id',
            cookie: { secure: false }
        })
        this.server.register(require('fastify-cors'), { 
            // put your options here
        })


        if(middlewareOptions.prometheus)
            this.server.get('/metrics', (_, res) => { res.send('') })
        if(middlewareOptions.healthEndpoint)
            this.server.get('/_health', (_, res) => { res.send('OK') })
        if(middlewareOptions.authRequired)
            this.server.use((request, response, next) => {
                const header = request.headers['authorization']
                if(header && header.startsWith('Bearer ')) {
                    const token = header.substr(7, header.length)
                    try {
                        verify(token, JWT_KEY)
                        next()
                        return
                    } catch(e) {}
                }
                response.statusCode = 401
                response.end({ error: 'Authorization required.', code: 401 })
            })
        this.server.listen(3000, '0.0.0.0')
        console.log('Now listening!')
    }
}
