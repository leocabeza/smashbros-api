# PostHog Self-driving setup report

## Summary

PostHog Self-driving is configured for this backend API. Session Replay, Error Tracking, and Support were enabled at the project level; health checks, error tracking, and support responders were enabled for the inbox.

Fresh scout configurations are picked up within about 30 minutes. Findings will begin appearing in the [Self-driving inbox](https://us.posthog.com/project/605117/inbox) as eligible data arrives.

## AI data processing

Approved by the organization-level wizard gate.

## GitHub

The PostHog GitHub App was already connected before this setup. No GitHub Issues responder was enabled because no connected tools were selected.

## Products enabled

| Product | Result | Notes |
| --- | --- | --- |
| Session Replay | Enabled but inert | This repository is a backend Node/Express API and has no `posthog-js` client runtime. Replay needs a web or mobile SDK integration that records sessions. |
| Error Tracking | Enabled but inert | The project toggle is on, but this backend uses Sentry rather than PostHog exception capture. PostHog exception capture needs an SDK integration for this runtime before it can generate issues. |
| Support | Enabled | Support tickets will begin reaching the enabled responder after an inbound email, inbox, or Slack channel is connected in PostHog. |

## Signal sources

| Signal source | Action | Source config ID |
| --- | --- | --- |
| `health_checks` / `health_issue` | Enabled | `01a09222-e189-77e3-ab86-8959e59fd1d6` |
| `error_tracking` / `issue_created` | Enabled | `01a09222-e161-76e5-8d0e-e365931a4a2b` |
| `error_tracking` / `issue_reopened` | Enabled | `01a09222-e16c-7d4a-b7c8-a25e8c3c24ca` |
| `error_tracking` / `issue_spiking` | Enabled | `01a09222-e1d5-7884-a4c5-a1ec8eb7da58` |
| `conversations` / `ticket` | Enabled | `01a09222-e1d5-7103-a6e6-d65f3e68a39b` |
| `signals_scout` / `cross_source_issue` | Left at server default | Scout findings are enabled by default; no opt-out row exists. |
| Session Replay source row | Deliberately skipped | Replay enters Self-driving through Replay Vision scanners, not the retired session-analysis source. |

## Connected tools

No external tools were selected in the connected-tools picker. The repository contains a Sentry dependency and the GitHub App is connected, but neither the Sentry nor GitHub Issues responder was enabled without selection approval.

## Scout troop

**Run budget:** 100 runs per day; 0 used today; 100 remaining. The project is enrolled in the early-access scout program. Banner: “Scouts are in early access. Each project gets up to 100 scout runs a day. Contact team-self-driving@posthog.com if you need more.”

### Active scouts

| Scout | Why it is active |
| --- | --- |
| `signals-scout-general` | Looks for cross-product issues not owned by a more specific route. |
| `signals-scout-health-checks` | Prioritizes actionable PostHog configuration and instrumentation health issues. |
| `signals-scout-observability-gaps` | Detects significant event streams that lack insight, dashboard, or alert coverage. |

### Disabled scouts

| Scout | Reason |
| --- | --- |
| `signals-scout-ai-observability` | No AI/LLM instrumentation found. |
| `signals-scout-anomaly-detection` | No established dashboards or saved insights were found for it to monitor. |
| `signals-scout-apm` | No PostHog APM/OpenTelemetry evidence found. |
| `signals-scout-conversations` | Support has no inbound channel or ticket data yet. |
| `signals-scout-csp-violations` | No CSP violation reporting was found. |
| `signals-scout-customer-analytics` | No account/group analytics evidence found. |
| `signals-scout-data-pipelines` | No CDP, batch-export, or Hog Flow evidence found. |
| `signals-scout-data-warehouse` | No warehouse source is connected. |
| `signals-scout-error-tracking` | Covered by the enabled native Error Tracking responder. |
| `signals-scout-experiments` | No active experiment evidence found. |
| `signals-scout-feature-flags` | No feature-flag usage evidence found. |
| `signals-scout-inbox-validation` | Fresh setup has no resolved Self-driving reports to validate. |
| `signals-scout-insight-alerts` | No insight-alert evidence found. |
| `signals-scout-logs` | No PostHog Logs usage evidence found. |
| `signals-scout-mcp-tool-calls` | No product need to monitor MCP telemetry was established. |
| `signals-scout-product-analytics` | No saved product funnels or flows exist yet. |
| `signals-scout-replay-vision` | No accumulated Replay Vision observations exist yet. |
| `signals-scout-revenue-analytics` | No payment or revenue integration was found. |
| `signals-scout-session-replay` | Covered by Replay Vision scanners when their templates become available. |
| `signals-scout-skills-store` | No skills-store monitoring need was established. |
| `signals-scout-surveys` | No surveys exist. |
| `signals-scout-tasks` | No PostHog Tasks usage evidence found. |
| `signals-scout-web-analytics` | This repository serves an API rather than a web property. |
| `signals-scout-web-vitals` | This repository has no browser client. |

## Custom scouts

No custom scouts were created: the proposal was declined.

Two API-specific candidates were considered because `src/analytics.ts` captures REST and GraphQL request outcomes:

- **API reliability across REST and GraphQL:** would have flagged meaningful shifts in response failures, rate limiting, latency, or traffic. This overlaps partially with the active general and observability-gap scouts, but has a more direct API response-quality discriminator.
- **GraphQL query health:** would have flagged newly concentrated or repeatedly failing GraphQL query patterns. It overlaps with the API reliability candidate and was not created.

If a future custom scout is noisy, set `emit: false` on its scout configuration in PostHog to retain dry-run behavior without sending inbox reports.

## Replay Vision scanners

No scanners were created. This repository is a backend API with no session recordings, so Replay is currently inert. The required shared Replay Vision core and two locked monitor briefs were not available in either the local skill directory or the project skills store; creating substitute prompts would not preserve their required query scopes and non-overlap safeguards.

A Replay Vision scanner is an LLM that watches individual session recordings on a schedule and pushes confirmed breakage to the inbox. It is the only component in this setup that spends Replay Vision quota; findings arrive at half weight and need corroboration before promotion into a report.

## Follow-ups

- [ ] Connect an inbound Support channel (email, inbox, or Slack) in PostHog so the enabled ticket responder can receive tickets.
- [ ] Add a browser or mobile PostHog SDK with session recording if this product gains a client application; this backend alone cannot produce session replay data.
- [ ] Configure PostHog exception capture for the backend if PostHog Error Tracking should supplement or replace the existing Sentry workflow.
- [ ] Once the shared Replay Vision scanner templates are available, create the breakage and user-frustration monitors with signal emission enabled.
- [ ] Enable a connected-tool responder later only after selecting the tool and, where applicable, connecting its warehouse source.

## What happens next

The scout coordinator should pick up the three active scouts within about 30 minutes. They draw from the verified daily budget of 100 runs. Findings cluster into reports in the Self-driving inbox, where immediately actionable findings can begin coding tasks.

## Verification

`yarn build` completed successfully after setup.

## Repository files

No application source files were modified. This report was created at `posthog-self-driving-report.md`; the successful build regenerated the existing `dist/` output.
