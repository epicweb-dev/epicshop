import path from 'path'
import {
	getAppByName,
	getExercise,
	isExampleApp,
	isExerciseStepApp,
	isPlaygroundApp,
	isProblemApp,
	isSolutionApp,
} from '@epic-web/workshop-utils/apps.server'
import { getWorkshopConfig } from '@epic-web/workshop-utils/config.server'
import {
	getServerTimeHeader,
	makeTimings,
} from '@epic-web/workshop-utils/timing.server'
import fsExtra from 'fs-extra'
import { redirect, type LoaderFunctionArgs } from 'react-router'
import { ensureUndeployed, getBaseUrl } from '#app/utils/misc.tsx'
import { resolveApps } from './__utils.ts'

export async function loader({ request, params }: LoaderFunctionArgs) {
	ensureUndeployed()
	const timings = makeTimings('app')
	const { fileApp, app } = await resolveApps({ request, params, timings })
	const baseApp = isPlaygroundApp(app) ? await getAppByName(app.appName) : app
	if (!fileApp || !app) {
		throw new Response(`Apps not found`, { status: 404 })
	}
	if (app.dev.type === 'script') {
		return redirect(getBaseUrl({ request, port: app.dev.portNumber }), {
			headers: { 'Server-Timing': getServerTimeHeader(timings) },
		})
	}
	if (app.dev.type !== 'browser' && app.dev.type !== 'export') {
		throw new Response(
			`App "${app.name}" is not a browser or export app, its dev type is: "${app.dev.type}"`,
			{ status: 400 },
		)
	}
	const htmlFile = path.join(app.fullPath, 'index.html')
	const hasHtml = await fsExtra.pathExists(htmlFile)
	if (hasHtml) {
		const html = await fsExtra.readFile(htmlFile)
		return new Response(html, {
			headers: {
				'Content-Length': Buffer.byteLength(html).toString(),
				'Content-Type': 'text/html',
				'Server-Timing': getServerTimeHeader(timings),
			},
		})
	}
	const indexFiles = (await fsExtra.readdir(app.fullPath)).filter(
		(file: string) => file.startsWith('index.'),
	)
	const indexCss = indexFiles.find((file: string) => file.endsWith('index.css'))
	const indexJs = indexFiles.find((file: string) => file.endsWith('index.js'))
	const indexTs = indexFiles.find((file: string) => file.endsWith('index.ts'))
	const indexTsx = indexFiles.find((file: string) => file.endsWith('index.tsx'))
	const scripts = [indexJs, indexTs, indexTsx].filter(Boolean)
	if (scripts.length > 1) {
		throw new Response(
			`Only one index.(js|ts|tsx) file is allowed, found ${scripts.join(', ')}`,
			{ status: 400 },
		)
	}
	const appTitle = app.title
	const { title: workshopTitle } = getWorkshopConfig()
	const baseAppTitle = isExerciseStepApp(baseApp)
		? [
				`${baseApp.stepNumber.toString().padStart(2, '0')}. ${baseApp.title}`,
				`${baseApp.exerciseNumber.toString().padStart(2, '0')}. ${
					(await getExercise(baseApp.exerciseNumber, { request, timings }))
						?.title ?? 'Unknown'
				}`,
				workshopTitle,
			]
		: [baseApp?.title ?? 'N/A']
	const title = (
		isExerciseStepApp(app)
			? [
					isProblemApp(app) ? '💪' : isSolutionApp(app) ? '🏁' : null,
					...baseAppTitle,
				]
			: isPlaygroundApp(app)
				? ['🛝', ...baseAppTitle]
				: isExampleApp(app)
					? ['📚', ...baseAppTitle]
					: [appTitle]
	)
		.filter(Boolean)
		.join(' | ')

	// Generate different HTML for export apps vs browser apps
	const isExportApp = app.dev.type === 'export'
	const html = isExportApp
		? generateExportAppHtml({
				pathname: app.dev.pathname,
				title,
				indexCss,
				scripts,
			})
		: generateBrowserAppHtml({
				pathname: app.dev.pathname,
				title,
				indexCss,
				scripts,
			})

	return new Response(html, {
		headers: {
			'Content-Length': Buffer.byteLength(html).toString(),
			'Content-Type': 'text/html',
			'Server-Timing': getServerTimeHeader(timings),
		},
	})
}

function generateBrowserAppHtml({
	pathname,
	title,
	indexCss,
	scripts,
}: {
	pathname: string
	title: string
	indexCss: string | undefined
	scripts: Array<string>
}) {
	return /* html */ `
<!DOCTYPE html>
<html>
	<head>
		<base href="${pathname}" />
		<meta charset="utf-8">
		<meta name="viewport" content="width=device-width, initial-scale=1">
		<title>${title}</title>
		<link rel="stylesheet" href="/app-default.css">
		${indexCss ? `<link rel="stylesheet" href="${indexCss}">` : ''}
	</head>
	<body>
		${scripts
			.map((script) => `<script type="module" src="${script}"></script>`)
			.join('\n')}
		<script type="module" src="epic_ws.js"></script>
	</body>
</html>
`
}

function generateExportAppHtml({
	pathname,
	title,
	indexCss,
	scripts,
}: {
	pathname: string
	title: string
	indexCss: string | undefined
	scripts: Array<string>
}) {
	const scriptFile = scripts[0] || 'index.js'

	return /* html */ `
<!DOCTYPE html>
<html>
	<head>
		<base href="${pathname}" />
		<meta charset="utf-8">
		<meta name="viewport" content="width=device-width, initial-scale=1">
		<title>${title}</title>
		<link rel="stylesheet" href="/app-default.css">
		<link rel="stylesheet" href="/export-app.css">
		${indexCss ? `<link rel="stylesheet" href="${indexCss}">` : ''}
	</head>
	<body>
		<div id="epicshop-export-app-root">
			<div id="epicshop-console-output">
				<h2>Console Output</h2>
				<div id="epicshop-console-entries"></div>
			</div>
			<div id="epicshop-exports">
				<h2>Exports</h2>
				<div id="epicshop-exports-entries"></div>
			</div>
		</div>
		<script type="module">
			// Hijack console methods to capture output
			const consoleEntriesEl = document.getElementById('epicshop-console-entries');
			const exportsEntriesEl = document.getElementById('epicshop-exports-entries');

			const originalConsole = {
				log: console.log.bind(console),
				warn: console.warn.bind(console),
				error: console.error.bind(console),
				info: console.info.bind(console),
				debug: console.debug.bind(console),
			};

			function formatValue(value, seen = new WeakSet()) {
				if (value === null) return '<span class="value-null">null</span>';
				if (value === undefined) return '<span class="value-undefined">undefined</span>';

				const type = typeof value;

				if (type === 'string') {
					return '<span class="value-string">"' + escapeHtml(value) + '"</span>';
				}
				if (type === 'number') {
					return '<span class="value-number">' + value + '</span>';
				}
				if (type === 'boolean') {
					return '<span class="value-boolean">' + value + '</span>';
				}
				if (type === 'bigint') {
					return '<span class="value-bigint">' + value + 'n</span>';
				}
				if (type === 'symbol') {
					return '<span class="value-symbol">' + value.toString() + '</span>';
				}
				if (type === 'function') {
					const name = value.name || 'anonymous';
					return '<span class="value-function">[Function: ' + escapeHtml(name) + ']</span>';
				}

				if (type === 'object') {
					if (seen.has(value)) {
						return '<span class="value-circular">[Circular]</span>';
					}
					seen.add(value);

					if (Array.isArray(value)) {
						if (value.length === 0) return '<span class="value-array">[]</span>';
						const items = value.map(v => formatValue(v, seen)).join(', ');
						return '<span class="value-array">[' + items + ']</span>';
					}

					if (value instanceof Error) {
						return '<span class="value-error">' + escapeHtml(value.stack || value.message) + '</span>';
					}

					if (value instanceof Date) {
						return '<span class="value-date">' + value.toISOString() + '</span>';
					}

					if (value instanceof RegExp) {
						return '<span class="value-regexp">' + value.toString() + '</span>';
					}

					// Plain object
					const keys = Object.keys(value);
					if (keys.length === 0) return '<span class="value-object">{}</span>';
					const entries = keys.map(key => {
						return '<span class="value-key">' + escapeHtml(key) + '</span>: ' + formatValue(value[key], seen);
					}).join(', ');
					return '<span class="value-object">{ ' + entries + ' }</span>';
				}

				return escapeHtml(String(value));
			}

			function escapeHtml(str) {
				return str
					.replace(/&/g, '&amp;')
					.replace(/</g, '&lt;')
					.replace(/>/g, '&gt;')
					.replace(/"/g, '&quot;')
					.replace(/'/g, '&#039;');
			}

			function createConsoleEntry(type, args) {
				const entry = document.createElement('div');
				entry.className = 'console-entry console-' + type;

				const typeLabel = document.createElement('span');
				typeLabel.className = 'console-type';
				typeLabel.textContent = type.toUpperCase();
				entry.appendChild(typeLabel);

				const content = document.createElement('span');
				content.className = 'console-content';
				content.innerHTML = args.map(arg => formatValue(arg)).join(' ');
				entry.appendChild(content);

				consoleEntriesEl.appendChild(entry);

				// Scroll to bottom
				consoleEntriesEl.scrollTop = consoleEntriesEl.scrollHeight;
			}

			// Override console methods
			['log', 'warn', 'error', 'info', 'debug'].forEach(method => {
				console[method] = function(...args) {
					originalConsole[method](...args);
					createConsoleEntry(method, args);
				};
			});

			// Function to display exports
			function displayExports(exports) {
				exportsEntriesEl.innerHTML = '';

				const keys = Object.keys(exports);
				if (keys.length === 0) {
					const emptyMsg = document.createElement('div');
					emptyMsg.className = 'export-empty';
					emptyMsg.textContent = 'No named exports found';
					exportsEntriesEl.appendChild(emptyMsg);
					return;
				}

				keys.forEach(key => {
					const entry = document.createElement('div');
					entry.className = 'export-entry';

					const nameEl = document.createElement('span');
					nameEl.className = 'export-name';
					nameEl.textContent = key;
					entry.appendChild(nameEl);

					const colonEl = document.createElement('span');
					colonEl.className = 'export-colon';
					colonEl.textContent = ': ';
					entry.appendChild(colonEl);

					const valueEl = document.createElement('span');
					valueEl.className = 'export-value';
					valueEl.innerHTML = formatValue(exports[key]);
					entry.appendChild(valueEl);

					exportsEntriesEl.appendChild(entry);
				});
			}

			// Dynamically import the index file and display exports
			try {
				const module = await import('./${scriptFile}');
				displayExports(module);
			} catch (error) {
				console.error('Failed to import module:', error);
			}
		</script>
		<script type="module" src="epic_ws.js"></script>
	</body>
</html>
`
}
