export type RunnerConfig = {
  owner: string;
  repo: string;
  workflow: string;
  callbackToken: string;
  callbackUrl: string;
};

export const getRunnerConfig = (): RunnerConfig => {
  const owner = process.env.RUNNER_OWNER ?? "shichifuku-dev";
  const repo = process.env.RUNNER_REPO ?? "lint-autofix-pro-runner";
  const workflow = process.env.RUNNER_WORKFLOW ?? "run.yml";
  const callbackToken = process.env.RUNNER_CALLBACK_TOKEN ?? "";
  const publicAppUrl = process.env.PUBLIC_APP_URL ?? "";
  const callbackUrl = publicAppUrl ? new URL("/callbacks/runner", publicAppUrl).toString() : "";

  return {
    owner,
    repo,
    workflow,
    callbackToken,
    callbackUrl
  };
};
