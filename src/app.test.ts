import assert from 'node:assert/strict'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { after, before, mock, test } from 'node:test'
import { setTimeout } from 'node:timers/promises'

import { PostHog } from 'posthog-node'

const capture = mock.method(PostHog.prototype, 'capture', () => {})
let server: Server
let baseUrl: string

before(async () => {
  process.env.POSTHOG_API_KEY = 'test'

  const { app } = await import('./app')
  server = app.listen(0)
  await once(server, 'listening')
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
  const seen = capture.mock.callCount()
  const response = await fetch(`${baseUrl}${path}`, init)
  await response.text()

  for (let i = 0; i < 100 && capture.mock.callCount() === seen; i++) {
    await setTimeout(10)
  }
  assert.equal(capture.mock.callCount(), seen + 1, `expected one event for ${path}`)

  const { event, properties = {} } = capture.mock.calls[seen].arguments[0]!
  return { response, event, properties }
}

test('the characters route is an api request', async () => {
  const { response, event, properties } = await request('/api/v1/ultimate/characters?x=1')

  assert.equal(response.status, 200)
  assert.equal(event, 'api_request')
  assert.equal(properties.api, 'rest')
  assert.equal(properties.path, '/api/v1/ultimate/characters')
  assert.equal(properties.rate_limited, false)
})

test('an unknown path under /api/v1 falls back to swagger and is unmatched', async () => {
  const { response, event, properties } = await request('/api/v1/.env')

  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type') || '', /text\/html/)
  assert.equal(event, 'unmatched_request')
  assert.equal(properties.api, 'unmatched')
  assert.equal(properties.path, '/api/v1/.env')
})

test('a method the route does not handle is unmatched', async () => {
  const { event } = await request('/api/v1/ultimate/characters', { method: 'POST' })

  assert.equal(event, 'unmatched_request')
})

test('the swagger page is still a docs view', async () => {
  const { response, event } = await request('/')

  assert.equal(response.status, 200)
  assert.equal(event, 'docs_viewed')
})

test('graphql calls are graphql requests', async () => {
  const { event } = await request('/graphql/v1?query=%7Bcharacters%7Bname%7D%7D')

  assert.equal(event, 'graphql_request')
})

// Runs last, it spends the whole rest budget for this client.
test('a rate limited call to the route is an api request marked as rate limited', async () => {
  let result = await request('/api/v1/ultimate/characters')
  for (let i = 0; i < 25 && result.response.status === 200; i++) {
    result = await request('/api/v1/ultimate/characters')
  }

  assert.equal(result.response.status, 429)
  assert.equal(result.event, 'api_request')
  assert.equal(result.properties.path, '/api/v1/ultimate/characters')
  assert.equal(result.properties.rate_limited, true)
})
