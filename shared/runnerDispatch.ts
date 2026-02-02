import type { OctokitLike } from "./githubClient.js";

export type RunnerConfig = {
  owner: string;
  repo: string;
  workflow: string;
  callbackToken: string;
  callbackUrl: string;
};

export type RunnerDispatchPayload = {
  owner: string;
  repo: string;
  prNumber: number;
  headSha: string;
  baseSha: string;
  ref: string;
  installationId: number;
  plan: string;
  priority: number;
  callbackUrl: string;
  callbackToken: string;
};

const buildInputs = (payload: RunnerDispatchPayload): Record<string, string> => ({
  owner: payload.owner,
  repo: payload.repo,
  prNumber: String(payload.prNumber),
  headSha: payload.headSha,
  baseSha: payload.baseSha,
  ref: payload.ref,
  installationId: String(payload.installationId),
  plan: payload.plan,
  priority: String(payload.priority),
  callbackUrl: payload.callbackUrl,
  callbackToken: payload.callbackToken
});

export const dispatchRunnerWorkflow = async ({
  octokit,
  runnerConfig,
  payload
}: {
  octokit: OctokitLike;
  runnerConfig: RunnerConfig;
  payload: RunnerDispatchPayload;
}): Promise<void> => {
  console.log("Dispatching runner workflow", {
    owner: runnerConfig.owner,
    repo: runnerConfig.repo,
    workflow: runnerConfig.workflow,
    prNumber: payload.prNumber,
    installationId: payload.installationId
  });
  await octokit.actions.createWorkflowDispatch({
    owner: runnerConfig.owner,
    repo: runnerConfig.repo,
    workflow_id: runnerConfig.workflow,
    ref: "main",
    inputs: buildInputs(payload)
  });
};
