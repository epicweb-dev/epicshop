declare module 'md5-hash' {
	import md5Hash from 'md5-hash'
	const md5 = md5Hash as unknown as {
		default: (str: string) => string
	}
	export default md5
}
