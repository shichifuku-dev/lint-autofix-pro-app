export type RunnerConfig = {
  owner: string;
  repo: string;
  workflow: string;
  callbackToken: string;
  callbackUrl: string;
};

export type RunnerEnv = {
  RUNNER_OWNER?: string;
  RUNNER_REPO?: string;
  RUNNER_WORKFLOW?: string;
  RUNNER_CALLBACK_TOKEN?: string;
  CALLBACK_TOKEN?: string;
  PUBLIC_APP_URL?: string;
};

const defaultEnv = (): RunnerEnv => {
  if (typeof process !== "undefined" && process.env) {
    return process.env as RunnerEnv;
  }
  return {};
};

export const getRunnerConfig = (env: RunnerEnv = defaultEnv()): RunnerConfig => {
  const owner = env.RUNNER_OWNER ?? "shichifuku-dev";
  const repo = env.RUNNER_REPO ?? "lint-autofix-pro-runner";
  const workflow = env.RUNNER_WORKFLOW ?? "run.yml";
  const callbackToken = env.CALLBACK_TOKEN ?? env.RUNNER_CALLBACK_TOKEN ?? "";
  const publicAppUrl = env.PUBLIC_APP_URL ?? "";
  const callbackUrl = publicAppUrl ? new URL("/callbacks/runner", publicAppUrl).toString() : "";

  return {
    owner,
    repo,
    workflow,
    callbackToken,
    callbackUrl
  };
};
