import { init, getEnv } from '@epic-web/workshop-utils/env.server'

await init()
;(global as any).ENV = getEnv()
