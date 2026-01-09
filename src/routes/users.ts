import { OpenAPIHono, z } from '@hono/zod-openapi'
import { ObjectId } from 'mongodb'
import { authMiddleware } from '../middleware/auth'
import { getUsersCollection } from '../db/mongo'
import type { AppEnv, JwtUserPayload } from '../types/app'
import { redis } from '../lib/redis'
import { supabase } from "../lib/supabase";
import { BadRequestResponse, UnauthorizedResponse, ForbiddenResponse, NotFoundResponse } from '../schemas/errors'
import { requirePlan } from '../middleware/requirePlan'


// Planes permitidos
const ALLOWED_PLANS = ['FREE', 'PRO', 'ENTERPRISE'] as const
type PlanType = (typeof ALLOWED_PLANS)[number]

export const usersRoute = new OpenAPIHono<AppEnv>()

const UserPublicSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  email: z.string().email(),
  avatar: z.string().url(),
  plan: z.string()
}).openapi('UserPublic')


// GET /api/v1/internal/users/:id
usersRoute.openapi(
  {
    method: 'get',
    path: '/internal/users/{id}',
    summary: 'Obtener datos internos de un usuario (solo microservicios)',
    description: `
      Endpoint interno usado por otros microservicios.
      Incluye caché Redis para optimizar lecturas frecuentes.
    `,
    tags: ['Internal'],
    request: {
      params: z.object({
        id: z.string().openapi({
          example: '675a1fa2923d2bd1e4cd9f12',
          description: 'ID MongoDB del usuario'
        })
      })
    },
    responses: {
      200: {
        description: 'Datos internos del usuario',
        content: {
          'application/json': {
            schema: UserPublicSchema
          }
        }
      },
      400: BadRequestResponse,
      404: NotFoundResponse
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

// GET /api/v1/internal/search - Search user by email (internal use)
usersRoute.openapi(
  {
    method: 'get',
    path: '/internal/search',
    summary: 'Search user by email (internal use)',
    description: 'Endpoint used by other microservices to resolve emails to user IDs.',
    tags: ['Internal'],
    request: {
      query: z.object({
        email: z.string().email().openapi({ description: 'Email to search' })
      })
    },
    responses: {
      200: {
        description: 'User found',
        content: {
          'application/json': {
            schema: z.object({
              id: z.string()
            })
          }
        }
      },
      404: NotFoundResponse
    }
  },
  async (c) => {
    const email = c.req.query('email')
    if (!email) return c.json({ error: 'Email required' }, 400)

    const users = getUsersCollection()
    // Projection: only need _id
    const user = await users.findOne({ email }, { projection: { _id: 1 } })

    if (!user) return c.json({ error: 'User not found' }, 404)

    return c.json({ id: String(user._id) })
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
    description: 'Devuelve el perfil del usuario identificado por el JWT',
    tags: ['Users'],
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: 'Datos del usuario autenticado',
        content: {
          'application/json': {
            schema: z.any(),
            example: {
              _id: '675a1fa2923d2bd1e4cd9f12',
              email: 'user@example.com',
              name: 'Juan Pérez',
              avatar: 'https://api.dicebear.com/7.x/thumbs/svg?...',
              plan: 'FREE',
              addons: [],
              createdAt: '2024-12-01T10:00:00.000Z'
            }
          }
        }
      },
      401: {
        description: 'No autenticado',
        content: {
          'application/json': {
            schema: z.object({
              error: z.string()
            }),
            example: {
              error: 'Unauthorized'
            }
          }
        }
      },
      404: {
        description: 'Usuario no encontrado',
      },
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
    description: `
      Devuelve una lista de usuarios registrados en el sistema.

      Endpoint destinado únicamente a pruebas y entornos de desarrollo.
      - Requiere autenticación JWT
      - No incluye hashes de contraseña
      - Máximo 50 usuarios
    `,
    tags: ['Users'],
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: 'Lista de usuarios',
        content: {
          'application/json': {
            schema: z.array(z.any()),
            example: [
              {
                _id: '675a1fa2923d2bd1e4cd9f12',
                email: 'user1@example.com',
                name: 'Juan Pérez',
                avatar: 'https://api.dicebear.com/7.x/thumbs/svg?...',
                plan: 'FREE',
                addons: []
              },
              {
                _id: '675a1fa2923d2bd1e4cd9f13',
                email: 'user2@example.com',
                name: 'Ana Gómez',
                avatar: 'https://api.dicebear.com/7.x/thumbs/svg?...',
                plan: 'PRO',
                addons: ['analytics']
              }
            ]
          }
        }
      },
      401: {
        description: 'No autenticado',
        content: {
          'application/json': {
            schema: z.any(),
            example: {
              error: 'Unauthorized'
            }
          }
        }
      }
    }
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
    description: `
      Devuelve los datos del usuario identificado por su ID.

      Restricciones:
      - El usuario debe estar autenticado
      - Solo se permite acceder a los datos del propio usuario
      - El ID debe ser un ObjectId válido de MongoDB
      - No se incluyen datos sensibles como el hash de la contraseña
    `,
    tags: ['Users'],
    security: [{ bearerAuth: [] }],
    request: {
      params: z.object({
        id: z.string().openapi({ description: 'ID del usuario' }),
      }),
    },
    responses: {
      200: {
        description: 'Usuario encontrado',
        content: {
          'application/json': {
            schema: z.any(),
            example: {
              _id: '675a1fa2923d2bd1e4cd9f12',
              email: 'user@example.com',
              name: 'Juan Pérez',
              avatar: 'https://api.dicebear.com/7.x/thumbs/svg?...',
              plan: 'FREE',
              addons: [],
              createdAt: '2024-12-01T10:00:00.000Z'
            }
          }
        }
      },
      400: {
        description: 'ID no válido',
        content: {
          'application/json': {
            schema: z.any(),
            example: {
              error: 'ID no válido'
            }
          }
        }
      },
      401: {
        description: 'No autenticado',
        content: {
          'application/json': {
            schema: z.any(),
            example: {
              error: 'Unauthorized'
            }
          }
        }
      },
      403: {
        description: 'No autorizado',
        content: {
          'application/json': {
            schema: z.any(),
            example: {
              error: 'Forbidden'
            }
          }
        }
      },
      404: {
        description: 'Usuario no encontrado',
        content: {
          'application/json': {
            schema: z.any(),
            example: {
              error: 'Usuario no encontrado'
            }
          }
        }
      },
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
    description: `
      Permite actualizar los datos del usuario autenticado.

      Restricciones:
      - Requiere autenticación JWT
      - Solo el propio usuario puede modificar sus datos
      - El ID debe ser un ObjectId válido
    `,
    tags: ['Users'],
    security: [{ bearerAuth: [] }],
    request: {
      params: z.object({
        id: z.string().openapi({
          description: 'ID del usuario',
          example: '675a1fa2923d2bd1e4cd9f12'
        }),
      }),
      body: {
        content: {
          'application/json': {
            schema: z
              .object({
                name: z.string().optional().openapi({
                  description: 'Nuevo nombre del usuario',
                  example: 'Juan Pérez'
                }),
              })
              .openapi('UpdateUserBody'),
            example: {
              name: 'Juan Pérez'
            }
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Usuario actualizado',
        content: {
          'application/json': {
            schema: z.any(),
            example: {
              _id: '675a1fa2923d2bd1e4cd9f12',
              email: 'user@example.com',
              name: 'Juan Pérez',
              avatar: 'https://api.dicebear.com/7.x/thumbs/svg?...',
              plan: 'FREE',
              addons: [],
              updatedAt: '2024-12-10T12:00:00.000Z'
            }
          }
        }
      },
      400: {
        description: 'Datos inválidos o sin cambios',
        content: {
          'application/json': {
            schema: z.any(),
            example: {
              error: 'No hay campos para actualizar'
            }
          }
        }
      },
      401: {
        description: 'No autenticado',
        content: {
          'application/json': {
            schema: z.any(),
            example: {
              error: 'Unauthorized'
            }
          }
        }
      },
      403: {
        description: 'No autorizado',
        content: {
          'application/json': {
            schema: z.any(),
            example: {
              error: 'Forbidden'
            }
          }
        }
      },
      404: {
        description: 'Usuario no encontrado',
        content: {
          'application/json': {
            schema: z.any(),
            example: {
              error: 'Usuario no encontrado'
            }
          }
        }
      },
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
    summary: 'Eliminar usuario logueado (Orquestación SAGA)',
    description: `
      Elimina definitivamente al usuario autenticado mediante orquestación SAGA.

      Flujo SAGA:
      1. **Validación con expenses-service**: Verifica que el usuario no tenga deudas o gastos pendientes
      2. **Borrado local**: Elimina el usuario de MongoDB
      3. **Limpieza analytics-service**: Solicita eliminación de datos analíticos (best-effort)

      Restricciones:
      - Requiere autenticación JWT
      - Solo el propio usuario puede eliminar su cuenta
      - El ID debe ser un ObjectId válido
      - No se permite eliminar si hay deudas pendientes
      - La operación es irreversible
    `,
    tags: ['Users'],
    security: [{ bearerAuth: [] }],
    request: {
      params: z.object({
        id: z.string().openapi({
          description: 'ID del usuario',
          example: '675a1fa2923d2bd1e4cd9f12'
        }),
      }),
    },
    responses: {
      200: {
        description: 'Usuario eliminado correctamente',
        content: {
          'application/json': {
            schema: z.any(),
            example: {
              success: true
            }
          }
        }
      },
      400: {
        description: 'ID no válido',
        content: {
          'application/json': {
            schema: z.any(),
            example: {
              error: 'ID no válido'
            }
          }
        }
      },
      401: {
        description: 'No autenticado',
        content: {
          'application/json': {
            schema: z.any(),
            example: {
              error: 'Unauthorized'
            }
          }
        }
      },
      403: {
        description: 'No autorizado',
        content: {
          'application/json': {
            schema: z.any(),
            example: {
              error: 'Forbidden'
            }
          }
        }
      },
      404: {
        description: 'Usuario no encontrado',
        content: {
          'application/json': {
            schema: z.any(),
            example: {
              error: 'Usuario no encontrado'
            }
          }
        }
      },
      409: {
        description: 'Conflicto - Usuario tiene deudas o gastos pendientes',
        content: {
          'application/json': {
            schema: z.any(),
            example: {
              error: 'You can’t delete your account while you have outstanding debts or active charges.'
            }
          }
        }
      },
      500: {
        description: 'Error interno del servidor',
        content: {
          'application/json': {
            schema: z.any(),
            example: {
              error: 'Error checking financial status. Please try again later.'
            }
          }
        }
      },
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

    // ============================================
    // SAGA PASO 1: Validación con expenses-service
    // ============================================
    const expensesUrl = process.env.EXPENSES_SERVICE_URL || 'http://expenses-service:3000'
    try {
      const debtRes = await fetch(`${expensesUrl}/api/v1/internal/users/${id}/debtStatus`)
      if (debtRes.ok) {
        const { data } = await debtRes.json() as { data: { canDelete: boolean } }
        if (!data.canDelete) {
          return c.json({ error: 'No puedes borrar tu cuenta mientras tengas deudas o gastos activos.' }, 409)
        }
      } else if (debtRes.status !== 404) {
        // Si no es 404 (usuario sin gastos), tratar como error
        console.error(`[SAGA] expenses-service respondió con status ${debtRes.status}`)
        return c.json({ error: 'Error verificando estado financiero. Inténtalo más tarde.' }, 500)
      }
      // Si es 404, el usuario no tiene gastos registrados -> puede borrar
    } catch (err) {
      console.error('[SAGA] Error contactando expenses-service:', err)
      // Por seguridad financiera: NO dejamos borrar si no podemos verificar
      return c.json({ error: 'Error verificando estado financiero. Inténtalo más tarde.' }, 500)
    }

    // ============================================
    // SAGA PASO 2: Borrado Local (MongoDB)
    // ============================================
    const users = getUsersCollection()
    const result = await users.deleteOne({ _id: new ObjectId(id) })

    if (result.deletedCount === 0)
      return c.json({ error: 'Usuario no encontrado' }, 404)

    // ============================================
    // SAGA PASO 3: Limpieza analytics-service (Fire and Forget)
    // ============================================
    const analyticsUrl = process.env.ANALYTICS_SERVICE_URL || 'http://analytics-service:3000'
    // No bloqueamos la respuesta - ejecutamos en background
    fetch(`${analyticsUrl}/v1/internal/users/${id}`, { method: 'DELETE' })
      .then(res => {
        if (!res.ok) {
          console.error(`[SAGA][Consistency Alert] analytics-service respondió con status ${res.status} al limpiar usuario ${id}`)
        } else {
          console.log(`[SAGA] Datos analíticos del usuario ${id} eliminados correctamente`)
        }
      })
      .catch(err => {
        console.error(`[SAGA][Consistency Alert] Fallo limpieza analytics para usuario ${id}:`, err)
      })

    return c.json({ success: true })
  }
)

// GET /api/v1/users/me/plan
usersRoute.openapi(
  {
    method: 'get',
    path: '/me/plan',
    summary: 'Obtener plan y add-ons del usuario actual',
    description: `
      Devuelve el plan de precios y los add-ons activos del usuario autenticado.

      Características:
      - Requiere autenticación JWT
      - La información se obtiene a partir del usuario identificado en el token
      - Se utiliza para adaptar la funcionalidad según el plan contratado
    `,
    tags: ['Plans'],
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: 'Plan y add-ons del usuario',
        content: {
          'application/json': {
            schema: z.object({
              plan: z.string().openapi({
                description: 'Plan de precios del usuario',
                example: 'FREE'
              }),
              addons: z.array(z.string()).openapi({
                description: 'Lista de add-ons activos',
                example: ['analytics', 'priority-support']
              })
            }),
            example: {
              plan: 'PRO',
              addons: ['analytics']
            }
          }
        }
      },
      401: {
        description: 'No autenticado',
        content: {
          'application/json': {
            schema: z.any(),
            example: {
              error: 'Unauthorized'
            }
          }
        }
      },
      404: {
        description: 'Usuario no encontrado',
        content: {
          'application/json': {
            schema: z.any(),
            example: {
              error: 'Usuario no encontrado'
            }
          }
        }
      },
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
    description: `
      Permite cambiar el plan de precios del usuario autenticado.

      Restricciones:
      - Requiere autenticación JWT
      - Solo el propio usuario puede cambiar su plan
      - El plan debe ser uno de los valores permitidos
      - El ID debe ser un ObjectId válido
    `,
    tags: ['Plans'],
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
                plan: z.enum(ALLOWED_PLANS).openapi({
                  description: 'Nuevo plan de precios del usuario',
                  example: 'PRO'
                }),
              })
              .openapi('UpdatePlanBody'),
            example: {
              plan: 'PRO'
            }
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Plan actualizado correctamente',
        content: {
          'application/json': {
            schema: z.any(),
            example: {
              message: 'Plan actualizado. Vuelve a iniciar sesión para aplicar los cambios.',
              user: {
                _id: '675a1fa2923d2bd1e4cd9f12',
                email: 'user@example.com',
                name: 'Juan Pérez',
                avatar: 'https://api.dicebear.com/7.x/thumbs/svg?...',
                plan: 'PRO',
                addons: [],
                updatedAt: '2024-12-10T12:00:00.000Z'
              }
            }
          }
        }
      },
      400: {
        description: 'Plan inválido',
        content: {
          'application/json': {
            schema: z.any(),
            example: {
              error: 'Plan no válido. Debe ser uno de: FREE, PRO, ENTERPRISE'
            }
          }
        }
      },
      401: {
        description: 'No autenticado',
        content: {
          'application/json': {
            schema: z.any(),
            example: {
              error: 'Unauthorized'
            }
          }
        }
      },
      403: {
        description: 'No autorizado',
        content: {
          'application/json': {
            schema: z.any(),
            example: {
              error: 'Forbidden'
            }
          }
        }
      },
      404: {
        description: 'Usuario no encontrado',
        content: {
          'application/json': {
            schema: z.any(),
            example: {
              error: 'Usuario no encontrado'
            }
          }
        }
      },
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

    return c.json({
      message: 'Plan actualizado. Vuelve a iniciar sesión para aplicar los cambios.',
      user: result
    })
  }
)

// PATCH /api/v1/users/:id/addons
usersRoute.openapi(
  {
    method: 'patch',
    path: '/{id}/addons',
    summary: 'Actualizar add-ons del usuario logueado',
    description: `
      Permite actualizar la lista de add-ons activos del usuario autenticado.

      Restricciones:
      - Requiere autenticación JWT
      - Solo el propio usuario puede modificar sus add-ons
      - El ID debe ser un ObjectId válido
    `,
    tags: ['Plans'],
    security: [{ bearerAuth: [] }],
    request: {
      params: z.object({
        id: z.string().openapi({
          description: 'ID del usuario',
          example: '675a1fa2923d2bd1e4cd9f12'
        }),
      }),
      body: {
        content: {
          'application/json': {
            schema: z
              .object({
                addons: z.array(z.string()).openapi({
                  description: 'Lista de add-ons activos',
                  example: ['analytics', 'priority-support']
                }),
              })
              .openapi('UpdateAddonsBody'),
            example: {
              addons: ['analytics', 'priority-support']
            }
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Add-ons actualizados correctamente',
        content: {
          'application/json': {
            schema: z.any(),
            example: {
              _id: '675a1fa2923d2bd1e4cd9f12',
              email: 'user@example.com',
              name: 'Juan Pérez',
              avatar: 'https://api.dicebear.com/7.x/thumbs/svg?...',
              plan: 'PRO',
              addons: ['analytics', 'priority-support'],
              updatedAt: '2024-12-10T12:00:00.000Z'
            }
          }
        }
      },
      400: {
        description: 'Datos inválidos',
        content: {
          'application/json': {
            schema: z.any(),
            example: {
              error: 'addons debe ser un array de strings'
            }
          }
        }
      },
      401: {
        description: 'No autenticado',
        content: {
          'application/json': {
            schema: z.any(),
            example: {
              error: 'Unauthorized'
            }
          }
        }
      },
      403: {
        description: 'No autorizado',
        content: {
          'application/json': {
            schema: z.any(),
            example: {
              error: 'Forbidden'
            }
          }
        }
      },
      404: {
        description: 'Usuario no encontrado',
        content: {
          'application/json': {
            schema: z.any(),
            example: {
              error: 'Usuario no encontrado'
            }
          }
        }
      },
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

usersRoute.use(
  '/:id/avatar',
  requirePlan(["PRO", "ENTERPRISE"])
)

// PATCH /api/v1/users/:id/avatar
usersRoute.openapi(
  {
    method: "patch",
    path: "/{id}/avatar",
    summary: "Subir avatar del usuario",
    description: `
      Permite subir o actualizar el avatar del usuario autenticado.

      Funcionalidad disponible solo para usuarios con plan PRO o ENTERPRISE.

      Características:
      - Requiere autenticación JWT
      - El archivo se almacena en Supabase Storage
      - Tamaño máximo permitido: 1MB
      - Tipos permitidos: JPG, JPEG, PNG, WEBP, AVIF
      - La URL pública del avatar se guarda en MongoDB
    `,
    tags: ["Users"],
    security: [{ bearerAuth: [] }],
    request: {
      params: z.object({
        id: z.string().openapi({
          description: "ID del usuario",
          example: "675a1fa2923d2bd1e4cd9f12"
        }),
      }),
      body: {
        content: {
          "multipart/form-data": {
            schema: z.object({
              avatar: z.any().openapi({
                description: "Archivo de imagen del avatar"
              })
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Avatar actualizado correctamente",
        content: {
          "application/json": {
            schema: z.any(),
            example: {
              avatar: "https://project.supabase.co/storage/v1/object/public/avatars/675a1fa2923d2bd1e4cd9f12-1700000000"
            }
          }
        }
      },
      400: {
        description: "Archivo inválido o demasiado grande",
        content: {
          "application/json": {
            schema: z.any(),
            example: {
              error: "Extensión de imagen no válida o el archivo es demasiado grande. Máximo 1MB. Extensiones permitidas: jpg, jpeg, png, webp, avif."
            }
          }
        }
      },
      403: {
        description: "No autorizado",
        content: {
          "application/json": {
            schema: z.any(),
            example: {
              error: "Forbidden"
            }
          }
        }
      },
      500: {
        description: "Error en servidor o Supabase",
        content: {
          "application/json": {
            schema: z.any(),
            example: {
              error: "Error al subir avatar"
            }
          }
        }
      }
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
