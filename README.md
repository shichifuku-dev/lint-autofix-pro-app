# Lint Autofix Pro

Lint Autofix Pro is a GitHub App that automatically runs Prettier and ESLint on pull requests and **always reports required CI checks**, even when no fixes are needed.

This prevents branch protection rules from getting stuck on  
“Expected — Waiting for status to be reported”.

---

## Overview

Lint Autofix Pro runs on pull requests, detects common formatting issues, and applies safe, automatic fixes when possible.

When fixes cannot be applied, it reports the results clearly in the pull request conversation while still completing all required status checks.

The app never modifies the default branch directly.  
All actions are scoped strictly to the pull request branch.

---

## How It Works

1. A pull request is opened, updated, or marked ready for review.
2. The app checks the repository for supported tools (Prettier / ESLint).
3. If formatting issues are detected:
   - Fixable issues are automatically committed to the pull request.
   - Non-fixable issues are reported via a pull request comment.
4. If required tools are not configured:
   - Execution is safely skipped.
   - Required status checks are still reported as completed.

---

## Supported Tools

- **Prettier**
- **ESLint**

The app uses the repository’s existing configuration files.  
No configuration files are created, modified, or inferred automatically.

---

## Autofix Behavior

- **Fixable issues**
  - A commit is added to the pull request with applied fixes.
- **Detected but non-fixable issues**
  - A comment explains what failed and why.
- **Required tools not installed**
  - No commit is created.
  - Execution is skipped safely.
  - Status checks are still completed.

---

## Pull Request Status Checks

The app always reports the following required contexts on pull requests:

- `CI/check`
- `CI/autofix`

These checks are reported as GitHub check runs and commit statuses.

Even when:
- No supported files are changed
- No package.json is found
- No fixes are applied

Both required checks are completed to prevent merges from being blocked by missing statuses.

Typical outcomes:
- **Success**: fixes applied or no issues found
- **Failure**: issues detected but not fixable
- **Skipped**: required tools not configured

Repositories may choose to require these checks via branch protection rules.

---

## Safety Guarantees

- No force pushes
- No direct commits to protected branches
- No file changes outside the pull request scope
- No configuration files are created or altered

All actions are deterministic and traceable through pull request commits, comments, and check output.

---

## Permissions

The app requests only the minimum permissions required to:
- Read repository contents
- Create commits on pull request branches
- Post comments on pull requests
- Report check runs and commit statuses

---

## Billing

Billing and plan details are managed through GitHub Marketplace.

Please refer to the Marketplace listing for the latest pricing and plan information.

---

## Support

If you encounter unexpected behavior, please open an issue including:
- A link to the pull request
- The reported check output