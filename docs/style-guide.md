# Epic Programming Style Guide

This style guide is a collection of recommendations for writing code that is
easy to understand, maintain, and scale.

It goes hand-in-hand with the
[Epic Programming Principles](https://www.epicweb.dev/principles) and the
[Epic Web Config](https://github.com/epicweb-dev/config).

This is an opinionated style guide that's most useful for people who:

1. Don't have a lot of experience writing code and want some guidance on how to
   write code that's easy to understand, maintain, and scale.
2. Have experience writing code but want a set of standards to align on for
   working in a team.

Much of this is subjective, but most opinions are thought through and based on
years of experience working with large codebases and teams.

Note: Not every possible formatting opinion is mentioned because they are
handled automatically by [Prettier](https://prettier.io) anyway.

## JavaScript

This section will include TypeScript guidelines as well.

### Variables

#### References

Use `const` by default. Only use `let` when you need to reassign. Never use
`var`.

Remember that `const` does not mean "constant" in the sense of "unchangeable".
It means "constant reference". So if the value is an object, you can still
change the properties of the object.

#### Naming conventions

Use descriptive, clear names that explain the value's purpose. Avoid
single-letter names except in small loops or reducers where the value is obvious
from context.

```tsx
// ✅ Good
const workshopTitle = 'Web App Fundamentals'
const instructorName = 'Kent C. Dodds'
const isEnabled = true
const sum = numbers.reduce((total, n) => total + n, 0)
const names = people.map((p) => p.name)

// ❌ Bad
const t = 'Web App Fundamentals'
const n = 'Kent C. Dodds'
const e = true
```

Follow [the naming cheatsheet](https://github.com/kettanaito/naming-cheatsheet)
by [Artem Zakharchenko](https://github.com/kettanaito) for more specifics on
naming conventions.

#### Constants

For truly constant values used across files, use uppercase with underscores:

```tsx
const BASE_URL = 'https://epicweb.dev'
const DEFAULT_PORT = 3000
```

#### Environment Variables

Prefix environment variables with the project name to avoid conflicts:

```tsx
export const workshopRoot = process.env.EPICSHOP_CONTEXT_CWD
```

### Objects

#### Literal syntax

Use object literal syntax for creating objects. Use property shorthand when the
property name matches the variable name.

```tsx
// ✅ Good
const name = 'Kent'
const age = 36
const person = { name, age }

// ❌ Bad
const name = 'Kent'
const age = 36
const person = { name: name, age: age }
```

#### Computed property names

Use computed property names when creating objects with dynamic property names.

```tsx
// ✅ Good
const key = 'name'
const obj = {
	[key]: 'Kent',
}

// ❌ Bad
const key = 'name'
const obj = {}
obj[key] = 'Kent'
```

#### Method shorthand

Use object method shorthand:

```tsx
// ✅ Good
const obj = {
	method() {
		// ...
	},
	async asyncMethod() {
		// ...
	},
}

// ❌ Bad
const obj = {
	method: function () {
		// ...
	},
	asyncMethod: function () {
		// ...
	},
}
```

Ordering of properties is not important (and not specified by the spec) and it's
not a priority for this style guide either.

### Arrays

#### Literal syntax

Use Array literal syntax for creating arrays.

```tsx
// ✅ Good
const items = [1, 2, 3]

// ❌ Bad
const items = new Array(1, 2, 3)
```

#### Filtering falsey values

Use `.filter(Boolean)` to remove falsey values from an array.

```tsx
// ✅ Good
const items = [1, null, 2, undefined, 3]
const filteredItems = items.filter(Boolean)

// ❌ Bad
const filteredItems = items.filter(
	(item) => item !== null && item !== undefined,
)
```

#### Array methods over loops

Use Array methods over loops when transforming arrays with pure functions. Use
`for` loops when imperative code is necessary. Never use `forEach` because it's
never more readable than a `for` loop and there's not situation where the
`forEach` callback function could be pure and useful. Prefer `for...of` over
`for` loops with an index unless the index is needed.

```tsx
// ✅ Good
const items = [1, 2, 3]
const doubledItems = items.map((n) => n * 2)

// ❌ Bad
const doubledItems = []
for (const n of items) {
	doubledItems.push(n * 2)
}

// ✅ Good
for (const n of items) {
	// ...
}

// ❌ Bad
for (let i = 0; i < items.length; i++) {
	const n = items[i]
	// ...
}
// ❌ Bad
items.forEach((n) => {
	// ...
})

// ✅ Good
for (let i = 0; i < items.length; i++) {
	const n = items[i]
	console.log(`${n} at index ${i}`)
}

// ❌ Bad
for (const n of items) {
	const i = items.indexOf(n)
	console.log(`${n} at index ${i}`)
}
```

#### Favor simple chains over `.reduce`

Favor simple `.filter` and `.map` chains over complex `.reduce` callbacks unless
performance is an issue.

```tsx
// ✅ Good
const items = [1, 2, 3, 4, 5]
const doubledGreaterThanTwoItems = items.filter((n) => n > 2).map((n) => n * 2)

// ❌ Bad
const doubledItems = items.reduce((acc, n) => {
	acc.push(n * 2)
	return acc
}, [])
```

#### Spread to copy

Prefer the spread operator to copy an array:

```tsx
// ✅ Good
const itemsCopy = [...items]
const combined = [...array1, ...array2]

// ❌ Bad
const itemsCopy = items.slice()
const combined = array1.concat(array2)
```

#### Non-mutative array methods

Prefer non-mutative array methods like `toReversed()`, `toSorted()`, and
`toSpliced()` when available. Otherwise, create a new array. Unless performance
is an issue or the original array is not referenced (as in a chain of method
calls).

```tsx
// ✅ Good
const reversedItems = items.toReversed()
const mappedFilteredSortedItems = items
	.filter((n) => n > 2)
	.map((n) => n * 2)
	.sort((a, b) => a - b)

// In an older environment
const reversedItems = [...items].reverse()

// ❌ Bad
const reversedItems = items.reverse()
```

#### Use `with`

Use `with` to create a new object with some properties replaced.

```tsx
// ✅ Good
const people = [{ name: 'Kent' }, { name: 'Sarah' }]
const personIndex = 0
const peopleWithKentReplaced = people.with(personIndex, { name: 'John' })

// ❌ Bad (mutative)
const peopleWithKentReplaced = [...people]
peopleWithKentReplaced[personIndex] = { name: 'John' }
```

#### TypeScript array generic

Prefer the Array generic syntax over brackets for TypeScript types:

```tsx
// ✅ Good
const items: Array<string> = []
function transform(numbers: Array<number>) {}

// ❌ Bad
const items: string[] = []
function transform(numbers: number[]) {}
```

### Destructuring

#### Destructure objects and arrays

Use destructuring to make your code more terse.

```tsx
// ✅ Good
const { name, avatar, 𝕏: xHandle } = instructor
const [first, second] = items

// ❌ Bad
const name = instructor.name
const avatar = instructor.avatar
const xHandle = instructor.𝕏
```

Destructuring multiple levels is fine when formatted properly by Prettier, but
can definitely get out of hand, so use your best judgement. As usual, try both
and choose the one you hate the least.

```tsx
// ✅ Good (nesting, but still readable)
const {
	name,
	avatar,
	𝕏: xHandle,
	address: [{ city, state, country }],
} = instructor

// ❌ Bad (too much nesting)
const [
	{
		name,
		avatar,
		𝕏: xHandle,
		address: [
			{
				city: {
					latitude: firstCityLatitude,
					longitude: firstCityLongitude,
					label: firstCityLabel,
				},
				state: { label: firstStateLabel },
				country: { label: firstCountryLabel },
			},
		],
	},
] = instructor
```

### Strings

#### Interpolation

Prefer template literals over string concatenation.

```tsx
// ✅ Good
const name = 'Kent'
const greeting = `Hello ${name}`

// ❌ Bad
const greeting = 'Hello ' + name
```

#### Multi-line strings

Use template literals for multi-line strings.

```tsx
// ✅ Good
const html = `
<div>
	<h1>Hello</h1>
</div>
`.trim()

// ❌ Bad
const html = '<div>' + '\n' + '<h1>Hello</h1>' + '\n' + '</div>'
```

### Functions

Use function declarations over function expressions. Name your functions
descriptively.

This is important because it allows the function definition to be hoisted to the
top of the block, which means it's callable anywhere which frees your mind to
think about other things.

```tsx
// ✅ Good
function calculateTotal(items: Array<number>) {
	return items.reduce((sum, item) => sum + item, 0)
}

// ❌ Bad
const calculateTotal = function (items: Array<number>) {
	return items.reduce((sum, item) => sum + item, 0)
}

const calculateTotal = (items: Array<number>) =>
	items.reduce((sum, item) => sum + item, 0)
```

Limit creating single-use functions. By taking a large function and breaking it
down into many smaller functions, you reduce benefits of type inference and have
to define types for each function and make additional decisions about the number
and format of arguments. Instead, extract logic only when it needs to be reused
or when a portion of the logic is clearly part of a unique concern.

```tsx
// ✅ Good
function doStuff() {
	// thing 1
	// ...
	// thing 2
	// ...
	// thing 3
	// ...
	// thing N
}

// ❌ Bad
function doThing1(param1: string, param2: number) {}
function doThing2(param1: boolean, param2: User) {}
function doThing3(param1: string, param2: Array<User>, param3: User) {}
function doThing4(param1: User) {}

function doStuff() {
	doThing1()
	// ...
	doThing2()
	// ...
	doThing3()
	// ...
	doThing4()
}
```

Prefer default parameters over short-circuiting.

```tsx
// ✅ Good
function createUser(name: string, role = 'user') {
	return { name, role }
}

// ❌ Bad
function createUser(name: string, role: string) {
	role ??= 'user'
	return { name, role }
}
```

Return early to avoid deep nesting. Use guard clauses:

```tsx
// ✅ Good
function getMinResolutionValue(resolution: number | undefined) {
	if (!resolution) return undefined
	if (resolution <= 480) return MinResolution.noLessThan480p
	if (resolution <= 540) return MinResolution.noLessThan540p
	return MinResolution.noLessThan1080p
}

// ❌ Bad
function getMinResolutionValue(resolution: number | undefined) {
	if (resolution) {
		if (resolution <= 480) {
			return MinResolution.noLessThan480p
		} else if (resolution <= 540) {
			return MinResolution.noLessThan540p
		} else {
			return MinResolution.noLessThan1080p
		}
	} else {
		return undefined
	}
}
```

Prefer async/await over promise chains:

```tsx
// ✅ Good
async function fetchUserData(userId: string) {
	const user = await getUser(userId)
	const posts = await getUserPosts(user.id)
	return { user, posts }
}

// ❌ Bad
function fetchUserData(userId: string) {
	return getUser(userId).then((user) => {
		return getUserPosts(user.id).then((posts) => ({ user, posts }))
	})
}
```

Anonymous inline callbacks should be arrow functions:

```tsx
// ✅ Good
const items = [1, 2, 3]
const doubledGreaterThanTwoItems = items.filter((n) => n > 2).map((n) => n * 2)

// ❌ Bad
const items = [1, 2, 3]
const doubledGreaterThanTwoItems = items
	.filter(function (n) {
		return n > 2
	})
	.map(function (n) {
		return n * 2
	})
```

Arrow functions should include pretenses even with a single parameter:

<!-- prettier-ignore -->
```tsx
// ✅ Good
const items = [1, 2, 3]
const doubledGreaterThanTwoItems = items.filter((n) => n > 2).map((n) => n * 2)

// ❌ Bad
const items = [1, 2, 3]
const doubledGreaterThanTwoItems = items.filter(n => n > 2).map(n => n * 2)
```

This makes it easier to add/remove parameters without having to futz around with
parentheses.

### Classes & Constructors

#### Avoid Classes

Avoid classes. Use objects and functions instead.

```tsx
type Role = 'admin' | 'user'

type User = {
	name: string
	role: Role
}

// ✅ Good
const user: User = {
	name: 'Brittany',
	role: 'admin',
}

function userHasAccess(user: User, requiredRole: Role) {
	return user.role === requiredRole
}

// ❌ Bad
class User {
	name: string
	role: Role
	constructor(name: string, role: Role) {
		this.name = name
		this.role = role
	}
	hasAccess(requiredRole: Role) {
		return this.role === requiredRole
	}
}
```

#### Use as a performance optimization

Use classes as a performance optimization when you need to create a large number
of objects and you need to avoid the overhead of creating those objects with
functions. It's even better to use simple objects and functions, but if for some
reason you need the function to be attached to the object, then use a class.

```tsx
// ✅ Good
class Point {
	x: number
	y: number
	constructor(x: number, y: number) {
		this.x = x
		this.y = y
	}
	distanceTo(other: Point) {
		const dx = this.x - other.x
		const dy = this.y - other.y
		return Math.sqrt(dx * dx + dy * dy)
	}
}

// ✅ Better
function distanceBetweenPoints(point1: Point, point2: Point) {
	const dx = point1.x - point2.x
	const dy = point1.y - point2.y
	return Math.sqrt(dx * dx + dy * dy)
}
const point1 = { x: 0, y: 0 }
const point2 = { x: 1, y: 1 }
const distance = distanceBetweenPoints(point1, point2)

// ❌ Bad
function createPoint(x: number, y: number) {
	return {
		x,
		y,
		distanceTo(other: Point) {
			const dx = this.x - other.x
			const dy = this.y - other.y
			return Math.sqrt(dx * dx + dy * dy)
		},
	}
}
```

#### Avoid Inheritance

Avoid inheritance. If you need to extend a class, use duplication or composition
instead of inheritance.

```tsx
// ✅ Good
class User {
	name: string
	role: string
	constructor(name: string, role: string) {
		this.name = name
		this.role = role
	}
}

// ❌ Bad
class User extends Person {
	role: string
	constructor(name: string, role: string) {
		super(name)
		this.role = role
	}
}
```

### Modules

#### File Organization

In general, files that change together should be located close to each other. In
Breaking a single file into multiple files should be avoided unless absolutely
necessary.

Specifics around file structure depends on a multitude of factors:

- Framework conventions
- Project size
- Team size

Strive to keep the file structure as flat as possible.

#### Module Exports

Framework and other tool conventions sometimes require default exports, but
prefer named exports in all other cases.

```tsx
// ✅ Good
export function add(a: number, b: number) {
	return a + b
}

export function subtract(a: number, b: number) {
	return a - b
}

// ❌ Bad
export default function add(a: number, b: number) {
	return a + b
}
```

#### Barrel Files

Do **not** use barrel files. If you don't know what they are, good. If you do
and you like them, it's probably because you haven't experienced their issues
just yet, but you will. Just avoid them.

#### Pure Modules

In general, strive to keep modules pure (read more about this in
[Pure Modules](https://kentcdodds.com/blog/pure-modules)). This will make your
application start faster and be easier to understand and test.

```tsx
// ✅ Good
let serverData
export function init(a: number, b: number) {
	const el = document.getElementById('server-data')
	const json = el.textContent
	serverData = JSON.parse(json)
}

export function getServerData() {
	if (!serverData) throw new Error('Server data not initialized')
	return serverData
}

// ❌ Bad
let serverData
const el = document.getElementById('server-data')
const json = el.textContent
export const serverData = JSON.parse(json)
```

In practice, you can't avoid some modules having side-effects (you gotta kick
off the app somewhere), but most modules should be pure.

#### Import Conventions

Import order has semantic meaning (modules are executed in the order they're
imported), but if you keep most modules pure, then order shouldn't matter. For
this reason, having your imports grouped can make things a bit easier to read.

```
// Group imports in this order:
import node_modules        // Built-in & external packages
import '#app/components'   // Internal absolute imports
import '../other-folder'   // Internal relative imports
import './local-file'      // Local imports
```

#### Type Imports

Each module imported should have a single import statement:

```tsx
// ✅ Good
import { type MatchSorterOptions, matchSorter } from 'match-sorter'

// ❌ Bad
import { type MatchSorterOptions } from 'match-sorter'
import { matchSorter } from 'match-sorter'
```

#### Import Location

All static imports are executed at the top of the file so they should appear
there as well to avoid confusion.

```tsx
// ✅ Good
import { matchSorter } from 'match-sorter'

function doStuff() {
	// ...
}

// ❌ Bad
function doStuff() {
	// ...
}

import { matchSorter } from 'match-sorter'
```

#### Export Location

All exports should be inline with the function/type/etc they are exporting. This
avoids duplication of the export identifier and having to keep it updated when
changing the name of the exported thing.

```tsx
// ✅ Good
export function add(a: number, b: number) {
	return a + b
}

// ❌ Bad
function add(a: number, b: number) {
	return a + b
}
export { add }
```

#### Module Type

Use ECMAScript modules for everything. The age of CommonJS is over.

✅ Good **package.json**

```json
{
	"type": "module"
}
```

Use **exports** field in **package.json** to explicitly declare module entry
points.

✅ Good **package.json**

```json
{
	"exports": {
		"./utils": "./src/utils.js"
	}
}
```

#### Import Aliases

Use import aliases to avoid long relative paths. Use the standard `imports`
config field in **package.json** to declare import aliases.

✅ Good **package.json**

```json
{
	"imports": {
		"#app/*": "./app/*",
		"#tests/*": "./tests/*"
	}
}
```

```tsx
import { add } from '#app/utils/math.ts'
```

Latest versions of TypeScript support this syntax natively.

#### Include file extensions

The ECMAScript module spec requires file extensions to be included in import
paths. Even though TypeScript doesn't require it, always include the file
extension in your imports. An exception to this is when importing a module which
has `exports` defined in its **package.json**.

```tsx
// ✅ Good
import { redirect } from 'react-router'
import { add } from './math.ts'

// ❌ Bad
import { add } from './math'
```

### Properties

#### Use dot-notation

When accessing properties on objects, use dot-notation unless you can't
syntactically (like if it's dynamic or uses special characters).

```tsx
const user = { name: 'Brittany', 'data-id': '123' }

// ✅ Good
const name = user.name
const id = user['data-id']
function getUserProperty(user: User, property: string) {
	return user[property]
}

// ❌ Bad
const name = user['name']
```

### Comparison Operators & Equality

#### Triple equals

Use triple equals (`===` and `!==`) for comparisons. This will ensure you're not
falling prey to type coercion.

That said, when comparing against `null` or `undefined`, using double equals
(`==` and `!=`) is just fine.

```tsx
// ✅ Good
const user = { id: '123' }
if (user.id === '123') {
	// ...
}
const a = null
if (a === null) {
	// ...
}

// ❌ Bad
if (a == null) {
	// ...
}
```

#### Rely on truthiness

Rely on truthiness instead of comparison operators.

```tsx
// ✅ Good
if (user) {
	// ...
}

// ❌ Bad
if (user === true) {
	// ...
}
```

#### Do not render falsiness

In JSX, do not render falsy values other than `null`.

```tsx
// ✅ Good
<div>
	{contacts.length ? <div>You have {contacts.length} contacts</div> : null}
</div>

// ❌ Bad
<div>
	{contacts.length && <div>You have {contacts.length} contacts</div>}
</div>
```

#### Use ternaries

Use ternaries for simple conditionals. When automatically formatted, they should
be plenty readable, even on multiple lines. Ternaries are also the only
conditional in the spec (currently) which are expressions and can be used in
return statements and other places expressions are used.

```tsx
// ✅ Good
const isAdmin = user.role === 'admin'
const access = isAdmin ? 'granted' : 'denied'

function App({ user }: { user: User }) {
	return (
		<div className="App">
			{user.role === 'admin' ? <Link to="/admin">Admin</Link> : null}
		</div>
	)
}
```

#### Switch statement braces

Using braces in switch statements is recommended because it helps clarify the
scope of each case and it avoids variable declarations from leaking into other
cases.

```tsx
// ✅ Good
switch (action.type) {
	case 'add': {
		const { amount } = action
		add(amount)
		break
	}
	case 'remove': {
		const { removal } = action
		remove(removal)
		break
	}
}
```

#### Avoid unnecessary ternaries

```tsx
// ✅ Good
const isAdmin = user.role === 'admin'
const value = input ?? defaultValue

// ❌ Bad
const isAdmin = user.role === 'admin' ? true : false
const value = input != null ? input : defaultValue
```

### Blocks

#### Use braces for multi-line blocks

Use braces for multi-line blocks even when the block is the body of a single
statement.

```tsx
// ✅ Good
if (!user) return
if (user.role === 'admin') {
	abilities = ['add', 'remove', 'edit', 'create', 'modify', 'fly', 'sing']
}

// ❌ Bad
if (user.role === 'admin')
	abilities = ['add', 'remove', 'edit', 'create', 'modify', 'fly', 'sing']
```

### Control Statements

#### Use statements

Unless you're using the value of the condition in an expression, prefer using
statements instead of expressions.

```tsx
// ✅ Good
if (user) {
	makeUserHappy(user)
}

// ❌ Bad
user && makeUserHappy(user)
```

### Comments

### Whitespace

### Commas

### Semicolons

### Type Casting & Coercion

### Naming Conventions

### Accessors

### Events

### Standard Library

### Testing

## React

## HTML

## CSS
