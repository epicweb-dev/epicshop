const root = document.createElement('div')
root.className = 'theme-app'
root.innerHTML = `
  <h1>Theme Toggle</h1>
  <p>Switch between light and dark modes.</p>
  <button type="button" class="toggle">Enable dark mode</button>
`

const style = document.createElement('style')
style.textContent = `
  body {
    margin: 0;
    font-family: system-ui, sans-serif;
    transition: background 0.2s ease, color 0.2s ease;
    background: #f8fafc;
    color: #0f172a;
  }
  body.dark {
    background: #0f172a;
    color: #e2e8f0;
  }
  .theme-app {
    max-width: 420px;
    margin: 40px auto;
    padding: 24px;
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.9);
    box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
  }
  body.dark .theme-app {
    background: rgba(15, 23, 42, 0.9);
  }
  button {
    margin-top: 16px;
    padding: 10px 16px;
    border-radius: 12px;
    border: none;
    background: #2563eb;
    color: white;
    cursor: pointer;
  }
  body.dark button {
    background: #38bdf8;
    color: #0f172a;
  }
`

document.head.append(style)
document.body.append(root)

const button = root.querySelector('button')
let isDark = false

button.addEventListener('click', () => {
	isDark = !isDark
	document.body.classList.toggle('dark', isDark)
	button.textContent = isDark ? 'Enable light mode' : 'Enable dark mode'
})
