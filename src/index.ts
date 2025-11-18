// src/index.ts
import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { cors } from 'hono/cors'

import { connectToDatabase } from './db/mongo'
import { authRoute } from './routes/auth'
import { usersRoute } from './routes/users'

// Nos aseguramos de conectar a la BD antes de arrancar
await connectToDatabase()

const app = new Hono()

app.use('*', logger())
app.use('*', cors())

app.get('/api/v1/health', (c) => c.json({ status: 'ok' }))

app.route('/api/v1/auth', authRoute)
app.route('/api/v1/users', usersRoute)

export default {
  port: Number(Bun.env.PORT || 3000),
  fetch: app.fetch,
}
