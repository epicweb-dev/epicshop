import * as React from 'react'
import * as ReactDOM from 'react-dom/client'

function Counter() {
	return (
		<div>
			This is a counter!
			<button>0</button>
		</div>
	)
}

const rootEl = document.createElement('div')
document.body.append(rootEl)
ReactDOM.createRoot(rootEl).render(<Counter />)
