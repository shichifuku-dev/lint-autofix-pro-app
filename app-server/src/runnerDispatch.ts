import type { Octokit } from "@octokit/rest";
import type { RunnerConfig } from "./runnerConfig.js";

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
  octokit: Octokit;
  runnerConfig: RunnerConfig;
  payload: RunnerDispatchPayload;
}): Promise<void> => {
  await octokit.actions.createWorkflowDispatch({
    owner: runnerConfig.owner,
    repo: runnerConfig.repo,
    workflow_id: runnerConfig.workflow,
    ref: "main",
    inputs: buildInputs(payload)
  });
};
