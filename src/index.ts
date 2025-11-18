import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { cors } from 'hono/cors'

import { connectToDatabase } from './db/mongo'
import { authRoute } from './routes/auth'
import { usersRoute } from './routes/users'
import { api } from './docs/openapi'


await connectToDatabase()

export const app = new Hono()

app.use('*', logger())
app.use('*', cors())

app.get('/api/v1/health', (c) => c.json({ status: 'ok' }))

api.route('/auth', authRoute)
api.route('/users', usersRoute)

// Documentación
app.route('/api/v1', api)

export default {
  port: Number(Bun.env.PORT || 3000),
  fetch: app.fetch,
}
