import { z } from '@hono/zod-openapi'

export const ErrorResponseSchema = z.object({
  error: z
    .string()
    .describe('Mensaje descriptivo del error que explica qué ha ocurrido')
}).openapi('ErrorResponse')


export const BadRequestResponse = {
  description: 'Petición inválida',
  content: {
    'application/json': {
      schema: ErrorResponseSchema,
      example: {
        error: 'Datos de entrada inválidos'
      }
    }
  }
}

export const UnauthorizedResponse = {
  description: 'No autorizado',
  content: {
    'application/json': {
      schema: ErrorResponseSchema,
      example: {
        error: 'Credenciales incorrectas'
      }
    }
  }
}

export const ForbiddenResponse = {
  description: 'Acceso prohibido',
  content: {
    'application/json': {
      schema: ErrorResponseSchema,
      example: {
        error: 'No tienes permisos para realizar esta acción'
      }
    }
  }
}

export const NotFoundResponse = {
  description: 'Recurso no encontrado',
  content: {
    'application/json': {
      schema: ErrorResponseSchema,
      example: {
        error: 'Recurso no encontrado'
      }
    }
  }
}

export const ConflictResponse = {
  description: 'Conflicto con el estado actual del recurso',
  content: {
    'application/json': {
      schema: ErrorResponseSchema,
      example: {
        error: 'El recurso ya existe'
      }
    }
  }
}

export const RateLimitResponse = {
  description: 'Demasiadas peticiones',
  content: {
    'application/json': {
      schema: ErrorResponseSchema,
      example: {
        error: 'Demasiados intentos. Espera un minuto.'
      }
    }
  }
}
