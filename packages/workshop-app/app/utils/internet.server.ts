import { promises as dns } from 'node:dns'

export async function checkConnection() {
	return dns.resolve('example.com').then(
		() => true,
		() => false,
	)
}
