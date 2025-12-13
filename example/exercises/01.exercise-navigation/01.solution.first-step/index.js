import { createServer } from 'http'

export const server = createServer((req, res) => {
	res.writeHead(200, { 'Content-Type': 'text/plain' })
	res.end('goodbye world')
})

server.listen(process.env.PORT)

export function cleanup() {
	server.close(() => process.exit(0))
}

process.on('SIGTERM', cleanup)
process.on('SIGINT', cleanup)
