import { Hono } from 'hono'
import { getUsersCollection } from '../db/mongo'
import { signJwt } from '../utils/jwt'

export const authRoute = new Hono()

type RegisterBody = {
  email: string
  password: string
  name?: string
}

type LoginBody = {
  email: string
  password: string
}

// POST /api/v1/auth/register
authRoute.post('/register', async (c) => {
  const body = await c.req.json<RegisterBody>()
  const { email, password, name } = body

  if (!email || !password) {
    return c.json({ error: 'email y password son obligatorios' }, 400)
  }

  const users = getUsersCollection()

  const existing = await users.findOne({ email })
  if (existing) {
    return c.json({ error: 'Ese email ya está registrado' }, 409)
  }

  const passwordHash = await Bun.password.hash(password)

  const result = await users.insertOne({
    email,
    passwordHash,
    name: name || null,
    plan: 'free',
    addons: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  })

  return c.json({ id: result.insertedId, email, name, plan: 'free' }, 201)
})

// POST /api/v1/auth/login
authRoute.post('/login', async (c) => {
  const body = await c.req.json<LoginBody>()
  const { email, password } = body

  if (!email || !password) {
    return c.json({ error: 'email y password son obligatorios' }, 400)
  }

  const users = getUsersCollection()
  const user = await users.findOne<{ _id: any; email: string; passwordHash: string; plan?: string }>({ email })

  if (!user) {
    return c.json({ error: 'Credenciales incorrectas' }, 401)
  }

  const ok = await Bun.password.verify(password, user.passwordHash)
  if (!ok) {
    return c.json({ error: 'Credenciales incorrectas' }, 401)
  }

  const token = await signJwt({
    sub: String(user._id),
    email: user.email,
    plan: user.plan || 'free',
  })

  return c.json({ token })
})
