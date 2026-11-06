import express, { Request, Response } from 'express'
import rateLimit from 'express-rate-limit'
import swaggerUi from 'swagger-ui-express'
import { graphqlHTTP } from 'express-graphql'
import { rateLimitDirective } from 'graphql-rate-limit-directive'
import { makeExecutableSchema } from '@graphql-tools/schema'

import { trackRequests } from './analytics'

import swaggerDocument from './data/swagger.json'
import characters from './data/characters.json'

export const app = express()

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

// rest api, the limiter runs inside each route so a rate limited request still
// knows which route it was for, and unknown paths do not spend the budget
apiRouterV1.get('/ultimate/characters', restLimiter, (_req: Request, res: Response) => {
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
