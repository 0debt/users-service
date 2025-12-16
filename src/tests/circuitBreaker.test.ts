import { CircuitBreaker } from "../lib/circuitBreaker"
import { test, expect } from "bun:test";

test("CircuitBreaker starts in CLOSED", () => {
  const breaker = new CircuitBreaker(3, 5000)
  expect(breaker.getState()).toBe("CLOSED")
})

test("CircuitBreaker goes to OPEN after 3 failures", () => {
  const breaker = new CircuitBreaker(3, 5000)

  breaker.failure()
  expect(breaker.getState()).toBe("CLOSED")

  breaker.failure()
  expect(breaker.getState()).toBe("CLOSED")

  breaker.failure()
  expect(breaker.getState()).toBe("OPEN")
})

test("CircuitBreaker goes HALF_OPEN after cooldown", async () => {
  const breaker = new CircuitBreaker(1, 100) 

  breaker.failure() 
  expect(breaker.getState()).toBe("OPEN")

  await new Promise((r) => setTimeout(r, 120))

  expect(breaker.canRequest()).toBe(true)
  expect(breaker.getState()).toBe("HALF_OPEN")
})

test("HALF_OPEN fails → returns to OPEN", () => {
  const breaker = new CircuitBreaker(1, 100)

  breaker.failure() 
  breaker.canRequest() 

  breaker.failure() 
  expect(breaker.getState()).toBe("OPEN")
})

test("HALF_OPEN success → returns to CLOSED", () => {
  const breaker = new CircuitBreaker(1, 100)

  breaker.failure() 
  breaker.canRequest()

  breaker.success()
  expect(breaker.getState()).toBe("CLOSED")
})
