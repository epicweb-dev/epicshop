# Outlet Context

Just an example of some stuff

Here's some code yo:

```tsx filename=my%20project/app/routes/thing.tsx lines=[1,3] start=6 add=9,13 remove=10,15-17
export async function loader({ params }: DataFunctionArgs) {
  invariant(params.exerciseNumber, "exerciseNumber is required");
  const exercise = await getExercise(params.exerciseNumber);
  if (!exercise) {
    throw new Response("Not found", { status: 404 });
  }
  const exerciseStepApp = await getExerciseApp(params);
  const nextApp = await getNextExerciseApp(exerciseStepApp);
  const prevApp = await getPrevExerciseApp(exerciseStepApp);
  const nextStepLink = nextApp
    ? { to: getAppPageRoute(nextApp), children: `${nextApp.title} ➡️` }
    : null;
  const prevStepLink = prevApp
    ? { to: getAppPageRoute(prevApp), children: `⬅️ ${prevApp.title}` }
    : exerciseStepApp
    ? {
        to: `/${exerciseStepApp.exerciseNumber}`,
        children: `⬅️ ${exercise.title}`,
      }
    : null;

  return json({ exercise, nextStepLink, prevStepLink, exerciseStepApp });
}
```

<section id="files" className="not-prose">
  <h2>Files</h2>

  <ul>
    <li data-state="modified">
      <span>modified</span>

      <LaunchEditor workshopFile="exercises/01.nested-routing/01-02.problem/.gitignore">
        <code>.gitignore</code>
      </LaunchEditor>
    </li>

    <li data-state="modified">
      <span>modified</span>

      <LaunchEditor workshopFile="exercises/01.nested-routing/01-02.problem/app/entry.server.tsx">
        <code>app/entry.server.tsx</code>
      </LaunchEditor>
    </li>

    <li data-state="modified">
      <span>modified</span>

      <LaunchEditor workshopFile="exercises/01.nested-routing/01-02.problem/app/root.tsx">
        <code>app/root.tsx</code>
      </LaunchEditor>
    </li>

    <li data-state="deleted">
      <span>deleted</span>

      <LaunchEditor workshopFile="exercises/01.nested-routing/01-02.problem/app/routes/$.tsx">
        <code>app/routes/$.tsx</code>
      </LaunchEditor>
    </li>

    <li data-state="deleted">
      <span>deleted</span>

      <LaunchEditor workshopFile="exercises/01.nested-routing/01-02.problem/app/routes/deleted.tsx">
        <code>app/routes/deleted.tsx</code>
      </LaunchEditor>
    </li>

    <li data-state="modified">
      <span>modified</span>

      <LaunchEditor workshopFile="exercises/01.nested-routing/01-02.problem/app/routes/index.tsx">
        <code>app/routes/index.tsx</code>
      </LaunchEditor>
    </li>

    <li data-state="modified">
      <span>modified</span>

      <LaunchEditor workshopFile="exercises/01.nested-routing/01-02.problem/package.json">
        <code>package.json</code>
      </LaunchEditor>
    </li>

  </ul>
</section>
