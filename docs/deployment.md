# Deployment

When deploying you don't want to allow users to start servers on your machine.
So you need to set the `EPICSHOP_DEPLOYED` environment variable to "true" which
will protect all routes and hide UI elements that are not needed for deployment.
This will also reference the `package.json` value for `epicshop.githubRoot` as
the root for all links to files so `<InlineFile />` and `<LaunchEditor />` will
open the files on GitHub instead of on your local machine.

## Mass workshop updates and Fly deploys

The `Update Workshops` workflow pushes version bumps across many `epicweb-dev/*`
workshop repos. Each push triggers that workshop's `deploy` workflow, which runs
`flyctl deploy`.

To avoid Fly machine-lease contention and health-check API timeouts during that
fan-out:

- `other/update-workshops` staggers git pushes (default 90s) while still doing
  clone/install work concurrently
- It syncs a canonical deploy workflow
  (`other/update-workshops/canonical/deploy.yml`) into each workshop's
  `.github/workflows/validate.yml`, including deploy retries and a post-deploy
  HTTP health probe (so a stopped scale-to-zero machine is not treated as
  success)
- It lengthens `epicshop/fly.yaml` HTTP/TCP health-check grace periods when
  present
- Package/fly updates are committed and pushed separately from workflow file
  changes when the token lacks `workflow` scope, so version bumps are not
  blocked; with `workflow` scope they share one commit to avoid double deploys
- Workshop deploy CI uses `SKIP_PLAYGROUND=true` during setup so typecheck/lint
  validate the workshop itself rather than a problem playground app, gives large
  lint runs an 8 GB Node heap, installs Chromium and generates Prisma clients
  for solution apps that have schemas before running solution tests via
  `epicshop/test.js ..s`, and still requires a successful Fly deploy plus HTTP
  healthcheck on main

### `WORKSHOP_UPDATE_TOKEN` requirements

`Update Workshops` authenticates to other `epicweb-dev/*` repos with the
`WORKSHOP_UPDATE_TOKEN` secret (falling back to `GITHUB_TOKEN`).

For classic personal access tokens, grant at least:

- `repo` — clone/push workshop repositories
- `workflow` — create or update `.github/workflows/*` (needed to sync the
  canonical deploy workflow)

Fine-grained PATs need repository access to the workshop repos plus **Workflows:
Read and write**.

Without `workflow` access, the updater still pushes `package.json` /
`package-lock.json` / `epicshop/fly.yaml` changes, and skips (or soft-fails)
workflow file sync with a clear log message.

If a mass update still leaves apps unhealthy, re-run each workshop's `deploy`
workflow sequentially (or with low concurrency) via `workflow_dispatch` rather
than pushing another thundering herd.

### 6.90.17 boot failure note

`@epic-web/workshop-app@6.90.17` imported `sentry-server-filters.js` from
`instrument.js` without publishing that file. Fly apps with `SENTRY_DSN` set
crashed on boot. Deployed `epicshop start` also failed to propagate the child
exit code (exited 0), so Fly's `on-failure` restart policy did not recover the
machine. Fixed in a later patch release; do not leave workshops on `6.90.17`.

## Presence App Deployment

The workshop-presence service runs on Cloudflare Workers with Durable Objects
(PartyServer). The public host is `epic-web-presence.kentcdodds.workers.dev`
(single source of truth in `packages/workshop-presence/src/presence.ts`).
Deployment is manual-only via the **Deploy Presence App** GitHub Actions
workflow (`workflow_dispatch`).

PartyKit's free hosted platform (`*.partykit.dev`) shuts down on **23 October
2026**. This service no longer uses PartyKit or `*.partykit.dev`.

### Setup

1. Create a Cloudflare API token with the **Edit Cloudflare Workers** template
2. Add repository secrets:
   - `CLOUDFLARE_API_TOKEN` — the API token
   - `CLOUDFLARE_ACCOUNT_ID` — your Cloudflare account ID
3. The Worker is served from its `workers.dev` hostname
   (`epic-web-presence.kentcdodds.workers.dev`, from `workers_dev: true` in
   `wrangler.jsonc`). No custom domain or zone permissions are needed.
4. Navigate to Actions → Deploy Presence App → Run workflow

The workflow fails clearly if either secret is missing.

### Manual Deployment

```bash
cd packages/workshop-presence
CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... npm run deploy
```

Local development:

```bash
cd packages/workshop-presence
npm run dev   # wrangler dev (default http://127.0.0.1:8787)
```

### Older workshop clients

Installed epicshop versions that still hardcode `*.kentcdodds.partykit.dev` will
lose presence after the PartyKit shutdown date until learners update. Current
clients treat presence as best-effort (empty face pile / no crash) when the host
is unreachable. There is no compatibility shim on partykit.dev.
