# Terminal Commands

Quick reference for running Sheetly. Uses `pnpm` (see `packageManager` in `package.json`).

## Setup

```bash
pnpm install
```

Create `.dev.vars` (gitignored) for local login:

```ini
BASIC_AUTH_USER=your-username
BASIC_AUTH_PASSWORD=your-password
SESSION_SECRET=your-random-secret
```

## Development

```bash
pnpm dev              # Vite dev server (UI only)
pnpm preview:worker   # Build + run with Cloudflare Pages worker (D1/R2/API)
```

> Use `preview:worker` when you need the snapshot/API endpoints. Plain `pnpm dev` has no worker.

## Quality checks

```bash
pnpm typecheck        # TypeScript
pnpm lint             # Oxlint
pnpm build            # Typecheck + production build
```

## Database (D1)

```bash
pnpm db:migrate:local    # Apply migrations to local D1
pnpm db:migrate:remote   # Apply migrations to remote D1
```

## Cloudflare setup

```bash
wrangler d1 create sheetly-db
wrangler r2 bucket create sheetly-uploads

wrangler pages secret put BASIC_AUTH_USER
wrangler pages secret put BASIC_AUTH_PASSWORD
wrangler pages secret put SESSION_SECRET
```

## Git

```bash
git status
git add .
git commit -m "message"
git push
```
