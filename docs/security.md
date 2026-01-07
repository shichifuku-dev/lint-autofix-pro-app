# Security

## Webhook verification
Webhook requests are verified using the GitHub App webhook secret before any processing occurs.

## Secrets handling
- The GitHub App private key is supplied via `PRIVATE_KEY` environment variable.
- Webhook secrets and admin tokens are never logged.

## Least privilege
Recommended permissions:
- Pull requests: read/write
- Issues: read/write
- Contents: read (upgrade to write only when auto-commit is enabled)

## Fork safety
Auto-commit is disabled on forked pull requests to avoid pushing to untrusted forks.
