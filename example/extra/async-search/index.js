const root = document.createElement('div')
root.className = 'app'
root.innerHTML = `
  <h1>Async Search</h1>
  <p class="helper">Type to search a short list of items.</p>
  <label class="field">
    <span>Search</span>
    <input type="search" placeholder="Try 'cat' or 'book'" />
  </label>
  <p class="status" aria-live="polite">Idle</p>
  <ul class="results"></ul>
`

const style = document.createElement('style')
style.textContent = `
  body {
    font-family: system-ui, sans-serif;
    margin: 0;
    padding: 32px;
    background: #f8fafc;
  }
  .app {
    max-width: 480px;
    margin: 0 auto;
    padding: 24px;
    border-radius: 16px;
    background: white;
    box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
  }
  h1 {
    margin: 0 0 12px;
  }
  .helper {
    margin: 0 0 20px;
    color: #475569;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  input {
    font-size: 16px;
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid #cbd5f5;
  }
  .status {
    margin: 16px 0 12px;
    color: #1d4ed8;
  }
  .results {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 6px;
  }
  .results li {
    padding: 8px 10px;
    background: #eff6ff;
    border-radius: 8px;
  }
`

document.head.append(style)
document.body.append(root)

const items = [
	'cat',
	'camera',
	'candle',
	'book',
	'bottle',
	'backpack',
	'window',
	'wallet',
	'plant',
	'pencil',
]

const input = root.querySelector('input')
const status = root.querySelector('.status')
const results = root.querySelector('.results')
let timeoutId = null

function renderResults(list) {
	results.innerHTML = ''
	if (!list.length) {
		const empty = document.createElement('li')
		empty.textContent = 'No matches yet.'
		results.append(empty)
		return
	}
	list.forEach((item) => {
		const li = document.createElement('li')
		li.textContent = item
		results.append(li)
	})
}

function setStatus(message) {
	status.textContent = message
}

renderResults([])

input.addEventListener('input', (event) => {
	const value = event.target.value.trim().toLowerCase()
	setStatus('Searching...')
	if (timeoutId) window.clearTimeout(timeoutId)

	timeoutId = window.setTimeout(() => {
		const matches = items.filter((item) => item.includes(value))
		renderResults(value ? matches : [])
		setStatus(value ? `Found ${matches.length} result(s).` : 'Idle')
	}, 400)
})
