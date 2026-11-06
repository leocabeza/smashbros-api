import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { after, before, test } from 'node:test'

import { PostHog } from 'posthog-node'

type Captured = { event: string; properties: Record<string, unknown> }

const captured: Captured[] = []
let server: Server
let baseUrl: string

before(async () => {
  process.env.POSTHOG_API_KEY = 'test'
  PostHog.prototype.capture = function (message) {
    captured.push({ event: message.event, properties: message.properties ?? {} })
  }

  const { app } = await import('./app')
  server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

after(async () => {
  server.close()
  const { shutdownAnalytics } = await import('./analytics')
  await shutdownAnalytics()
})

// The event is captured when the response finishes, which can land just after
// the client has read it.
const request = async (path: string, init?: RequestInit) => {
  const seen = captured.length
  const response = await fetch(`${baseUrl}${path}`, init)
  await response.text()

  for (let i = 0; i < 100 && captured.length === seen; i++) {
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  assert.equal(captured.length, seen + 1, `expected one event for ${path}`)

  return { response, captured: captured[seen] }
}

test('the characters route is an api request', async () => {
  const { response, captured } = await request('/api/v1/ultimate/characters?x=1')

  assert.equal(response.status, 200)
  assert.equal(captured.event, 'api_request')
  assert.equal(captured.properties.api, 'rest')
  assert.equal(captured.properties.path, '/api/v1/ultimate/characters')
  assert.equal(captured.properties.rate_limited, false)
})

test('an unknown path under /api/v1 falls back to swagger and is unmatched', async () => {
  const { response, captured } = await request('/api/v1/.env')

  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type') || '', /text\/html/)
  assert.equal(captured.event, 'unmatched_request')
  assert.equal(captured.properties.api, 'unmatched')
  assert.equal(captured.properties.path, '/api/v1/.env')
})

test('a method the route does not handle is unmatched', async () => {
  const { captured } = await request('/api/v1/ultimate/characters', { method: 'POST' })

  assert.equal(captured.event, 'unmatched_request')
})

test('the swagger page is still a docs view', async () => {
  const { response, captured } = await request('/')

  assert.equal(response.status, 200)
  assert.equal(captured.event, 'docs_viewed')
})

test('graphql calls are graphql requests', async () => {
  const { captured } = await request('/graphql/v1?query=%7Bcharacters%7Bname%7D%7D')

  assert.equal(captured.event, 'graphql_request')
})

// Runs last, it spends the whole rest budget for this client.
test('a rate limited call to the route is an api request marked as rate limited', async () => {
  // Unknown paths do not spend the budget, so this is the second call of 20.
  for (let i = 0; i < 19; i++) {
    const { response } = await request('/api/v1/ultimate/characters')
    assert.equal(response.status, 200)
  }

  const { response, captured } = await request('/api/v1/ultimate/characters')

  assert.equal(response.status, 429)
  assert.equal(captured.event, 'api_request')
  assert.equal(captured.properties.path, '/api/v1/ultimate/characters')
  assert.equal(captured.properties.rate_limited, true)
})
