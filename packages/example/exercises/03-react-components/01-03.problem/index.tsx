import * as React from 'react'
import * as ReactDOM from 'react-dom/client'

function Counter() {
	return <button>0</button>
}

const rootEl = document.createElement('div')
document.body.append(rootEl)
ReactDOM.createRoot(rootEl).render(<Counter />)
