import { SessionStore } from 'fastify-session'
import { Redis } from 'ioredis'
import { encode, decode } from 'msgpack5'

export default class RedisSessionStore implements SessionStore {
    private redis: Redis
    public constructor(redis: Redis) {
        this.redis = redis
    }
    public set(sessionId: string, session: any, callback: (err?: Error) => void): void {
        this.redis.setBuffer(`session-${sessionId}`, encode(session), callback)
    }
    public get(sessionId: string, callback: (err?: Error, session?: any) => void): void {
        this.redis.getBuffer(`session-${sessionId}`, (err, buffer) => {
            if(err) callback(err)
            callback(null, decode(buffer))
        })   
    }
    public destroy(sessionId: string, callback: (err?: Error) => void): void {
        this.redis.del(`session-${sessionId}`)
    }
}