import { notifyPreferencesInit } from "../lib/notificationClient"
import { test, expect, beforeEach } from "bun:test";

const originalFetch = global.fetch

beforeEach(() => {
  global.fetch = originalFetch
})

test("notifyPreferencesInit returns CLOSED on first success", async () => {
    global.fetch = (() =>
    Promise.resolve(
        new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json" }
        })
    )) as any;


  const result = await notifyPreferencesInit("123", "email@test.com")
  expect(result.state).toBe("CLOSED")
})

test("notifyPreferencesInit triggers OPEN after repeated failures", async () => {
  (global.fetch as any) = () =>
    Promise.resolve(
      new Response(JSON.stringify({ error: "fail" }), {
        status: 500
      })
    );
  await notifyPreferencesInit("1", "a@test.com")
  await notifyPreferencesInit("1", "a@test.com")
  const r3 = await notifyPreferencesInit("1", "a@test.com")

  expect(r3.state).toBe("OPEN")
})

test("notifyPreferencesInit returns fallback when OPEN", async () => {
  (global.fetch as any) = () =>
    Promise.resolve(
      new Response(JSON.stringify({ error: "fail" }), {
        status: 500
      })
    );       
  await notifyPreferencesInit("1", "a@test.com")
  await notifyPreferencesInit("1", "a@test.com")
  await notifyPreferencesInit("1", "a@test.com")

  const result = await notifyPreferencesInit("1", "a@test.com")
  expect(result.fallback).toBe(true)
  expect(result.state).toBe("OPEN")
})
