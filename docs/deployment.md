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
  changes, so a missing `workflow` PAT scope cannot block version bumps

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

The workshop-presence app is deployed to PartyKit/Cloudflare using a GitHub
Actions workflow. The deployment is manual-only and can be triggered from the
Actions tab in GitHub.

### Setup

1. Create a PartyKit account and generate an API token
2. Add the token as a GitHub secret named `PARTYKIT_TOKEN` in the repository
   settings
3. Navigate to Actions > Deploy Presence App > Run workflow

### Manual Deployment

To manually deploy the presence app from your local machine:

```bash
cd packages/workshop-presence
npm run deploy
```

You'll need to have the `PARTYKIT_TOKEN` environment variable set locally.
