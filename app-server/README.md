# Lint Autofix Pro (App Server)

Production-ready GitHub App server that listens to `pull_request` webhooks, runs Prettier/ESLint auto-fixes, and posts a single updated comment with a diff.

## Requirements
- Node.js 20
- npm
- SQLite (via Prisma)

## Setup
1. Copy `.env.example` to `.env` and fill in values.
2. Install dependencies: `npm install`
3. Generate Prisma client: `npm run prisma:generate`
4. Run migrations (creates `dev.db`): `npm run prisma:migrate`
5. Start the server: `npm run dev`

## Production environment variables
Set these in your hosting platform or `.env` file:
- `APP_ID` — GitHub App ID
- `PRIVATE_KEY` — PEM private key with newlines escaped (`\n`)
- `WEBHOOK_SECRET` — GitHub webhook secret
- `ADMIN_TOKEN` — bearer token for the `/admin` endpoint
- `DATABASE_URL` — Prisma connection string (SQLite recommended below)
- `PORT` — optional; defaults to `3000`

## Prisma in production
Generate the client and apply migrations before starting:
```bash
npm run prisma:generate
npx prisma migrate deploy
```

## GitHub App setup
Use `app-manifest.yml` to bootstrap a GitHub App. Update the manifest values:
- `hook_attributes.url` must point to your `/webhooks` endpoint.
- Update `secret` to match `WEBHOOK_SECRET`.
- Update `url`/`redirect_url` to match your deployment.

**Permissions**
- Pull requests: Read & write (to post comments)
- Issues: Read & write
- Contents: Read (upgrade to write only when auto-commit is enabled)

**Events**
- `pull_request` (opened, synchronize, reopened)
- `installation` (created, deleted)

## Configuration
Create `.lint-autofix-pro.yml` at the repo root (or within `working_directory`).

```yaml
working_directory: "."
run_prettier: true
run_eslint: true
strict: false
max_files: 10
mode: "comment" # or "autocommit"
autocommit:
  enabled: false
  commit_message: "chore: lint autofix"
  author_name: "Lint Autofix Pro"
  author_email: "lint-autofix-pro@users.noreply.github.com"
```

Auto-commit only runs when `mode: autocommit` and `autocommit.enabled: true`.

## Endpoints
- `POST /webhooks` — GitHub webhook intake
- `GET /health` — health check
- `GET /admin` — minimal admin page (requires `Authorization: Bearer $ADMIN_TOKEN`)

## Production deployment

### SQLite in production (default)
SQLite keeps ops minimal but **only supports a single running instance**. If you need horizontal scaling or automatic failover, move to Postgres.
For production, **persist the database file** by placing it on a volume and pointing `DATABASE_URL` to that file:
```
DATABASE_URL="file:/var/data/app.db"
```

### Docker (multi-stage)
Build and run the container, mounting a volume for SQLite:
```bash
docker build -t lint-autofix-pro-app ./app-server
docker run --rm -p 3000:3000 \
  -e APP_ID=123456 \
  -e PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----" \
  -e WEBHOOK_SECRET=supersecret \
  -e ADMIN_TOKEN=changeme \
  -e DATABASE_URL="file:/var/data/app.db" \
  -v lint-autofix-pro-data:/var/data \
  lint-autofix-pro-app
```
Run migrations once (outside or inside the container):
```bash
docker run --rm \
  -e DATABASE_URL="file:/var/data/app.db" \
  -v lint-autofix-pro-data:/var/data \
  lint-autofix-pro-app npx prisma migrate deploy
```

### Non-Docker (VM or bare metal)
```bash
cd app-server
npm ci
npm run prisma:generate
npx prisma migrate deploy
npm run build
NODE_ENV=production npm run start
```

### Render deployment template
This repo includes `render.yaml` for a Render web service with a persistent disk.
1. In Render, choose **New > Blueprint** and select this repo.
2. Set the required environment variables (`APP_ID`, `PRIVATE_KEY`, `WEBHOOK_SECRET`, `ADMIN_TOKEN`).
3. Deploy. The service will store SQLite at `/var/data/app.db`.
