# Architecture

## Overview
Lint Autofix Pro is a GitHub App SaaS that receives pull request webhooks, checks out the PR code in a temporary workspace, runs Prettier/ESLint with auto-fix enabled, and posts a single updated PR comment with the results.

## High-level flow
1. **Webhook intake** (`/webhooks`): Verify the GitHub signature and dispatch to handlers.
2. **PR processing** (`src/pipeline.ts`):
   - Fetch the PR head SHA using the installation token.
   - Load `.lint-autofix-pro.yml` config (root or working directory).
   - Install dependencies and run Prettier/ESLint fixers.
   - Compute diff and changed files (scoped to working directory).
   - Optionally auto-commit fixes if enabled and the PR is not from a fork.
3. **Comment upsert** (`src/comments.ts`):
   - Find the existing comment by a stable marker.
   - Update it or create a new one.

## Key modules
- `src/index.ts`: Express server, webhook wiring, admin endpoint.
- `src/pipeline.ts`: Git checkout, lint fixes, diff generation, auto-commit.
- `src/config.ts`: Configuration parsing and defaults.
- `src/comment.ts`: Comment body formatting.
- `src/comments.ts`: GitHub comment upsert.
- `src/db.ts`: Prisma client for installation/config storage.
