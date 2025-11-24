import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { cors } from 'hono/cors'

import { connectToDatabase } from './db/mongo'
import { authRoute } from './routes/auth'
import { usersRoute } from './routes/users'
import { api } from './docs/openapi'


export const app = new Hono()

app.use('*', logger())
app.use('*', cors())

app.get('/api/v1/health', (c) => c.json({ status: 'ok' }))

api.route('/auth', authRoute)
api.route('/users', usersRoute)

// Documentación
app.route('/api/v1', api)

if (!Bun.env.TEST) {
  await connectToDatabase()
}

let isDbConnected = false

export default {
  port: Number(Bun.env.PORT || 3000),
  fetch: async (req: Request, env: Record<string, unknown>) => {
    if (!isDbConnected) {
      await connectToDatabase()
      isDbConnected = true
    }
    return app.fetch(req, env)
  }
}
