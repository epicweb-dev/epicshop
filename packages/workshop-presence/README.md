# @epic-web/workshop-presence

Presence (who's here) utilities for the Epic Workshop ecosystem.

This package contains:

- A shared **schema/types** module (`presence`) used by clients and servers
- A server helper (`presence.server`) that fetches and enriches presence data
  for rendering in the workshop app
- A **PartyServer** Cloudflare Worker (`src/server.ts`) that powers the hosted
  presence service at `epic-web-presence.kentcdodds.workers.dev`

## Install

```bash
npm install @epic-web/workshop-presence
```

## Usage

### Shared schema/types

```ts
import { UserSchema, type User } from '@epic-web/workshop-presence/presence'

const user = UserSchema.parse({ id: '123' }) satisfies User
```

Host constants (single source of truth):

```ts
import {
	presenceHost,
	presenceRoom,
	presenceBaseUrl,
} from '@epic-web/workshop-presence/presence'
```

### Server-side: fetch present users

```ts
import { getPresentUsers } from '@epic-web/workshop-presence/presence.server'

const users = await getPresentUsers({ request })
```

`getPresentUsers` is intended to be called from server code (it integrates with
workshop auth/preferences when available). Failures degrade to an empty user
list.

## Local development / deploy

```bash
npm run dev      # wrangler dev
npm run deploy   # wrangler deploy (needs CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID)
```

See `docs/deployment.md` for custom domain and GitHub Actions setup.

## Documentation

- Repo docs: `https://github.com/epicweb-dev/epicshop/tree/main/docs`

## License

GPL-3.0-only.
