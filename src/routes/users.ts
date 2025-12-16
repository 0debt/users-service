import { OpenAPIHono, z } from '@hono/zod-openapi'
import { ObjectId } from 'mongodb'
import { authMiddleware } from '../middleware/auth'
import { getUsersCollection } from '../db/mongo'
import type { AppEnv, JwtUserPayload } from '../types/app'
import { redis } from '../lib/redis'
import { supabase } from "../lib/supabase";

// Planes permitidos
const ALLOWED_PLANS = ['FREE', 'PRO', 'ENTERPRISE'] as const
type PlanType = (typeof ALLOWED_PLANS)[number]

export const usersRoute = new OpenAPIHono<AppEnv>()

// GET /api/v1/internal/users/:id
usersRoute.openapi(
  {
    method: 'get',
    path: '/internal/users/{id}',
    summary: 'Obtener datos internos de un usuario (solo microservicios)',
    responses: {
      200: { description: 'Datos internos del usuario' },
      400: { description: 'ID no válido' },
      404: { description: 'Usuario no encontrado' }
    },
    request: {
      params: z.object({
        id: z.string().openapi({ example: '675a1fa2923d2bd1e4cd9f12' })
      })
    }
  },
  async (c) => {
    const id = c.req.param('id')

    if (!id || !ObjectId.isValid(id)) {
      return c.json({ error: 'ID no válido' }, 400)
    }

    //Caché con Redis
    const cacheKey = `user:${id}`
    // Solo usar caché si Redis está disponible
    if (redis) {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return c.json(JSON.parse(cached));
      }
    }


    const users = getUsersCollection()
    const user = await users.findOne(
      { _id: new ObjectId(id) },
      {
        projection: {
          passwordHash: 0,
          addons: 0,
          updatedAt: 0
        }
      }
    )

    if (!user) {
      return c.json({ error: 'Usuario no encontrado' }, 404)
    }

    const response = {
      id: String(user._id),
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      plan: user.plan
    }

    //Guardar en caché
    if (redis) {
      await redis.set(cacheKey, JSON.stringify(response), "EX", 60);
    }

    return c.json(response)
  }
)

// Todas las rutas requieren autenticación
usersRoute.use('*', authMiddleware)

// GET /api/v1/users/me
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

// GET /api/v1/users
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

// GET /api/v1/users/:id
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

// PATCH /api/v1/users/:id
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

// DELETE /api/v1/users/:id
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

// GET /api/v1/users/me/plan
usersRoute.openapi(
  {
    method: 'get',
    path: '/me/plan',
    summary: 'Obtener plan y add-ons del usuario actual',
    security: [{ bearerAuth: [] }],
    responses: {
      200: { description: 'Plan y add-ons' },
      401: { description: 'No autenticado' },
      404: { description: 'Usuario no encontrado' },
    },
  },
  async (c) => {
    const userFromToken = c.get('user') as JwtUserPayload

    const users = getUsersCollection()
    const user = await users.findOne(
      { _id: new ObjectId(userFromToken.sub) },
      { projection: { plan: 1, addons: 1 } }
    )

    if (!user) return c.json({ error: 'Usuario no encontrado' }, 404)

    return c.json({
      plan: user.plan,
      addons: user.addons,
    })
  }
)

// PATCH /api/v1/users/:id/plan
usersRoute.openapi(
  {
    method: 'patch',
    path: '/{id}/plan',
    summary: 'Cambiar plan del usuario logueado',
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
                plan: z.enum(ALLOWED_PLANS),
              })
              .openapi('UpdatePlanBody'),
          },
        },
      },
    },
    responses: {
      200: { description: 'Plan actualizado' },
      400: { description: 'Plan inválido' },
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

    const body = await c.req.json<{ plan: PlanType }>()

    if (!ALLOWED_PLANS.includes(body.plan))
      return c.json(
        { error: `Plan no válido. Debe ser uno de: ${ALLOWED_PLANS.join(', ')}` },
        400
      )

    const users = getUsersCollection()
    const result = await users.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: { plan: body.plan, updatedAt: new Date() } },
      { returnDocument: 'after', projection: { passwordHash: 0 } }
    )

    if (!result) return c.json({ error: 'Usuario no encontrado' }, 404)

    return c.json(result)
  }
)

// PATCH /api/v1/users/:id/addons
usersRoute.openapi(
  {
    method: 'patch',
    path: '/{id}/addons',
    summary: 'Actualizar add-ons del usuario logueado',
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
                addons: z.array(z.string()),
              })
              .openapi('UpdateAddonsBody'),
          },
        },
      },
    },
    responses: {
      200: { description: 'Add-ons actualizados' },
      400: { description: 'Datos inválidos' },
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

    const body = await c.req.json<{ addons: string[] }>()
    if (!Array.isArray(body.addons))
      return c.json({ error: 'addons debe ser un array de strings' }, 400)

    const users = getUsersCollection()
    const result = await users.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: { addons: body.addons, updatedAt: new Date() } },
      { returnDocument: 'after', projection: { passwordHash: 0 } }
    )

    if (!result) return c.json({ error: 'Usuario no encontrado' }, 404)

    return c.json(result)
  }
)

const MAX_FILE_SIZE = 1 * 1024 * 1024 // 1MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/jpg"]

// PATCH /api/v1/users/:id/avatar
usersRoute.openapi(
  {
    method: "patch",
    path: "/{id}/avatar",
    summary: "Subir avatar del usuario",
    security: [{ bearerAuth: [] }],
    request: {
      params: z.object({
        id: z.string(),
      })
    },
    responses: {
      200: { description: "Avatar actualizado" },
      400: { description: "Archivo inválido o demasiado grande (máx 1MB). Solo JPG, PNG o WEBP." },
      403: { description: "No autorizado" },
      500: { description: "Error en servidor o Supabase" }
    }
  },
  async (c) => {
    const id = c.req.param("id");

    if (!id || !ObjectId.isValid(id)) {
      return c.json({ error: "ID no válido" }, 400)
    }
    const userFromToken = c.get("user");

    if (!userFromToken || userFromToken.sub !== id)
      return c.json({ error: "Forbidden" }, 403);

    const form = await c.req.formData();
    const file = form.get("avatar") as File | null;

    if (!file) {
      return c.json({ error: "No se envió archivo" }, 400);
    }
    // ---------- VALIDACIÓN DE TIPO ----------
    if (!ALLOWED_TYPES.includes(file.type)) {
      return c.json(
        { error: "Tipo de archivo no permitido. Solo JPG, PNG o WebP." },
        400
      )
    }

    // ---------- VALIDACIÓN DE TAMAÑO ----------
    if (file.size > MAX_FILE_SIZE) {
      return c.json(
        { error: "El archivo es demasiado grande. Máximo 1MB." },
        400
      )
    }
    const arrayBuffer = Buffer.from(await file.arrayBuffer())
    const filePath = `avatars/${id}-${Date.now()}`

    const { error } = await supabase.storage
      .from(process.env.SUPABASE_BUCKET!)
      .upload(filePath, Buffer.from(arrayBuffer), {
        contentType: file.type,
        upsert: true,
      });

    if (error) {
      console.error("Supabase upload error:", error)
      return c.json({ error: "Error al subir avatar" }, 500)
    }

    const publicUrl =
      `${process.env.SUPABASE_URL}/storage/v1/object/public/${process.env.SUPABASE_BUCKET}/${filePath}`;

    // Guardar avatar en Mongo
    const users = getUsersCollection();
    await users.updateOne(
      { _id: new ObjectId(id) },
      { $set: { avatar: publicUrl } }
    );

    return c.json({ avatar: publicUrl });
  }
);

