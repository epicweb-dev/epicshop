import { init, getEnv } from './env.server.js'

await init()
const ENV = getEnv()
;(global as any).ENV = ENV
export { ENV }
