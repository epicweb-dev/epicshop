import { useState } from 'react'
import * as ReactDOM from 'react-dom/client'

function Counter() {
	const [count, setCount] = useState(0)
	const increment = () => setCount((c) => c + 1)
	return <button onClick={increment}>This is an example{count}</button>
}

const rootEl = document.createElement('div')
document.body.append(rootEl)
ReactDOM.createRoot(rootEl).render(<Counter />)
