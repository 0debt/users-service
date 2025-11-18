import { describe, it, expect } from 'bun:test'
import { app } from '../../src/index'

const randomEmail = () => `test_${Date.now()}@example.com`

describe('Auth flow', () => {
  it('Registro, Login y /me', async () => {
    const email = randomEmail()
    const password = '123456'

    // 1) REGISTER
    const resRegister = await app.request('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        name: 'Test User',
      }),
    })

    expect(resRegister.status).toBe(201)

    // 2) LOGIN
    const resLogin = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })

    expect(resLogin.status).toBe(200)

    const { token } = await resLogin.json() as { token: string }
    expect(typeof token).toBe('string')

    // 3) /users/me
    const resMe = await app.request('/api/v1/users/me', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    expect(resMe.status).toBe(200)

    const me = await resMe.json()
    expect(me.email).toBe(email)
  })
})
