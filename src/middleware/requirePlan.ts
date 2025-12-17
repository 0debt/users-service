import type { Context, Next } from 'hono'

type AllowedPlan = 'PRO' | 'ENTERPRISE'

export const requirePlan =
  (allowedPlans: AllowedPlan[]) =>
  async (c: Context, next: Next) => {
    const user = c.get('user')

    if (!user || !allowedPlans.includes(user.plan)) {
      return c.json(
        {
          error: 'Esta funcionalidad requiere plan PRO o ENTERPRISE'
        },
        403
      )
    }

    await next()
  }
