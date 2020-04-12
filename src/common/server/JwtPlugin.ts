/**
 * Force the used to put a valid jwt token.
 */

import User from '../dataStructures/User'
import { FastifyInstance, FastifyError } from 'fastify'

declare module 'fastify' {
    interface FastifyRequest<
      HttpRequest,
      Query = DefaultQuery,
      Params = DefaultParams,
      Headers = DefaultHeaders,
      Body = any
    > {
        user: User
    }
}