import { describe, it, expect } from 'bun:test'
import { app } from '../../src/index'

const randomEmail = () => `user_${Date.now()}_${Math.random()}@example.com`
const PASSWORD = '123456'

async function registerAndLogin() {
  const email = randomEmail()

  // REGISTER
  const resRegister = await app.request('/api/v1/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password: PASSWORD,
      name: 'Test User',
    }),
  })
  expect(resRegister.status).toBe(201)

  // LOGIN
  const resLogin = await app.request('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  })
  expect(resLogin.status).toBe(200)
  const { token } = (await resLogin.json()) as { token: string }

  // /users/me para conseguir el id
  const resMe = await app.request('/api/v1/users/me', {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(resMe.status).toBe(200)
  const me = await resMe.json()

  return { email, token, id: String(me._id) }
}