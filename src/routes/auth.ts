import { OpenAPIHono, z } from '@hono/zod-openapi'
import { getUsersCollection } from '../db/mongo'
import { signJwt } from '../utils/jwt'
import { redis } from "../lib/redis"

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

    if (Bun.env.TEST === "true" || process.env.CI === "true") {
      return c.json({ id: result.insertedId, email, name, avatar }, 201)
    }


    // Llamada a notification-service
    try {
      const NOTIFICATIONS_SERVICE_URL =
        process.env.NOTIFICATIONS_SERVICE_URL || "http://notifications-service:3000"

      await fetch(`${NOTIFICATIONS_SERVICE_URL}/preferences/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: String(result.insertedId), email })
      })
    } catch (err) {
      console.warn("Notificaciones no disponibles (OK en tests):", err)
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
      401: { description: 'Credenciales incorrectas' },
      429: {
        description: "Demasiados intentos. Rate limit activo."
      }
    }
  },
  async (c) => {
    const body = await c.req.json()
    const { email, password } = body

    // ---------- THROTTLING EN LOGIN (Redis) ----------
    if (redis) {
      try {
        const key = `login_attempts:${email}`;
        const attempts = await redis.incr(key);

        if (attempts === 1) {
          await redis.expire(key, 60);
        }

        if (attempts > 5) {
          return c.json(
            { error: "Demasiados intentos. Espera 1 minuto." },
            429
          );
        }
      } catch (_) {
        // Si Redis falla, no afecta a /login
      }
    }



    const users = getUsersCollection()
    const user = await users.findOne({ email })
    if (!user) return c.json({ error: 'Credenciales incorrectas' }, 401)

    const ok = await Bun.password.verify(password, user.passwordHash)
    if (!ok) return c.json({ error: 'Credenciales incorrectas' }, 401)

    const token = await signJwt({
      sub: String(user._id),
      email: user.email,
      plan: user.plan,
      iss: user.plan.toLowerCase()  // "free", "pro", "enterprise"
    })

    return c.json({ token })
  }
)
