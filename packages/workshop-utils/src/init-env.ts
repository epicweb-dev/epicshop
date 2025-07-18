import { init, getEnv } from '@epic-web/workshop-utils/env.server'

await init()
const ENV = getEnv()
;(global as any).ENV = ENV
export { ENV }
