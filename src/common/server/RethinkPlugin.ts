import { Connection } from 'rethinkdb'
import { FastifyInstance } from 'fastify'

declare module 'fastify' {
    interface FastifyRequest<
      HttpRequest,
      Query = DefaultQuery,
      Params = DefaultParams,
      Headers = DefaultHeaders,
      Body = any
    > {
        rethink: Connection
    }
}