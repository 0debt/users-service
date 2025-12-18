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

describe('Users endpoints', () => {
  it('Lstar usuarios con GET /users', async () => {
    const { token } = await registerAndLogin()

    const res = await app.request('/api/v1/users', {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(res.status).toBe(200)
    const list = await res.json()
    expect(Array.isArray(list)).toBe(true)
  })

  it('Obtener /users/me/plan', async () => {
    const { token } = await registerAndLogin()

    const res = await app.request('/api/v1/users/me/plan', {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(typeof data.plan).toBe('string')
    expect(Array.isArray(data.addons)).toBe(true)
  })

  it('Obtener el usuario por id', async () => {
    const { token, id, email } = await registerAndLogin()

    const res = await app.request(`/api/v1/users/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(res.status).toBe(200)
    const user = await res.json()
    expect(user.email).toBe(email)
  })

  it('Actualizar el nombre del usuario', async () => {
    const { token, id } = await registerAndLogin()

    const newName = 'Nombre Actualizado'

    const res = await app.request(`/api/v1/users/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name: newName }),
    })

    expect(res.status).toBe(200)
    const user = await res.json()
    expect(user.name).toBe(newName)
  })

  it('Actualizar plan y addons del usuario', async () => {
    const { token, id } = await registerAndLogin()

    // Cambiar plan
    const resPlan = await app.request(`/api/v1/users/${id}/plan`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ plan: 'PRO' }),
    })
    expect(resPlan.status).toBe(200)
    const updatedPlanUser = await resPlan.json()
    expect(updatedPlanUser.user.plan).toBe('PRO')

    // Cambiar addons
    const addons = ['extra-storage', 'priority-support']

    const resAddons = await app.request(`/api/v1/users/${id}/addons`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ addons }),
    })

    expect(resAddons.status).toBe(200)
    const updatedAddonsUser = await resAddons.json()
    expect(updatedAddonsUser.addons).toEqual(addons)
  })

  it('Eliminar al usuario y no permitir acceder después', async () => {
    const { token, id } = await registerAndLogin()

    // DELETE /users/:id
    const resDelete = await app.request(`/api/v1/users/${id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    expect(resDelete.status).toBe(200)
    const body = await resDelete.json()
    expect(body).toEqual({ success: true })

    const resGet = await app.request(`/api/v1/users/${id}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
    expect(resGet.status).toBe(404)
  })

  it('Error 401 en /users/me sin token', async () => {
    const res = await app.request('/api/v1/users/me')
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('Unauthorized')
  })

  it('Error 403 al acceder a /users/{id} de otro usuario', async () => {
    const user1 = await registerAndLogin()
    const user2 = await registerAndLogin()

    const res = await app.request(`/api/v1/users/${user1.id}`, {
      headers: {
        Authorization: `Bearer ${user2.token}`,
      },
    })

    expect(res.status).toBe(403)
  })

  it('Error 400 si el plan es inválido', async () => {
    const { token, id } = await registerAndLogin()

    const res = await app.request(`/api/v1/users/${id}/plan`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ plan: 'PLAN_INVALIDO' }),
    })

    expect(res.status).toBe(400)
  })

  it('Error 400 si addons no es un array', async () => {
    const { token, id } = await registerAndLogin()

    const res = await app.request(`/api/v1/users/${id}/addons`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ addons: 'no-es-un-array' } as any),
    })

    expect(res.status).toBe(400)
  })

  it('Usuario FREE no puede subir avatar (feature toggle por plan)', async () => {
    const { token, id } = await registerAndLogin()

    // Intentar subir avatar siendo FREE
    const res = await app.request(`/api/v1/users/${id}/avatar`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: (() => {
        const form = new FormData()
        const file = new File(
          [Buffer.from('fake-image-content')],
          'avatar.png',
          { type: 'image/png' }
        )
        form.append('avatar', file)
        return form
      })(),
    })

    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toContain('plan')
  })

  it('Informa que es necesario relogin tras cambiar el plan', async () => {
    const { token, id } = await registerAndLogin()

    const res = await app.request(`/api/v1/users/${id}/plan`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ plan: 'PRO' }),
    })

    const body = await res.json()
    expect(body.message).toContain('iniciar sesión')
  })
})
