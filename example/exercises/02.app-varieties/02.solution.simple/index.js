const button = document.createElement('button')
button.textContent = 'Click me'
button.addEventListener('click', () => {
	open('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
})

document.body.appendChild(button)
