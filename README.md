# Lint Autofix Pro

Automatically fixes formatting issues in pull requests using Prettier and ESLint.

This GitHub App runs on pull requests, detects common formatting problems, and applies safe, automatic fixes when possible.  
When fixes cannot be applied, it reports the results clearly in the pull request conversation.

---

## How It Works

1. A pull request is opened or updated.
2. The app checks the repository for supported tools (Prettier / ESLint).
3. If formatting issues are detected:
   - Fixable issues are automatically committed to the pull request.
   - Non-fixable issues are reported via a pull request comment.
4. If required tools are not configured, the app skips execution safely.

The app never modifies the default branch directly.  
All changes are applied only within the pull request branch.

---

## Supported Tools

- **Prettier**
- **ESLint**

The app uses the repository’s existing configuration files.  
No configuration is generated or modified automatically.

---

## Autofix Behavior

- If formatting issues can be safely fixed:
  - A commit is added to the pull request with the applied changes.
- If issues are detected but cannot be fixed automatically:
  - A comment is posted explaining what failed.
- If Prettier or ESLint is not installed:
  - The check is skipped.
  - No commit is created.
  - A status is reported indicating the skip.

---

## Pull Request Status Checks

The app reports its result as a status check on the pull request.
Even when no fixes are applied, it reports required checks `CI/check` and `CI/autofix` as success to avoid blocking merges.

Typical outcomes include:
- Success (fixes applied or no issues found)
- Failure (issues detected but not fixable)
- Skipped (required tools not configured)

Repositories may choose to require this check before merging.

---

## Safety Guarantees

- No force pushes
- No direct commits to protected branches
- No file changes outside the pull request scope
- No configuration files are created or altered

All actions are deterministic and traceable via pull request commits and comments.

---

## Permissions

The app requires the minimum permissions necessary to:
- Read repository contents
- Create commits on pull request branches
- Post comments on pull requests
- Report status checks

---

## Billing

Billing and plan details are managed through GitHub Marketplace.

Please refer to the Marketplace listing for the latest pricing and trial information.

---

## Support

If you encounter unexpected behavior, please open an issue with:
- A link to the pull request
- The reported status check output
