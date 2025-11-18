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
  }
)

api.doc('/openapi.json', {
  openapi: '3.0.0',
  info: {
    title: 'Users Service API',
    version: '1.0.0',
    description: 'API del microservicio de usuarios',
  },
  servers: [
    {
      url: '/api/v1',
      description: 'API base path',
    },
  ],
  security: [
    {
      bearerAuth: [],
    },
  ],
})

// Swagger UI
api.get('/docs', swaggerUI({ url: '/api/v1/openapi.json' }))
