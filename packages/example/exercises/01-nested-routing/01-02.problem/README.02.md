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

## Files 🗃

<ul>
  <li className="flex gap-2">
    <span>modified:</span>
    <LaunchEditor file="/Users/kentcdodds/code/epicweb-dev/kcdshop/packages/example/exercises/01-nested-routing/01-02.problem/app/entry.server.tsx">
      `app/entry.server.tsx`
    </LaunchEditor>
  </li>
  <li className="flex gap-2">
    <span>modified:</span>
    <LaunchEditor file="/Users/kentcdodds/code/epicweb-dev/kcdshop/packages/example/exercises/01-nested-routing/01-02.problem/app/root.tsx">
      `app/root.tsx`
    </LaunchEditor>
  </li>
  <li className="flex gap-2">
    <span>deleted:</span>
    <LaunchEditor file="/Users/kentcdodds/code/epicweb-dev/kcdshop/packages/example/exercises/01-nested-routing/01-02.problem/app/routes/$.tsx">
      `app/routes/$.tsx`
    </LaunchEditor>
  </li>
  <li className="flex gap-2">
    <span>deleted:</span>
    <LaunchEditor file="/Users/kentcdodds/code/epicweb-dev/kcdshop/packages/example/exercises/01-nested-routing/01-02.problem/app/routes/deleted.tsx">
      `app/routes/deleted.tsx`
    </LaunchEditor>
  </li>
  <li className="flex gap-2">
    <span>modified:</span>
    <LaunchEditor file="/Users/kentcdodds/code/epicweb-dev/kcdshop/packages/example/exercises/01-nested-routing/01-02.problem/app/routes/index.tsx">
      `app/routes/index.tsx`
    </LaunchEditor>
  </li>
</ul>
