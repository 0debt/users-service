import { OpenAPIHono } from '@hono/zod-openapi'
import { swaggerUI } from '@hono/swagger-ui'
import type { AppEnv } from '../types/app'

export const api = new OpenAPIHono<AppEnv>()

api.openAPIRegistry.registerComponent(
  'securitySchemes',
  'bearerAuth',
  {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description: `
      Autenticación basada en JWT.

      El token debe enviarse en la cabecera:
      Authorization: Bearer <token>

      El JWT se obtiene tras un login o registro correcto.
    `,
  }
)

api.doc('/openapi.json', {
  openapi: '3.0.0',
  info: {
    title: 'Users Service API',
    version: '1.0.0',
    description: `
      API REST del microservicio de **usuarios** de la aplicación 0debt.

      Este microservicio es responsable de:
      - Registro y autenticación de usuarios
      - Gestión del perfil de usuario
      - Gestión del plan de suscripción
      - Comunicación síncrona con otros microservicios (notification-service)

      La API sigue principios REST y utiliza autenticación JWT.
    `,
  },
  servers: [
    {
      url: '/api/v1',
      description: 'Entorno de producción / API versionada v1',
    },
  ],
  security: [
    {
      bearerAuth: [],
    },
  ],
  tags: [
    {
      name: 'Auth',
      description: 'Operaciones de autenticación y registro de usuarios',
    },
    {
      name: 'Users',
      description: 'Gestión del perfil y datos del usuario',
    },
    {
      name: 'Plans',
      description: 'Gestión de planes y suscripciones',
    },
    {
      name: 'Health',
      description: 'Comprobación del estado del servicio',
    },
  ],
})

// Swagger UI
api.get('/docs', swaggerUI({ url: '/api/v1/openapi.json' }))
