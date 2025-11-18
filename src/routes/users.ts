import { OpenAPIHono, z } from '@hono/zod-openapi'
import { ObjectId } from 'mongodb'
import { authMiddleware } from '../middleware/auth'
import { getUsersCollection } from '../db/mongo'
import type { AppEnv, JwtUserPayload } from '../types/app'

// Planes permitidos
const ALLOWED_PLANS = ['FREE', 'PRO', 'ENTERPRISE'] as const
type PlanType = (typeof ALLOWED_PLANS)[number]

export const usersRoute = new OpenAPIHono<AppEnv>()

// Todas las rutas requieren autenticación
usersRoute.use('*', authMiddleware)

// =============================
// GET /api/v1/users/me
// =============================
usersRoute.openapi(
  {
    method: 'get',
    path: '/me',
    summary: 'Obtener datos del usuario autenticado',
    security: [{ bearerAuth: [] }],
    responses: {
      200: { description: 'Datos del usuario actual' },
      401: { description: 'No autenticado' },
      404: { description: 'Usuario no encontrado' },
    },
  },
  async (c) => {
    const userFromToken = c.get('user') as JwtUserPayload

    const users = getUsersCollection()
    const user = await users.findOne(
      { _id: new ObjectId(userFromToken.sub) },
      { projection: { passwordHash: 0 } }
    )

    if (!user) return c.json({ error: 'Usuario no encontrado' }, 404)

    return c.json(user)
  }
)

// =============================
// GET /api/v1/users
// =============================
usersRoute.openapi(
  {
    method: 'get',
    path: '/',
    summary: 'Listar usuarios (solo pruebas)',
    security: [{ bearerAuth: [] }],
    responses: {
      200: { description: 'Lista de usuarios' },
      401: { description: 'No autenticado' },
    },
  },
  async (c) => {
    const users = getUsersCollection()

    const all = await users
      .find({}, { projection: { passwordHash: 0 } })
      .limit(50)
      .toArray()

    return c.json(all)
  }
)

// =============================
// GET /api/v1/users/:id
// =============================
usersRoute.openapi(
  {
    method: 'get',
    path: '/{id}',
    summary: 'Obtener usuario logueado por ID',
    security: [{ bearerAuth: [] }],
    request: {
      params: z.object({
        id: z.string().openapi({ description: 'ID del usuario' }),
      }),
    },
    responses: {
      200: { description: 'Usuario encontrado' },
      400: { description: 'ID no válido' },
      401: { description: 'No autenticado' },
      403: { description: 'No autorizado' },
      404: { description: 'Usuario no encontrado' },
    },
  },
  async (c) => {
    const id = c.req.param('id')

    if (!id || !ObjectId.isValid(id)) {
      return c.json({ error: 'ID no válido' }, 400)
    }
    const userFromToken = c.get('user') as JwtUserPayload
    if (userFromToken.sub !== id)
      return c.json({ error: 'Forbidden' }, 403)

    const users = getUsersCollection()
    const user = await users.findOne(
      { _id: new ObjectId(id) },
      { projection: { passwordHash: 0 } }
    )

    if (!user) return c.json({ error: 'Usuario no encontrado' }, 404)

    return c.json(user)
  }
)

// =============================
// PATCH /api/v1/users/:id
// =============================
usersRoute.openapi(
  {
    method: 'patch',
    path: '/{id}',
    summary: 'Actualizar datos del usuario logueado',
    security: [{ bearerAuth: [] }],
    request: {
      params: z.object({
        id: z.string().openapi({ description: 'ID del usuario' }),
      }),
      body: {
        content: {
          'application/json': {
            schema: z
              .object({
                name: z.string().optional(),
              })
              .openapi('UpdateUserBody'),
          },
        },
      },
    },
    responses: {
      200: { description: 'Usuario actualizado' },
      400: { description: 'Datos inválidos o sin cambios' },
      401: { description: 'No autenticado' },
      403: { description: 'No autorizado' },
      404: { description: 'Usuario no encontrado' },
    },
  },
  async (c) => {
    const id = c.req.param('id')

    if (!id || !ObjectId.isValid(id)) {
      return c.json({ error: 'ID no válido' }, 400)
    }
    const userFromToken = c.get('user') as JwtUserPayload
    if (userFromToken.sub !== id)
      return c.json({ error: 'Forbidden' }, 403)

    const body = await c.req.json<{ name?: string }>()
    const updateFields: Record<string, unknown> = {}

    if (body.name !== undefined) updateFields.name = body.name

    if (Object.keys(updateFields).length === 0)
      return c.json({ error: 'No hay campos para actualizar' }, 400)

    updateFields.updatedAt = new Date()

    const users = getUsersCollection()
    const result = await users.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: updateFields },
      { returnDocument: 'after', projection: { passwordHash: 0 } }
    )

    if (!result) return c.json({ error: 'Usuario no encontrado' }, 404)

    return c.json(result)
  }
)

// =============================
// DELETE /api/v1/users/:id
// =============================
usersRoute.openapi(
  {
    method: 'delete',
    path: '/{id}',
    summary: 'Eliminar usuario logueado',
    security: [{ bearerAuth: [] }],
    request: {
      params: z.object({
        id: z.string().openapi({ description: 'ID del usuario' }),
      }),
    },
    responses: {
      200: { description: 'Usuario eliminado' },
      400: { description: 'ID no válido' },
      401: { description: 'No autenticado' },
      403: { description: 'No autorizado' },
      404: { description: 'Usuario no encontrado' },
    },
  },
  async (c) => {
    const id = c.req.param('id')

    if (!id || !ObjectId.isValid(id)) {
      return c.json({ error: 'ID no válido' }, 400)
    }
    const userFromToken = c.get('user') as JwtUserPayload
    if (userFromToken.sub !== id)
      return c.json({ error: 'Forbidden' }, 403)

    const users = getUsersCollection()
    const result = await users.deleteOne({ _id: new ObjectId(id) })

    if (result.deletedCount === 0)
      return c.json({ error: 'Usuario no encontrado' }, 404)

    return c.json({ success: true })
  }
)
