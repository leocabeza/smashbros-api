# Unofficial Smash Bros Api

## Rest API

You can find info about endpoints available at: https://smashbrosapi.com

## Graphql API

You can find info about queries available at: https://smashbrosapi.com/graphql/v1

## Continuation of an archived project

This is the final part of https://github.com/leocabeza/smashbros-unofficial-api,
with all of the fighters, and without the name filter, the rest remains equal.
## Analytics

Usage is tracked with [PostHog](https://posthog.com). Set `POSTHOG_API_KEY` to
enable it, leave it unset and nothing is sent.

Three events are captured:

| event | when |
| --- | --- |
| `api_request` | any call under `/api/v1` |
| `graphql_request` | any call under `/graphql/v1` |
| `docs_viewed` | someone opens the swagger page |
| `unmatched_request` | a path nothing routes to, mostly bots probing |

The swagger page is mounted at `/` and answers 200 for anything no other route
claimed, so `unmatched_request` exists to keep bot probes out of `docs_viewed`.

Every event carries the path, method, status code, duration, whether it was
rate limited, and a `client_kind` (browser, python, curl, bot, ...) derived
from the user agent. Callers are counted by a salted hash of ip + user agent,
so no ip address is ever stored. `$ip` is sent to PostHog only so it can
resolve a country.

Set `TRUST_PROXY` to the number of proxy hops in front of the app, otherwise
every caller looks like the proxy to both analytics and the rate limiter.
