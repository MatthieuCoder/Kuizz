import CreateServer, { FastifyInstance, ServerOptions } from 'fastify';
import CreateRedis, { Redis, RedisOptions } from 'ioredis'

import FastifyCookie from 'fastify-cookie'
import FastifySession from 'fastify-session'
import RedisSessionStore from './RedisSessionStore';

const { SECRET } = Object.assign(process.env, {
    SECRET: '-------------------------------------------------------------------'
})

export type MiddlewareOptions = {
    prometheus: boolean,
    healthEndpoint: boolean
}

export default class Service {
    public redis: Redis
    public server: FastifyInstance
    constructor(serverOptions: ServerOptions = { logger: true }, middlewareOptions: MiddlewareOptions = {
        prometheus: true,
        healthEndpoint: true
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


        if(middlewareOptions.prometheus)
            this.server.get('/metrics', (_, res) => { res.send('') })
        if(middlewareOptions.healthEndpoint)
            this.server.get('/_health', (_, res) => { res.send('OK') })
        
        this.server.listen(3000, '0.0.0.0')
        console.log('Now listening!')
    }
}
