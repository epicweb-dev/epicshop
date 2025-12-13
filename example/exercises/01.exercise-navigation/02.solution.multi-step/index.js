import { createServer } from 'http'

const html = /* html */ `
<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Counter App</title>
	<style>
		body {
			font-family: system-ui, -apple-system, sans-serif;
			display: flex;
			justify-content: center;
			align-items: center;
			min-height: 100vh;
			margin: 0;
			background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		}
		.container {
			background: white;
			padding: 3rem;
			border-radius: 1rem;
			box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
			text-align: center;
		}
		h1 {
			margin: 0 0 2rem 0;
			color: #333;
		}
		.count {
			font-size: 4rem;
			font-weight: bold;
			color: #667eea;
			margin: 2rem 0;
		}
		button {
			font-size: 1.25rem;
			padding: 1rem 2rem;
			border: none;
			border-radius: 0.5rem;
			background: #667eea;
			color: white;
			cursor: pointer;
			transition: all 0.2s;
			font-weight: 600;
		}
		button:hover {
			background: #5568d3;
			transform: translateY(-2px);
			box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
		}
		button:active {
			transform: translateY(0);
		}
	</style>
</head>
<body>
	<div class="container">
		<h1>Counter App</h1>
		<div class="count" id="count">0</div>
		<button id="increment">Increment</button>
	</div>
	<script>
		let count = 0;
		const countElement = document.getElementById('count')
		const button = document.getElementById('increment')
		
		button.addEventListener('click', () => {
			count++
			countElement.textContent = count
		});
	</script>
</body>
</html>
`

export const server = createServer((req, res) => {
	res.writeHead(200, { 'Content-Type': 'text/html' })
	res.end(html)
})

server.listen(process.env.PORT)

export function cleanup() {
	server.close(() => process.exit(0))
}

process.on('SIGTERM', cleanup)
process.on('SIGINT', cleanup)
