# 01. Start

## 📝 Notes

## 🤓 Background

This is some sweet code:

```tsx lines=1,3 remove=10-13 add=15,19
export default function ExercisePartRoute() {
	const data = useLoaderData<typeof loader>()

	return data.isRunning ? (
		<div>
			<AppStopper relativePath={data.relativePath} />
			<iframe
				title={data.title}
				src={`http://localhost:${data.port}`}
				className="h-full w-full"
			/>
		</div>
	) : data.isPortAvailable === false ? (
		<div>
			<div>
				The port for this app is unavailable. It could be that you're running it
				elsewhere?
			</div>
			<PortStopper port={data.port} />
		</div>
	) : (
		<AppStarter relativePath={data.relativePath} />
	)
}

export function ErrorBoundary() {
	const error = useRouteError()

	if (typeof document !== 'undefined') {
		console.error(error)
	}

	return isRouteErrorResponse(error) ? (
		error.status === 404 ? (
			<p>Sorry, we couldn't find an exercise here.</p>
		) : (
			<p>
				{error.status} {error.data}
			</p>
		)
	) : (
		<p>{getErrorMessage(error)}</p>
	)
}
```

## 😈 Problem Step 01. Outlet

Details about the problem

### 🗃 Files

## 😇 Solution Step 01. Outlet

### 🗃 Files

## 😇 Solution Step 02. Outlet Context

### 🗃 Files
