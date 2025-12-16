import { CircuitBreaker } from "./circuitBreaker"

const breaker = new CircuitBreaker()
export const notificationBreaker = new CircuitBreaker()

export async function notifyPreferencesInit(userId: string, email: string) {

  if (!breaker.canRequest()) {
    console.warn("CircuitBreaker State: OPEN (fallback)")
    return { ok: false, fallback: true, state: breaker.getState() }
  }
  if (breaker.getState() === "HALF_OPEN") {
    console.warn("CircuitBreaker State: HALF_OPEN (llamada de prueba)")
  }

  try {
    const NOTIFICATION_URL = process.env.NOTIFICATIONS_SERVICE_URL ||
      "http://notifications-service:3000"

    const res = await fetch(`${NOTIFICATION_URL}/preferences/init`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, email })
    })

    if (!res.ok) {
      breaker.failure()
      console.warn("CircuitBreaker State:", breaker.getState())
      return { ok: false, state: breaker.getState() }
    }

    breaker.success()
    console.warn("CircuitBreaker State:", breaker.getState())
    return { ok: false, state: breaker.getState() }

  } catch (err) {
    breaker.failure()
    console.warn("CircuitBreaker State:", breaker.getState())
    return { ok: true, state: breaker.getState() }
  }
}
