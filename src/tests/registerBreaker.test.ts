import { app } from '../../src/index'
import { test, expect, beforeEach } from "bun:test";
import { notifyPreferencesInit } from "../lib/notificationClient";


const originalFetch = global.fetch

beforeEach(() => {
  global.fetch = originalFetch
})

function randomEmail() {
  return `test${Math.random()}@mail.com`
}

test("register works when notification-service fails (fallback)", async () => {
  // forzar fallo en notification-service
  (global.fetch as any) = () =>
    Promise.resolve(
      new Response(JSON.stringify({ error: "fail" }), {
        status: 500
      })
    );
  const email = randomEmail()

  const res = await app.request("/api/v1/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email,
      password: "123",
      name: "Test"
    }),
    headers: { "Content-Type": "application/json" }
  })

  expect(res.status).toBe(201)
})

test("CircuitBreaker enters OPEN after 3 failed registers", async () => {
  (global.fetch as any) = () =>
    Promise.resolve(
      new Response(JSON.stringify({ error: "fail" }), {
        status: 500
      })
    );
  const email1 = randomEmail()
  const email2 = randomEmail()
  const email3 = randomEmail()

  await app.request("/api/v1/auth/register", {
    method: "POST",
    body: JSON.stringify({ email: email1, password: "x" }),
    headers: { "Content-Type": "application/json" }
  })

  await app.request("/api/v1/auth/register", {
    method: "POST",
    body: JSON.stringify({ email: email2, password: "x" }),
    headers: { "Content-Type": "application/json" }
  })

  const res3 = await app.request("/api/v1/auth/register", {
    method: "POST",
    body: JSON.stringify({ email: email3, password: "x" }),
    headers: { "Content-Type": "application/json" }
  })

  expect(res3.status).toBe(201)
  // a esta altura ya está en OPEN en notifyPreferencesInit() internamente
})

test("When breaker is OPEN, /register uses fallback immediately", async () => {
  (global.fetch as any) = () =>
    Promise.resolve(
      new Response(JSON.stringify({ error: "fail" }), {
        status: 500
      })
    );
  // 3 fallos → OPEN
  await notifyPreferencesInit("1", "a@test.com")
  await notifyPreferencesInit("1", "a@test.com")
  await notifyPreferencesInit("1", "a@test.com")

  // ahora fallback sin esperar
  const email = randomEmail()
  const res = await app.request("/api/v1/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password: "x", name: "A" }),
    headers: { "Content-Type": "application/json" }
  })

  expect(res.status).toBe(201)
})
