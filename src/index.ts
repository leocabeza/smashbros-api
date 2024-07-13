import 'dotenv/config'

import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from '@sentry/profiling-node';

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
  tracesSampleRate: 1.0, //  Capture 100% of the transactions

  // Set sampling rate for profiling - this is relative to tracesSampleRate
  profilesSampleRate: 1.0,
})

import express, { Request, Response } from 'express'
import rateLimit from 'express-rate-limit'
import swaggerUi from 'swagger-ui-express'
import { useApitally } from "apitally/express";

import swaggerDocument from './data/swagger.json'
import characters from './data/characters.json'

const app = express()
const PORT = process.env.PORT
const APITALLY_KEY = process.env.APITALLY_KEY
const NODE_ENV = process.env.NODE_ENV

if (!APITALLY_KEY) {
  throw new Error("APITALLY_KEY not defined");
}

if (!PORT) {
  throw new Error("PORT not defined");
}

const apiRouterV1 = express.Router();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 5 minutes
  max: 20 // limit each IP to 20 requests per windowMs
})

apiRouterV1.use(limiter)
// @ts-expect-error: It looks like it's still going through
useApitally(apiRouterV1, {
  clientId: APITALLY_KEY,
  env: NODE_ENV,
});
apiRouterV1.get('/ultimate/characters', (_req: Request, res: Response) => {
  res.json(characters);
})
app.use('/api/v1', apiRouterV1)

app.use('/', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Add this after all routes,
// but before any and other error-handling middlewares are defined
Sentry.setupExpressErrorHandler(app);

app.listen(PORT, () => console.log(`Server running on PORT ${PORT}`))