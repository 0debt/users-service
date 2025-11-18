// src/middleware/auth.ts
import type { MiddlewareHandler } from 'hono'
import { verifyJwt } from '../utils/jwt'
import type { AppEnv, JwtUserPayload } from '../types/app'

export const authMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const authHeader = c.req.header('authorization')

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const token = authHeader.slice(7)

  try {
    const payload = await verifyJwt<JwtUserPayload>(token)
    // ahora TS sabe que 'user' es JwtUserPayload
    c.set('user', payload)
    await next()
  } catch (error) {
    return c.json({ error: 'Invalid token' }, 401)
  }
}
