# Lint Autofix Pro

🛠 **Lint Autofix Pro**  
Automatically fixes ESLint / Prettier issues in pull requests  
👉 https://github.com/marketplace/lint-autofix-pro

Automatically fixes formatting issues in pull requests using **Prettier** and **ESLint**,  
and **always reports required CI checks** to prevent blocked merges.

Lint Autofix Pro is a GitHub App designed to keep pull requests clean, consistent, and mergeable  
without manual formatting work or fragile CI setups.

---

## What It Does

Lint Autofix Pro runs on pull requests and:

- Detects formatting issues using the repository’s existing Prettier and ESLint configuration
- Applies safe, automatic fixes when possible
- Reports clear results directly on the pull request
- **Always reports required CI checks (`CI/check`, `CI/autofix`)**, even when no fixes are applied

This prevents pull requests from being blocked by missing or stuck status checks.

---

## How It Works

1. A pull request is opened or updated
2. The app checks the repository for supported tools (Prettier / ESLint)
3. The app dispatches a runner workflow to perform linting and autofix on the PR branch
4. The runner reports results back to the app, which completes the required checks
5. If required tools are not configured or supported files are missing:
   - Execution is safely skipped
   - Status checks are still reported

The app **never modifies the default branch directly**.  
All changes are applied only within the pull request branch.

---

## Supported Tools

- **Prettier**
- **ESLint**

Lint Autofix Pro uses your existing configuration files.  
No configuration files are generated, modified, or inferred automatically.

---

## Autofix Behavior

- **Fixable issues**
  - A commit is added to the pull request with the applied changes
- **Detected but non-fixable issues**
  - A comment is posted explaining what failed
- **Prettier / ESLint not installed**
  - Execution is skipped
  - No commit is created
  - Required CI checks are reported as completed

---

## Pull Request Status Checks

The app reports results as **GitHub check runs**, with commit statuses only as a fallback.

Required contexts reported:

- `CI/check`
- `CI/autofix`

Even when no fixes are applied, these checks are reported as **success**  
to avoid blocking merges due to missing or pending CI statuses.

Typical outcomes:

- **Success** — fixes applied or no issues found
- **Failure** — issues detected but not automatically fixable
- **Skipped** — required tools not configured

Repositories may choose to require these checks before merging.

---

## Safety Guarantees

- No force pushes
- No direct commits to protected branches
- No file changes outside the pull request scope
- No configuration files are created or altered

All actions are deterministic and traceable via pull request commits and comments.

---

## Permissions

Lint Autofix Pro requests the minimum permissions required to:

- Read repository contents
- Create commits on pull request branches
- Post comments on pull requests
- Report status checks

---

## Disclaimer (Important)

This tool does **not** guarantee mergeability, correctness, availability, or production safety.  
It provides **best-effort CI reporting and automated formatting only**.

Lint Autofix Pro is **not responsible** for:

- Production outages
- Lost revenue
- Data loss
- Any direct or indirect damages

Use at your own discretion, consistent with GitHub Marketplace terms.

---

## Billing

Billing and plan details are managed through **GitHub Marketplace**.

Please refer to the Marketplace listing for current pricing and plan information.  
Private repositories require a paid plan.

---

## Webhook Usage

> Note: Marketplace webhooks are configured for future paid plan features.  
> The current Free plan does not rely on Marketplace webhooks for its operation.

---

## Cloudflare Worker Deployment

Webhook processing can be deployed to Cloudflare Workers without changing the GitHub App webhook URL.

Required environment variables:

- `GITHUB_APP_ID`
- `GITHUB_APP_PRIVATE_KEY` (PEM private key with newlines escaped as `\\n`)
- `WEBHOOK_SECRET`

Optional runner configuration (defaults match the app server):

- `RUNNER_OWNER`
- `RUNNER_REPO`
- `RUNNER_WORKFLOW`
- `RUNNER_CALLBACK_TOKEN`
- `PUBLIC_APP_URL`

Use the worker scripts from the app server package:

- `npm run worker:dev`
- `npm run worker:deploy`

---

## Support

If you encounter unexpected behavior, please open an issue including:

- A link to the pull request
- The reported status check output
