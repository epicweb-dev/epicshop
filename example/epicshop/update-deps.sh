bunx npm-check-updates --dep prod,dev --upgrade --root
cd epicshop && bunx npm-check-updates --dep prod,dev --upgrade --root
cd ..
rm -rf node_modules package-lock.json ./epicshop/package-lock.json ./epicshop/node_modules ./exercises/**/node_modules
bun install
bun run setup
bun run typecheck
bun run lint --fix
