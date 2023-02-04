# KCD Quick Stack

![The KCD Quick Stack](https://user-images.githubusercontent.com/1500684/179116947-2130811f-8355-4682-b09b-b222eba0586e.png)

The primary use of this stack is for Kent to quickly setup new Remix apps that
have no more than the bare necessities.

Learn more about [Remix Stacks](https://remix.run/stacks).

```
npx create-remix --template kentcdodds/quick-stack
```

## What's in the stack

- [Fly app deployment](https://fly.io) with [Docker](https://www.docker.com/)
- Production-ready [SQLite Database](https://sqlite.org)
- [GitHub Actions](https://github.com/features/actions) for deploy on merge to
  production
- Email/Password Authentication with
  [cookie-based sessions](https://remix.run/docs/en/v1/api/remix#createcookiesessionstorage)
- Database ORM with [Prisma](https://prisma.io)
- Styling with [Tailwind](https://tailwindcss.com/)
- Code formatting with [Prettier](https://prettier.io)
- Linting with [ESLint](https://eslint.org)
- Static Types with [TypeScript](https://typescriptlang.org)

Not a fan of bits of the stack? Fork it, change it, and use
`npx create-remix --template your/repo`! Make it your own.

## Development

- This step only applies if you've opted out of having the CLI install
  dependencies for you:

  ```sh
  npx remix init
  ```

- Initial setup: _If you just generated this project, this step has been done
  for you._

  ```sh
  npm run setup
  ```

- Start dev server:

  ```sh
  npm run dev
  ```

This starts your app in development mode, rebuilding assets on file changes.

The database seed script creates a new user with some data you can use to get
started:

- Email: `rachel@remix.run`
- Password: `racheliscool`

### Relevant code:

This app does nothing. You can login and logout. That's it.

- creating users, and logging in and out
  [./app/models/user.server.ts](./app/models/user.server.ts)
- user sessions, and verifying them
  [./app/session.server.ts](./app/session.server.ts)

## Deployment

This Remix Stack comes with two GitHub Actions that handle automatically
deploying your app to production.

Prior to your first deployment, you'll need to do a few things:

- [Install Fly](https://fly.io/docs/getting-started/installing-flyctl/)

- Sign up and log in to Fly

  ```sh
  fly auth signup
  ```

  > **Note:** If you have more than one Fly account, ensure that you are signed
  > into the same account in the Fly CLI as you are in the browser. In your
  > terminal, run `fly auth whoami` and ensure the email matches the Fly account
  > signed into the browser.

- Create two apps on Fly, one for production:

  ```sh
  fly create workshop-app-b758
  ```

  > **Note:** Make sure this name matches the `app` set in your `fly.toml` file.
  > Otherwise, you will not be able to deploy.

  - Initialize Git.

  ```sh
  git init
  ```

- Create a new [GitHub Repository](https://repo.new), and then add it as the
  remote for your project. **Do not push your app yet!**

  ```sh
  git remote add origin <ORIGIN_URL>
  ```

- Add a `FLY_API_TOKEN` to your GitHub repo. To do this, go to your user
  settings on Fly and create a new
  [token](https://web.fly.io/user/personal_access_tokens/new), then add it to
  [your repo secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
  with the name `FLY_API_TOKEN`.

- Add a `SESSION_SECRET` to your fly app secrets, to do this you can run the
  following command:

  ```sh
  fly secrets set SESSION_SECRET=$(openssl rand -hex 32) --app workshop-app-b758
  ```

  If you don't have openssl installed, you can also use
  [1password](https://1password.com/password-generator/) to generate a random
  secret, just replace `$(openssl rand -hex 32)` with the generated secret.

- Create a persistent volume for the sqlite database for your production
  environment. Run the following:

  ```sh
  fly volumes create data --size 1 --app workshop-app-b758
  ```

Now that everything is set up you can commit and push your changes to your repo.
Every commit to your `main` branch will trigger a deployment to your production
environment.

### Connecting to your database

The sqlite database lives at `/data/sqlite.db` in your deployed application. You
can connect to the live database by running `fly ssh console -C database-cli`.

### Getting Help with Deployment

If you run into any issues deploying to Fly, make sure you've followed all of
the steps above and if you have, then post as many details about your deployment
(including your app name) to
[the Fly support community](https://community.fly.io). They're normally pretty
responsive over there and hopefully can help resolve any of your deployment
issues and questions.

## GitHub Actions

We use GitHub Actions for continuous integration and deployment. Anything that
gets into the `main` branch will be deployed to production after running the
build (we do not run linting/typescript in CI... This is quick remember?).

### Type Checking

This project uses TypeScript. It's recommended to get TypeScript set up for your
editor to get a really great in-editor experience with type checking and
auto-complete. To run type checking across the whole project, run
`npm run typecheck`.

### Linting

This project uses ESLint for linting. That is configured in `.eslintrc.js`.

### Formatting

We use [Prettier](https://prettier.io/) for auto-formatting in this project.
It's recommended to install an editor plugin (like the
[VSCode Prettier plugin](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode))
to get auto-formatting on save. There's also a `npm run format` script you can
run to format all files in the project.
