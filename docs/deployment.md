# Deployment

When deploying you don't want to allow users to start servers on your machine.
So you need to set the `EPICSHOP_DEPLOYED` environment variable to "true" which
will protect all routes and hide UI elements that are not needed for deployment.
This will also reference the `package.json` value for `epicshop.githubRoot` as
the root for all links to files so `<InlineFile />` and `<LaunchEditor />` will
open the files on GitHub instead of on your local machine.

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
