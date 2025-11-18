import { OpenAPIHono } from '@hono/zod-openapi'
import { ObjectId } from 'mongodb'
import { authMiddleware } from '../middleware/auth'
import { getUsersCollection } from '../db/mongo'
import type { AppEnv, JwtUserPayload } from '../types/app'

const ALLOWED_PLANS = ['FREE', 'PRO', 'ENTERPRISE'] as const
type PlanType = (typeof ALLOWED_PLANS)[number]

export const usersRoute = new OpenAPIHono<AppEnv>()

// Todas las rutas de aquí para abajo requieren estar autenticado
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

// GET /api/v1/users -> listar usuarios (para pruebas)
usersRoute.get('/', async (c) => {
  const users = getUsersCollection()

  const all = await users
    .find({}, { projection: { passwordHash: 0 } })
    .limit(50)
    .toArray()

  return c.json(all)
})

// GET /api/v1/users/:id -> detalle de un usuario
usersRoute.get('/:id', async (c) => {
  const { id } = c.req.param()

  if (!ObjectId.isValid(id)) {
    return c.json({ error: 'ID no válido' }, 400)
  }

  const userFromToken = c.get('user') as JwtUserPayload

  // Sólo permitimos acceder a tu propio usuario
  if (userFromToken.sub !== id) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const users = getUsersCollection()
  const user = await users.findOne(
    { _id: new ObjectId(id) },
    { projection: { passwordHash: 0 } }
  )

  if (!user) {
    return c.json({ error: 'Usuario no encontrado' }, 404)
  }

  return c.json(user)
})

// PATCH /api/v1/users/:id -> actualizar usuario actual
// De momento solo permitimos actualizar "name"
usersRoute.patch('/:id', async (c) => {
  const { id } = c.req.param()

  if (!ObjectId.isValid(id)) {
    return c.json({ error: 'ID no válido' }, 400)
  }

  const userFromToken = c.get('user') as JwtUserPayload

  // Sólo puedes actualizar tu propio usuario
  if (userFromToken.sub !== id) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const body = await c.req.json<{ name?: string }>()

  const updateFields: Record<string, unknown> = {}
  if (body.name !== undefined) {
    updateFields.name = body.name
  }

  if (Object.keys(updateFields).length === 0) {
    return c.json({ error: 'No hay campos para actualizar' }, 400)
  }

  updateFields.updatedAt = new Date()

  const users = getUsersCollection()
  const result = await users.findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: updateFields },
    { returnDocument: 'after', projection: { passwordHash: 0 } }
  )

  if (!result) {
    return c.json({ error: 'Usuario no encontrado' }, 404)
  }

  return c.json(result)
})

// DELETE /api/v1/users/:id -> borrar usuario actual
usersRoute.delete('/:id', async (c) => {
  const { id } = c.req.param()

  if (!ObjectId.isValid(id)) {
    return c.json({ error: 'ID no válido' }, 400)
  }

  const userFromToken = c.get('user') as JwtUserPayload

  // Sólo puedes borrarte a ti mismo
  if (userFromToken.sub !== id) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const users = getUsersCollection()
  const result = await users.deleteOne({ _id: new ObjectId(id) })

  if (result.deletedCount === 0) {
    return c.json({ error: 'Usuario no encontrado' }, 404)
  }

  return c.json({ success: true })
})

// GET /api/v1/users/me/plan -> ver el plan y add-ons del usuario actual
usersRoute.get('/me/plan', async (c) => {
  const userFromToken = c.get('user') as JwtUserPayload

  const users = getUsersCollection()
  const user = await users.findOne(
    { _id: new ObjectId(userFromToken.sub) },
    { projection: { plan: 1, addons: 1 } }
  )

  if (!user) {
    return c.json({ error: 'Usuario no encontrado' }, 404)
  }

  return c.json({
    plan: user.plan ?? 'FREE',
    addons: user.addons ?? [],
  })
})

// PATCH /api/v1/users/:id/plan -> cambiar el plan del usuario
usersRoute.patch('/:id/plan', async (c) => {
  const { id } = c.req.param()

  if (!ObjectId.isValid(id)) {
    return c.json({ error: 'ID no válido' }, 400)
  }

  const userFromToken = c.get('user') as JwtUserPayload

  // solo puedes cambiar tu propio plan
  if (userFromToken.sub !== id) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const body = await c.req.json<{ plan?: PlanType }>()

  if (!body.plan || !ALLOWED_PLANS.includes(body.plan)) {
    return c.json(
      { error: `Plan no válido. Debe ser uno de: ${ALLOWED_PLANS.join(', ')}` },
      400
    )
  }

  const users = getUsersCollection()
  const result = await users.findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: { plan: body.plan, updatedAt: new Date() } },
    { returnDocument: 'after', projection: { passwordHash: 0 } }
  )

  if (!result) {
    return c.json({ error: 'Usuario no encontrado' }, 404)
  }

  return c.json(result)
})

// PATCH /api/v1/users/:id/addons -> actualizar add-ons del usuario
usersRoute.patch('/:id/addons', async (c) => {
  const { id } = c.req.param()

  if (!ObjectId.isValid(id)) {
    return c.json({ error: 'ID no válido' }, 400)
  }

  const userFromToken = c.get('user') as JwtUserPayload

  // solo puedes cambiar tus propios add-ons
  if (userFromToken.sub !== id) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const body = await c.req.json<{ addons?: string[] }>()

  if (!Array.isArray(body.addons)) {
    return c.json({ error: 'addons debe ser un array de strings' }, 400)
  }

  const users = getUsersCollection()
  const result = await users.findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: { addons: body.addons, updatedAt: new Date() } },
    { returnDocument: 'after', projection: { passwordHash: 0 } }
  )

  if (!result) {
    return c.json({ error: 'Usuario no encontrado' }, 404)
  }

  return c.json(result)
})

