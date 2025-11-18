import { Hono } from 'hono'
import { ObjectId } from 'mongodb'
import { authMiddleware } from '../middleware/auth'
import { getUsersCollection } from '../db/mongo'
import type { AppEnv, JwtUserPayload } from '../types/app'

export const usersRoute = new Hono<AppEnv>()

usersRoute.use('*', authMiddleware)

// GET /api/v1/users/me
usersRoute.get('/me', async (c) => {
  const userFromToken = c.get('user') as JwtUserPayload

  const users = getUsersCollection()
  const user = await users.findOne(
    { _id: new ObjectId(userFromToken.sub) },
    { projection: { passwordHash: 0 } }
  )

  if (!user) {
    return c.json({ error: 'Usuario no encontrado' }, 404)
  }

  return c.json(user)
})
