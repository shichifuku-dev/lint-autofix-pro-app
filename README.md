# Lint Autofix Pro (GitHub App)

Lint Autofix Pro is a production-ready GitHub App that listens to pull request events, runs Prettier/ESLint auto-fixes, and posts a single updated comment with the diff. The server runs on your own infrastructure (SaaS-ready).

## Repository layout
- `app-server/` — Node.js + Express webhook server, Prisma storage, and pipeline logic.
- `docs/` — Architecture, security, troubleshooting, and product documentation.

## Quick start
```bash
cd app-server
cp .env.example .env
npm install
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

## Deployment
Docker and non-Docker deployment steps (including environment variables, Prisma migrations, and Render template) live in `app-server/README.md`.

See `app-server/README.md` for setup details and `docs/README.md` for documentation.
