import { createHash, randomBytes } from 'node:crypto'

import { PostHog } from 'posthog-node'
import type { NextFunction, Request, Response } from 'express'

const POSTHOG_API_KEY = process.env.POSTHOG_API_KEY
const POSTHOG_HOST = process.env.POSTHOG_HOST || 'https://us.i.posthog.com'
const NODE_ENV = process.env.NODE_ENV || 'dev'

// Rotating salt: we never want to be able to reverse a distinct id back to an
// IP address. It is regenerated on every boot, which is fine because we only
// care about "how many distinct clients" within a reporting window.
const SALT = process.env.ANALYTICS_SALT || randomBytes(32).toString('hex')

let client: PostHog | undefined

if (POSTHOG_API_KEY) {
  client = new PostHog(POSTHOG_API_KEY, {
    host: POSTHOG_HOST,
    // The api is low traffic, so don't sit on events for too long
    flushAt: 20,
    flushInterval: 10000,
    // Server side events opt out of geoip by default, but resolving a country
    // from the caller ip is most of the point here.
    disableGeoip: false,
  })
} else {
  console.warn('POSTHOG_API_KEY not defined, analytics are disabled')
}

// A stable-ish id for an anonymous caller, so we can count unique consumers
// without ever storing an ip address.
const consumerId = (ip: string, userAgent: string) =>
  createHash('sha256').update(`${SALT}:${ip}:${userAgent}`).digest('hex').slice(0, 32)

// Enough to tell "someone's python script" from "a browser" from "a bot",
// without pulling in a full user agent parsing dependency.
const clientKind = (userAgent: string) => {
  const ua = userAgent.toLowerCase()

  if (!ua) return 'unknown'
  if (/bot|crawler|spider|crawling|bingpreview|facebookexternalhit/.test(ua)) return 'bot'
  if (/curl|wget|httpie/.test(ua)) return 'cli'
  if (/postman|insomnia|thunder client|bruno/.test(ua)) return 'api client'
  if (/python|requests|httpx|aiohttp/.test(ua)) return 'python'
  if (/axios|node-fetch|undici|got|node\.js/.test(ua)) return 'node'
  if (/go-http-client/.test(ua)) return 'go'
  if (/java|okhttp|apache-httpclient/.test(ua)) return 'java'
  if (/ruby|faraday/.test(ua)) return 'ruby'
  if (/php|guzzle/.test(ua)) return 'php'
  if (/dart|flutter/.test(ua)) return 'dart'
  if (/mozilla|chrome|safari|firefox|edge/.test(ua)) return 'browser'

  return 'other'
}

type GraphqlInfo = {
  operationName?: string | null
  fields?: string[]
  errors?: string[]
}

// express-graphql parses the body itself, so the graphql details get stashed
// on the request from the extensions hook and picked up when the response ends.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      graphqlInfo?: GraphqlInfo
    }
  }
}

// swagger-ui serves a pile of css/js/font assets from the same mount point,
// and those are noise, not usage.
const isDocsAsset = (path: string) => /\.(css|js|png|ico|map|woff2?|ttf|svg)$/.test(path)

// The swagger page is mounted at / and so answers 200 for anything that no
// other route claimed, bot probes included. Classify off originalUrl, because
// req.baseUrl is reset once a request falls out of its router and would make
// every stray path look like someone reading the docs.
const classify = (originalUrl: string) => {
  const path = originalUrl.split('?')[0]

  if (path.startsWith('/api/v1')) return { event: 'api_request', api: 'rest', version: 'v1' }
  if (path.startsWith('/graphql/v1')) return { event: 'graphql_request', api: 'graphql', version: 'v1' }
  if (path === '/' || path === '/index.html') return { event: 'docs_viewed', api: 'docs' }

  // Nothing routes here, it is a typo or something scanning us. Worth keeping,
  // but not in with real traffic.
  return { event: 'unmatched_request', api: 'unmatched' }
}

export const trackRequests = (req: Request, res: Response, next: NextFunction) => {
  if (!client) return next()

  const startedAt = process.hrtime.bigint()

  res.on('finish', () => {
    try {
      if (isDocsAsset(req.path)) return

      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6
      const userAgent = req.get('user-agent') || ''
      const ip = req.ip || ''
      const { event, api, version } = classify(req.originalUrl)

      client!.capture({
        distinctId: consumerId(ip, userAgent),
        event,
        properties: {
          // $ip lets posthog resolve a country for us, it is dropped after
          // the lookup rather than stored on the event.
          $ip: ip,
          // These are anonymous events, we have no people to build profiles of.
          $process_person_profile: false,

          api,
          api_version: version,
          method: req.method,
          // The route template rather than the raw url, so paths group together
          path: req.route
            ? `${req.baseUrl}${req.route.path}`.replace(/\/$/, '') || '/'
            : req.originalUrl.split('?')[0],
          status_code: res.statusCode,
          duration_ms: Math.round(durationMs * 100) / 100,
          rate_limited: res.statusCode === 429,
          errored: res.statusCode >= 400,

          client_kind: clientKind(userAgent),
          user_agent: userAgent,
          referer: req.get('referer'),
          origin: req.get('origin'),

          graphql_operation_name: req.graphqlInfo?.operationName || undefined,
          graphql_fields: req.graphqlInfo?.fields,
          graphql_errors: req.graphqlInfo?.errors,

          environment: NODE_ENV,
        },
      })
    } catch (error) {
      // Analytics must never take the api down with it.
      console.error('Failed to capture analytics event', error)
    }
  })

  next()
}

export const shutdownAnalytics = async () => {
  await client?.shutdown()
}
