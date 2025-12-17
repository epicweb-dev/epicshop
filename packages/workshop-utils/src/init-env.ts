import { init, getEnv } from './env.server.ts'

await init()
const ENV = getEnv()
;(global as any).ENV = ENV
export { getEnv }
