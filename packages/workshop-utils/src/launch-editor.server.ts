// copied (and barely modified) from create-react-app:
//   https://github.com/facebook/create-react-app/blob/d960b9e38c062584ff6cfb1a70e1512509a966e7/packages/react-dev-utils/launchEditor.js

import child_process from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import fsExtra from 'fs-extra'
import shellQuote from 'shell-quote'
import { getRelativePath } from './apps.server.ts'

function readablePath(filePath: string = '') {
	const relative = getRelativePath(filePath)
	const name = path.basename(relative)
	const dir = path.dirname(relative)
	return `'${name}' from:\n'${dir}'`
}

function isTerminalEditor(editor: string) {
	switch (editor) {
		case 'vim':
		case 'emacs':
		case 'nano':
			return true
	}
	return false
}

// Map from full process name to binary that starts the process
// We can't just re-use full process name, because it will spawn a new instance
// of the app every time
const COMMON_EDITORS_OSX = {
	'/Applications/Atom.app/Contents/MacOS/Atom': 'atom',
	'/Applications/Atom Beta.app/Contents/MacOS/Atom Beta':
		'/Applications/Atom Beta.app/Contents/MacOS/Atom Beta',
	'/Applications/Brackets.app/Contents/MacOS/Brackets': 'brackets',
	'/Applications/Sublime Text.app/Contents/MacOS/Sublime Text':
		'/Applications/Sublime Text.app/Contents/SharedSupport/bin/subl',
	'/Applications/Sublime Text Dev.app/Contents/MacOS/Sublime Text':
		'/Applications/Sublime Text Dev.app/Contents/SharedSupport/bin/subl',
	'/Applications/Sublime Text 2.app/Contents/MacOS/Sublime Text 2':
		'/Applications/Sublime Text 2.app/Contents/SharedSupport/bin/subl',
	'/Applications/Cursor.app/Contents/MacOS/Cursor': 'cursor',
	'/Applications/Visual Studio Code.app/Contents/MacOS/Electron': 'code',
	'/Applications/Visual Studio Code - Insiders.app/Contents/MacOS/Electron':
		'code-insiders',
	'/Applications/VSCodium.app/Contents/MacOS/Electron': 'vscodium',
	'/Applications/AppCode.app/Contents/MacOS/appcode':
		'/Applications/AppCode.app/Contents/MacOS/appcode',
	'/Applications/CLion.app/Contents/MacOS/clion':
		'/Applications/CLion.app/Contents/MacOS/clion',
	'/Applications/IntelliJ IDEA.app/Contents/MacOS/idea':
		'/Applications/IntelliJ IDEA.app/Contents/MacOS/idea',
	'/Applications/PhpStorm.app/Contents/MacOS/phpstorm':
		'/Applications/PhpStorm.app/Contents/MacOS/phpstorm',
	'/Applications/PyCharm.app/Contents/MacOS/pycharm':
		'/Applications/PyCharm.app/Contents/MacOS/pycharm',
	'/Applications/PyCharm CE.app/Contents/MacOS/pycharm':
		'/Applications/PyCharm CE.app/Contents/MacOS/pycharm',
	'/Applications/RubyMine.app/Contents/MacOS/rubymine':
		'/Applications/RubyMine.app/Contents/MacOS/rubymine',
	'/Applications/WebStorm.app/Contents/MacOS/webstorm':
		'/Applications/WebStorm.app/Contents/MacOS/webstorm',
	'/Applications/MacVim.app/Contents/MacOS/MacVim': 'mvim',
	'/Applications/GoLand.app/Contents/MacOS/goland':
		'/Applications/GoLand.app/Contents/MacOS/goland',
	'/Applications/Rider.app/Contents/MacOS/rider':
		'/Applications/Rider.app/Contents/MacOS/rider',
	'/Applications/Zed/Zed.app/Contents/MacOS/zed': 'zed',
} as const

const COMMON_EDITORS_LINUX = {
	atom: 'atom',
	Brackets: 'brackets',
	cursor: 'cursor',
	code: 'code',
	'code-insiders': 'code-insiders',
	vscodium: 'vscodium',
	emacs: 'emacs',
	gvim: 'gvim',
	'idea.sh': 'idea',
	'phpstorm.sh': 'phpstorm',
	'pycharm.sh': 'pycharm',
	'rubymine.sh': 'rubymine',
	sublime_text: 'sublime_text',
	vim: 'vim',
	'webstorm.sh': 'webstorm',
	'goland.sh': 'goland',
	'rider.sh': 'rider',
	zed: 'zed',
}

const COMMON_EDITORS_WIN = [
	'Brackets.exe',
	'Cursor.exe',
	'Code.exe',
	'Code - Insiders.exe',
	'VSCodium.exe',
	'atom.exe',
	'sublime_text.exe',
	'notepad++.exe',
	'clion.exe',
	'clion64.exe',
	'idea.exe',
	'idea64.exe',
	'phpstorm.exe',
	'phpstorm64.exe',
	'pycharm.exe',
	'pycharm64.exe',
	'rubymine.exe',
	'rubymine64.exe',
	'webstorm.exe',
	'webstorm64.exe',
	'goland.exe',
	'goland64.exe',
	'rider.exe',
	'rider64.exe',
	'zed.exe',
]

// Transpiled version of: /^([A-Za-z]:[/\\])?[\p{L}0-9/.\-_\\ ]+$/u
// Non-transpiled version requires support for Unicode property regex. Allows

function addWorkspaceToArgumentsIfExists(
	args: Array<string>,
	workspace: string | null,
) {
	if (workspace) {
		args.unshift(workspace)
	}
	return args
}

function getArgumentsForLineNumber(
	editor: string,
	fileName: string,
	lineNumber: number,
	colNumber: number | undefined,
	workspace: string | null,
) {
	const editorBasename = path.basename(editor).replace(/\.(exe|cmd|bat)$/i, '')
	switch (editorBasename) {
		case 'atom':
		case 'Atom':
		case 'Atom Beta':
		case 'subl':
		case 'sublime':
		case 'sublime_text':
			return [`${fileName}:${lineNumber}:${colNumber}`]
		case 'wstorm':
		case 'charm':
			return [`${fileName}:${lineNumber}`]
		case 'notepad++':
			return [`-n${lineNumber}`, `-c${colNumber}`, fileName]
		case 'vim':
		case 'mvim':
		case 'joe':
		case 'gvim':
			return [`+${lineNumber}`, fileName]
		case 'emacs':
		case 'emacsclient':
			return [`+${lineNumber}:${colNumber}`, fileName]
		case 'rmate':
		case 'mate':
		case 'mine':
			return ['--line', lineNumber, fileName]
		case 'cursor':
		case 'code':
		case 'Code':
		case 'code-insiders':
		case 'Code - Insiders':
		case 'vscodium':
		case 'VSCodium':
			return addWorkspaceToArgumentsIfExists(
				['-g', `${fileName}:${lineNumber}:${colNumber}`],
				workspace,
			)
		case 'appcode':
		case 'clion':
		case 'clion64':
		case 'idea':
		case 'idea64':
		case 'phpstorm':
		case 'phpstorm64':
		case 'pycharm':
		case 'pycharm64':
		case 'rubymine':
		case 'rubymine64':
		case 'webstorm':
		case 'webstorm64':
		case 'goland':
		case 'goland64':
		case 'rider':
		case 'rider64':
			return addWorkspaceToArgumentsIfExists(
				['--line', lineNumber.toString(), fileName],
				workspace,
			)
	}

	// For all others, drop the lineNumber until we have
	// a mapping above, since providing the lineNumber incorrectly
	// can result in errors or confusing behavior.
	return [fileName]
}

function guessEditor(): Array<string | null> {
	// Explicit config always wins
	if (process.env.EPICSHOP_EDITOR) {
		return shellQuote.parse(process.env.EPICSHOP_EDITOR).map((a) => String(a))
	}

	// We can find out which editor is currently running by:
	// `ps x` on macOS and Linux
	// `Get-Process` on Windows
	try {
		if (process.platform === 'darwin') {
			const output = child_process.execSync('ps x').toString()
			const processNames = Object.keys(COMMON_EDITORS_OSX) as Array<
				keyof typeof COMMON_EDITORS_OSX
			>
			for (let i = 0; i < processNames.length; i++) {
				const processName = processNames[i]
				if (processName && output.includes(processName)) {
					const editor = COMMON_EDITORS_OSX[processName]
					return [editor]
				}
			}
		} else if (process.platform === 'win32') {
			// Some processes need elevated rights to get its executable path.
			// Just filter them out upfront. This also saves 10-20ms on the command.
			const output = child_process
				.execSync(
					'wmic process where "executablepath is not null" get executablepath',
				)
				.toString()
			const runningProcesses = output.split('\r\n')
			for (let i = 0; i < runningProcesses.length; i++) {
				const processPath = runningProcesses[i]?.trim()
				if (!processPath) continue
				const processName = path.basename(processPath)
				if (COMMON_EDITORS_WIN.includes(processName)) {
					return [processPath]
				}
			}
		} else if (process.platform === 'linux') {
			// --no-heading No header line
			// x List all processes owned by you
			// -o comm Need only names column
			const output = child_process
				.execSync('ps x --no-heading -o comm --sort=comm')
				.toString()
			const processNames = Object.keys(COMMON_EDITORS_LINUX)
			for (let i = 0; i < processNames.length; i++) {
				const processName = processNames[i]
				if (!processName) continue
				if (output.includes(processName)) {
					// @ts-expect-error 🤷‍♂️ it's fine
					return [COMMON_EDITORS_LINUX[processName]]
				}
			}
		}
	} catch {
		// Ignore...
	}

	// Last resort, use old skool env vars
	if (process.env.VISUAL) {
		return [process.env.VISUAL]
	} else if (process.env.EDITOR) {
		return [process.env.EDITOR]
	}

	return [null]
}

let _childProcess: ReturnType<typeof child_process.spawn> | null = null
export type Result =
	| { status: 'success' }
	| { status: 'error'; message: string }
export async function launchEditor(
	pathList: string[] | string,
	lineNumber: number = 1,
	colNumber: number = 1,
): Promise<Result> {
	// Sanitize lineNumber to prevent malicious use on win32
	// via: https://github.com/nodejs/node/blob/c3bb4b1aa5e907d489619fb43d233c3336bfc03d/lib/child_process.js#L333
	// and it should be a positive integer
	if (lineNumber && !(Number.isInteger(lineNumber) && lineNumber > 0)) {
		return { status: 'error', message: 'lineNumber must be a positive integer' }
	}

	// colNumber is optional, but should be a positive integer too
	// default is 1
	if (colNumber && !(Number.isInteger(colNumber) && colNumber > 0)) {
		colNumber = 1
	}

	const editorInfo = guessEditor()
	const editor = editorInfo[0]
	let args = editorInfo.slice(1).filter(Boolean)

	if (!editor) {
		return { status: 'error', message: 'No editor found' }
	}

	if (editor.toLowerCase() === 'none') {
		return { status: 'error', message: 'Editor set to "none"' }
	}

	if (typeof pathList === 'string') {
		pathList = [pathList]
	}

	type accumulator = {
		fileList: string[]
		errorsList: string[]
	}

	const initArgs: accumulator = { fileList: [], errorsList: [] }

	const { fileList, errorsList } = pathList.reduce(
		(acc: accumulator, fileName: string) => {
			if (
				process.platform === 'linux' &&
				fileName.startsWith('/mnt/') &&
				/Microsoft/i.test(os.release())
			) {
				// Assume WSL / "Bash on Ubuntu on Windows" is being used, and
				// that the file exists on the Windows file system.
				// `os.release()` is "4.4.0-43-Microsoft" in the current release
				// build of WSL, see: https://github.com/Microsoft/BashOnWindows/issues/423#issuecomment-221627364
				// When a Windows editor is specified, interop functionality can
				// handle the path translation, but only if a relative path is used.
				fileName = path.relative('', fileName)
			}

			const fileExists = fs.existsSync(fileName)
			// cmd.exe on Windows is vulnerable to RCE attacks given a file name of the
			// form "C:\Users\myusername\Downloads\& curl 172.21.93.52". Use a whitelist
			// to validate user-provided file names. This doesn't cover the entire range
			// of valid file names but should cover almost all of them in practice.
			// if the file exists, then we're good.
			if (
				!fileExists &&
				process.platform === 'win32' &&
				!WINDOWS_FILE_NAME_WHITELIST.test(fileName)
			) {
				acc.errorsList.push(fileName)
			} else {
				if (!fileExists) {
					fsExtra.ensureDirSync(path.dirname(fileName))
					fsExtra.writeFileSync(fileName, '', 'utf8')
				}

				acc.fileList.push(fileName.trim())
			}
			return acc
		},
		initArgs,
	)

	// TODO: figure out how to send error messages as JSX from here...
	function getErrorMessage() {
		let message: string
		if (errorsList.length) {
			const readableName =
				errorsList.length === 1 ? readablePath(errorsList[0]) : 'some files'
			message = `Could not open ${readableName} in the editor.\n\nWhen running on Windows, file names are checked against a whitelist to protect against remote code execution attacks.\nFile names may consist only of alphanumeric characters (all languages), spaces, periods, dashes, slashes, and underscores.`
		} else {
			message = 'pathList must contain at least one valid file path'
		}
		return {
			status: 'error',
			message,
		} as Result
	}

	const workspace = null
	if (lineNumber && fileList.length === 1) {
		const fileName = fileList[0]
		if (!fileName) {
			return getErrorMessage()
		}
		args = args.concat(
			getArgumentsForLineNumber(
				editor,
				fileName,
				lineNumber,
				colNumber,
				workspace,
			)
				.filter(Boolean)
				.map(String),
		)
	} else {
		const argList = fileList.filter(Boolean)
		if (!argList.length) {
			return getErrorMessage()
		}
		args.push(...argList)
	}

	if (_childProcess && isTerminalEditor(editor)) {
		// There's an existing editor process already and it's attached
		// to the terminal, so go kill it. Otherwise two separate editor
		// instances attach to the stdin/stdout which gets confusing.
		_childProcess.kill('SIGKILL')
	}

	return new Promise((res) => {
		if (process.platform === 'win32') {
			// On Windows, many editor binaries in PATH are `.cmd`/`.bat` wrappers
			// (like `code`). Using a shell makes those work, and also properly
			// preserves arguments containing spaces.
			const ext = path.extname(editor).toLowerCase()
			const useShell = ext !== '.exe'
			_childProcess = child_process.spawn(editor, args, {
				stdio: ['inherit', 'inherit', 'pipe'],
				shell: useShell,
			})
		} else {
			_childProcess = child_process.spawn(editor, args, {
				stdio: ['inherit', 'inherit', 'pipe'],
			})
		}
		_childProcess.stderr?.on('data', (data: string | Uint8Array) => {
			const message = String(data)
			// Filter out the specific error message for environment variable issues
			if (!message.includes('Node.js environment variables are disabled')) {
				process.stderr.write(data) // Only write non-filtered messages to stderr
			}
		})
		_childProcess.on('exit', async (errorCode) => {
			_childProcess = null

			if (errorCode) {
				const readableName =
					fileList.length === 1 ? readablePath(fileList[0]) : 'some files'
				return res({
					status: 'error',
					message: `Could not open ${readableName} in the editor.\n\nThe editor process exited with an error code (${errorCode}).`,
				})
			} else if (errorsList.length) {
				// show error message even when the editor was opened successfully,
				// if some file path was not valid in windows
				return res(getErrorMessage())
			} else {
				return res({ status: 'success' })
			}
		})

		_childProcess.on('error', async (error: Error & { code?: string }) => {
			if (error.code === 'EBADF') {
				return res({
					status: 'error',
					message:
						'Unable to launch editor. This commonly happens when running in a containerized or server environment without terminal access.',
				})
			}
			return res({ status: 'error', message: error.message })
		})
	})
}
