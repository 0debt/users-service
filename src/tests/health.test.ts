import { describe, it, expect } from 'bun:test'
import { app } from '../../src/index'

describe('Health endpoint', () => {
  it('Respuesta status ok', async () => {
    const res = await app.request('/api/v1/health')
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body).toEqual({ status: 'ok' })
  })
})
