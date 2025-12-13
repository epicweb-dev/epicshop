# @epic-web/workshop-presence

Presence (who’s here) utilities for the Epic Workshop ecosystem.

This package contains:

- A shared **schema/types** module (`presence`) used by clients and servers
- A server helper (`presence.server`) that fetches and enriches presence data
  for rendering in the workshop app
- A PartyKit server implementation (used by the hosted presence service)

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

### Server-side: fetch present users

```ts
import { getPresentUsers } from '@epic-web/workshop-presence/presence.server'

const users = await getPresentUsers({ request })
```

`getPresentUsers` is intended to be called from server code (it integrates with
workshop auth/preferences when available).

## Documentation

- Repo docs: `https://github.com/epicweb-dev/epicshop/tree/main/docs`

## License

GPL-3.0-only.
