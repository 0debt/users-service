import { OpenAPIHono, z } from '@hono/zod-openapi'
import { getUsersCollection } from '../db/mongo'
import { signJwt } from '../utils/jwt'

export const authRoute = new OpenAPIHono()

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  name: z.string().optional()
}).openapi('RegisterRequest')

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string()
}).openapi('LoginRequest')

const TokenResponse = z.object({
  token: z.string()
}).openapi('TokenResponse')

// Register
authRoute.openapi(
  {
    method: 'post',
    path: '/register',
    summary: 'Registrar nuevo usuario',
    request: {
      body: {
        content: {
          'application/json': { schema: RegisterSchema }
        }
      }
    },
    responses: {
      201: { description: 'Usuario creado' },
      409: { description: 'Email ya registrado' }
    }
  },
  async (c) => {
    const body = await c.req.json()
    const { email, password, name } = body

    const users = getUsersCollection()
    const existing = await users.findOne({ email })
    if (existing) {
      return c.json({ error: 'Ese email ya está registrado' }, 409)
    }

    const passwordHash = await Bun.password.hash(password)

    const avatar = `https://api.dicebear.com/7.x/thumbs/svg?seed=${encodeURIComponent(
      name || email
    )}`

    const result = await users.insertOne({
      email,
      passwordHash,
      name: name || null,
      avatar,
      plan: 'FREE',
      addons: [],
      createdAt: new Date(),
      updatedAt: new Date()
    })

    if (Bun.env.TEST === 'true') {
      // En CI/test no llamamos a ningún microservicio
      return c.json({ id: result.insertedId, email, name, avatar }, 201)
    }

    //Llamada a notification-service
    try {

      await fetch("http://notifications-service:3000/preferences/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: String(result.insertedId) })
      })
    } catch (err) {
      console.warn("Para no romper tests")
    }
    return c.json({ id: result.insertedId, email, name, avatar }, 201)
  }
)

// Login
authRoute.openapi(
  {
    method: 'post',
    path: '/login',
    summary: 'Iniciar sesión',
    request: {
      body: {
        content: {
          'application/json': { schema: LoginSchema }
        }
      }
    },
    responses: {
      200: {
        description: 'Login correcto',
        content: { 'application/json': { schema: TokenResponse } }
      },
      401: { description: 'Credenciales incorrectas' }
    }
  },
  async (c) => {
    const body = await c.req.json()
    const { email, password } = body

    const users = getUsersCollection()
    const user = await users.findOne({ email })
    if (!user) return c.json({ error: 'Credenciales incorrectas' }, 401)

    const ok = await Bun.password.verify(password, user.passwordHash)
    if (!ok) return c.json({ error: 'Credenciales incorrectas' }, 401)

    const token = await signJwt({
      sub: String(user._id),
      email: user.email,
      plan: user.plan
    })

    return c.json({ token })
  }
)
