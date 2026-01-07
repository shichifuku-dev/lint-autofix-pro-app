# Troubleshooting

## Webhook signature failures
- Ensure `WEBHOOK_SECRET` matches the GitHub App webhook secret.
- Confirm the request is sent to `/webhooks`.

## No comment posted
- Verify the app has **Issues** and **Pull requests** permissions.
- Check server logs for webhook processing errors.

## Prettier/ESLint skipped
- Make sure the packages are in `devDependencies` and installed.
- Ensure `eslint.config.*` exists for ESLint v9 flat config.
- Set `strict: true` to force failures on missing tools.

## Auto-commit not working
- Confirm `mode: autocommit` and `autocommit.enabled: true`.
- Ensure the PR is not from a fork.
- Set **Contents** permission to write.
