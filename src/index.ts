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

import express, { Request, Response } from 'express'
import rateLimit from 'express-rate-limit'
import swaggerUi from 'swagger-ui-express'
import { graphqlHTTP } from 'express-graphql'
import { rateLimitDirective } from 'graphql-rate-limit-directive'
import { makeExecutableSchema } from '@graphql-tools/schema'

import { trackRequests, shutdownAnalytics } from './analytics'

import swaggerDocument from './data/swagger.json'
import characters from './data/characters.json'

const app = express()
const PORT = process.env.PORT
if (!PORT) {
  throw new Error("PORT not defined");
}

// Behind a reverse proxy req.ip is the proxy unless we say how many hops to
// trust. This also decides what the rate limiters key on, so it is opt in.
if (process.env.TRUST_PROXY) {
  app.set('trust proxy', Number(process.env.TRUST_PROXY))
}

// analytics, on every route, before anything can short circuit the request
app.use(trackRequests)

// routers for our api
const apiRouterV1 = express.Router()
const graphqlV1Router = express.Router()

// middleware to rate limit the api
const restLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 5 minutes
  max: 20 // limit each IP to 20 requests per windowMs
})

// rest api
apiRouterV1.use(restLimiter)
apiRouterV1.get('/ultimate/characters', (_req: Request, res: Response) => {
  res.json(characters);
})
app.use('/api/v1', apiRouterV1)

// graphql api
class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitError';
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}
const { rateLimitDirectiveTypeDefs, rateLimitDirectiveTransformer } = rateLimitDirective({
  onLimit: (_resource, _context) => {
    throw new RateLimitError('Rate limit exceeded for this resource');
  }
})
const schema = makeExecutableSchema({
  typeDefs: [
    rateLimitDirectiveTypeDefs,
    `
      enum Saga {
        SSB,
        Melee,
        Brawl,
        SSB4,
      }

      enum Availability {
        Starter,
        Unlockable,
        Custom,
        Downloadable,
      }

      type Images {
        icon: String
        portrait: String
      }

      type Series {
        icon: String
        name: String
      }

      type Character {
        alsoAppearsIn: [Saga]
        availability: Availability
        images: Images
        name: String
        order: String
        series: Series
      }

      type Query {
        characters: [Character] @rateLimit(limit: 30, duration: 900)
      }
    `
  ],
  resolvers: {
    Query: {
      characters: () => {
        return characters
      }
    }
  },
})
const rateLimitedSchema = rateLimitDirectiveTransformer(schema)
graphqlV1Router.use(
  '/',
  graphqlHTTP((req, res) => ({
    schema: rateLimitedSchema,
    context: { req },
    graphiql: true,
    // Runs after execution, so the tracker can report which operation and
    // which top level fields were actually asked for.
    extensions: ({ document, operationName, result }) => {
      const operation = document?.definitions.find(
        (definition) => definition.kind === 'OperationDefinition',
      )
      const fields =
        operation?.kind === 'OperationDefinition'
          ? operation.selectionSet.selections.flatMap((selection) =>
              selection.kind === 'Field' ? [selection.name.value] : [],
            )
          : undefined

      ;(req as Request).graphqlInfo = {
        operationName,
        fields,
        errors: result?.errors?.map((error: { message: string }) => error.message),
      }

      return undefined
    },
    customFormatErrorFn: (error) => {
      if (error.message.includes('Rate limit exceeded for this resource')) {
        res.statusCode = 429;
      }

      return {
        message: error.message,
        locations: error.locations,
        path: error.path,
      };
    }
  })),
)
app.use('/graphql/v1', graphqlV1Router)

// swagger page
app.use('/', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

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