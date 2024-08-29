export async function checkConnection() {
	try {
		const response = await fetch('https://www.cloudflare.com', {
			method: 'HEAD',
		})
		return response.ok
	} catch {
		return false
	}
}
