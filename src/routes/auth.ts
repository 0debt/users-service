import { OpenAPIHono, z } from '@hono/zod-openapi'
import { getUsersCollection } from '../db/mongo'
import { signJwt } from '../utils/jwt'
import { redis } from "../lib/redis"
import { notifyPreferencesInit } from '../lib/notificationClient'
import { ConflictResponse, UnauthorizedResponse, RateLimitResponse } from '../schemas/errors'

export const authRoute = new OpenAPIHono()

const RegisterSchema = z.object({
  email: z.string()
    .email()
    .describe('Correo electrónico único del usuario')
    .openapi({ example: 'user@example.com' }),
  password: z.string()
    .describe('Contraseña del usuario')
    .openapi({ example: 'P@ssw0rd123' }),
  name: z.string()
    .optional()
    .describe('Nombre visible del usuario')
    .openapi({ example: 'Juan Pérez' })
}).openapi('RegisterRequest')

const LoginSchema = z.object({
  email: z.string()
    .email()
    .describe('Correo electrónico del usuario')
    .openapi({ example: 'user@example.com' }),
  password: z.string()
    .describe('Contraseña del usuario')
    .openapi({ example: 'P@ssw0rd123' })
}).openapi('LoginRequest')

const TokenResponse = z.object({
  token: z.string()
    .describe('JWT para autenticación en endpoints protegidos')
    .openapi({
      example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
    })}).openapi('TokenResponse')


const RegisterResponseSchema = z.object({
  id: z.string().describe('ID del usuario'),
  email: z.string().email(),
  name: z.string().nullable(),
}).openapi('RegisterResponse')

// Register
authRoute.openapi(
  {
    method: 'post',
    path: '/register',
    summary: 'Registrar nuevo usuario',
    description: `
      Crea un nuevo usuario en el sistema.

      Flujo:
      1. Se valida que el email no exista
      2. Se cifra la contraseña
      3. Se crea el usuario con plan FREE
      4. Se inicializan preferencias en notification-service

      En caso de que el servicio de notificaciones no esté disponible,
      el registro continúa gracias al uso de un Circuit Breaker.
    `,
    tags: ['Auth'],
    request: {
      body: {
        content: {
          'application/json': {
            schema: RegisterSchema,
            example: {
              email: 'user@example.com',
              password: 'P@ssw0rd123',
              name: 'Juan Pérez'
            }
          }
        }
      }
    },
    responses: {
      201: {
        description: 'Usuario creado correctamente',
        content: {
          'application/json': {
            schema: RegisterResponseSchema,
            example: {
              id: '65f1c8c8e1b2a9...',
              email: 'user@example.com',
              name: 'Juan Pérez',
              avatar: 'https://api.dicebear.com/...'
            }
          }
        }
      },
      409: ConflictResponse
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

      if (Bun.env.TEST !== "true") {
        const notifyResult = await notifyPreferencesInit(String(result.insertedId), email)

        if (!notifyResult.ok) {
          console.warn("Notificaciones no disponibles. CircuitBreaker estado REAL:", notifyResult.state)
        }
      }

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
    description: `
      Autentica a un usuario mediante email y contraseña.

      - Genera un JWT si las credenciales son correctas
      - Incluye el plan del usuario en el token
      - Protegido mediante rate limiting usando Redis para evitar ataques de fuerza bruta
    `,
    tags: ['Auth'],
    request: {
      body: {
        content: {
          'application/json': {
            schema: LoginSchema,
            example: {
              email: 'user@example.com',
              password: 'P@ssw0rd123'
            }
          }
        }
      }
    },
    responses: {
      200: {
        description: 'Login correcto',
        content: {
          'application/json': {
            schema: TokenResponse,
            example: {
              token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
            }
          }
        }
      },
      401: UnauthorizedResponse,
      429: RateLimitResponse
    }
  },
  async (c) => {
    const body = await c.req.json()
    const { email, password } = body

    //  THROTTLING EN LOGIN (Redis) 
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

    return c.json({ token }, 200)
  }
)
