### Troubleshooting: “Could not locate workshop-app directory”

This checklist helps resolve cases where starting the workshop shows:

> Could not locate workshop-app directory

Node 20+ is required.

- **Use the correct CLI invocation (avoid npx grabbing the wrong package)**
  ```bash
  # Preferred
  npm --prefix ./epicshop exec epicshop --version
  npm --prefix ./epicshop exec epicshop start

  # Or invoke the local binary directly
  node ./epicshop/node_modules/.bin/epicshop start
  ```

- **Verify the workshop-app is actually installed locally**
  ```bash
  test -f ./epicshop/node_modules/@epic-web/workshop-app/package.json \
    && echo "workshop-app found" \
    || echo "workshop-app MISSING"
  ```
  - If missing or corrupted, reinstall just the nested `epicshop` deps:
    ```bash
    rm -rf ./epicshop/node_modules ./epicshop/package-lock.json
    npm install --prefix ./epicshop
    ```

- **Clean lockfiles/caches if installs look stale**
  ```bash
  rm -rf node_modules package-lock.json
  rm -rf ./epicshop/node_modules ./epicshop/package-lock.json
  npm ci
  npm install --prefix ./epicshop
  ```

- **If relying on a global install**
  - The CLI looks in npm’s global root. Reinstall globally with npm:
    ```bash
    npm i -g @epic-web/workshop-app
    ```
  - Or point directly via env var (replace with your absolute path):
    - macOS/Linux:
      ```bash
      export EPICSHOP_APP_LOCATION="/abs/path/to/repo/epicshop/node_modules/@epic-web/workshop-app"
      npm --prefix ./epicshop exec epicshop start
      ```
    - Windows PowerShell:
      ```powershell
      $env:EPICSHOP_APP_LOCATION="C:\path\to\repo\epicshop\node_modules\@epic-web\workshop-app"
      npm --prefix .\epicshop exec epicshop start
      ```

- **Run from the expected project layout**
  - Ensure your project’s start script points at `./epicshop` and that folder exists with dependencies installed.

- **Quick diagnostics (copy/paste output when asking for help)**
  ```bash
  node -v
  npm -v
  echo "${EPICSHOP_APP_LOCATION}"
  npm --prefix ./epicshop exec epicshop --version || echo "epicshop bin not found"
  node -e "console.log(require.resolve('@epic-web/workshop-app/package.json'))" 2>/dev/null || echo "workshop-app not resolvable"
  ls -la ./epicshop/node_modules/@epic-web/workshop-app/package.json 2>/dev/null || echo "workshop-app package.json missing"
  ```

- **Confirm Node version**
  ```bash
  node -v  # should be >= 20
  ```

Summary:
- Use the local CLI via `npm --prefix ./epicshop exec epicshop start` to avoid `npx` resolving the wrong package.
- Confirm `@epic-web/workshop-app` exists under `./epicshop/node_modules`.
- If needed, reinstall `./epicshop` deps and/or set `EPICSHOP_APP_LOCATION` to the absolute path.