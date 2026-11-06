import 'dotenv/config'

import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from '@sentry/profiling-node';

const NODE_ENV = process.env.NODE_ENV
const SENTRY_DSN = process.env.SENTRY_DSN

if (!SENTRY_DSN) {
  throw new Error("SENTRY_DSN not defined");
}

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  integrations: [
    nodeProfilingIntegration(),
  ],
  // Performance Monitoring
  tracesSampleRate: 0.1, //  Capture 100% of the transactions

  // Set sampling rate for profiling - this is relative to tracesSampleRate
  profilesSampleRate: 0.1,
  environment: NODE_ENV || 'dev',
})

import { app } from './app'
import { shutdownAnalytics } from './analytics'

const PORT = process.env.PORT
if (!PORT) {
  throw new Error("PORT not defined");
}

// Add this after all routes,
// but before any and other error-handling middlewares are defined
Sentry.setupExpressErrorHandler(app);

const server = app.listen(PORT, () => console.log(`Server running on PORT ${PORT}`))

// posthog batches events, so give it a chance to send what is queued
const shutdown = async (signal: string) => {
  console.log(`Received ${signal}, shutting down`)
  server.close()
  await shutdownAnalytics()
  process.exit(0)
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))