// src/types/app.ts

// Lo que guardamos en el token y en c.get('user')
export type JwtUserPayload = {
  sub: string
  email: string
  plan?: string
}

// Tipo de entorno de Hono (Variables)
export type AppEnv = {
  Variables: {
    user: JwtUserPayload
  }
}
