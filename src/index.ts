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
import { useApitally } from "apitally/express"
import { graphqlHTTP } from 'express-graphql'
import { rateLimitDirective } from 'graphql-rate-limit-directive'
import { makeExecutableSchema } from '@graphql-tools/schema'

import swaggerDocument from './data/swagger.json'
import characters from './data/characters.json'

const app = express()
const PORT = process.env.PORT
const APITALLY_KEY = process.env.APITALLY_KEY

if (!APITALLY_KEY) {
  throw new Error("APITALLY_KEY not defined");
}

if (!PORT) {
  throw new Error("PORT not defined");
}

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
useApitally(apiRouterV1, {
  clientId: APITALLY_KEY,
  env: NODE_ENV,
});
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

app.listen(PORT, () => console.log(`Server running on PORT ${PORT}`))