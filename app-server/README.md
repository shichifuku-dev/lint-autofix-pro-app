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

## Deployment (Render example)
1. Create a new Render web service with Node 20.
2. Set environment variables from `.env`.
3. Add a build command: `npm install && npm run prisma:generate && npm run build`.
4. Start command: `npm run start`.
5. Ensure the webhook URL is reachable from GitHub.
