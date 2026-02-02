import { App } from "@octokit/app";
import { Octokit } from "@octokit/rest";
import { createCheckReporter } from "./checkReporter.js";
import { getPrHeadSha } from "./status.js";
import { detectRepoTooling, isSupportedFile, listPullRequestFiles } from "./repoInspector.js";
import { dispatchRunnerWorkflow } from "./runnerDispatch.js";
import { getRunnerConfig } from "./runnerConfig.js";
import { getPlan, planPolicy } from "./plan.js";

type PullRequestPayload = {
  action: "opened" | "synchronize" | "reopened" | "ready_for_review";
  installation?: { id: number };
  repository?: { name?: string; owner?: { login?: string; type?: string }; full_name?: string };
  pull_request?: {
    number: number;
    html_url?: string;
    head: { sha: string; ref: string; repo: { full_name: string } | null };
    base: { sha?: string; repo: { full_name: string } | null };
  };
};

type PullRequestHandlerDeps = {
  app: App;
  createOctokit: (token: string) => Octokit;
  createCheckReporter?: typeof createCheckReporter;
  listPullRequestFiles?: typeof listPullRequestFiles;
  detectRepoTooling?: typeof detectRepoTooling;
  dispatchRunnerWorkflow?: typeof dispatchRunnerWorkflow;
  getRunnerConfig?: typeof getRunnerConfig;
  getPlan?: typeof getPlan;
  planPolicy?: typeof planPolicy;
};

const ALLOWED_ACTIONS = ["opened", "synchronize", "reopened", "ready_for_review"] as const;

export const createPullRequestHandler =
  ({
    app,
    createOctokit,
    createCheckReporter: createCheckReporterImpl = createCheckReporter,
    listPullRequestFiles: listPullRequestFilesImpl = listPullRequestFiles,
    detectRepoTooling: detectRepoToolingImpl = detectRepoTooling,
    dispatchRunnerWorkflow: dispatchRunnerWorkflowImpl = dispatchRunnerWorkflow,
    getRunnerConfig: getRunnerConfigImpl = getRunnerConfig,
    getPlan: getPlanImpl = getPlan,
    planPolicy: planPolicyImpl = planPolicy
  }: PullRequestHandlerDeps) =>
  async (event: { payload: unknown }): Promise<void> => {
    const payload = event.payload as PullRequestPayload;
    if (!payload.installation) {
      console.warn("Missing installation in pull_request payload");
      return;
    }
    if (!payload.pull_request) {
      console.warn("Missing pull_request in payload", { installationId: payload.installation.id });
      return;
    }
    if (!ALLOWED_ACTIONS.includes(payload.action)) {
      return;
    }

    const installationId = payload.installation.id;
    const owner = payload.repository?.owner?.login;
    const repo = payload.repository?.name;
    if (!owner || !repo) {
      console.warn("Missing repository info in pull_request payload", { installationId });
      return;
    }
    const repoFullName = payload.repository?.full_name ?? `${owner}/${repo}`;
    const pullRequest = payload.pull_request;
    if (!pullRequest.head.repo || !pullRequest.base.repo) {
      return;
    }
    const headSha = getPrHeadSha(payload);
    if (!headSha) {
      console.warn("Missing pull request head SHA", { installationId });
      return;
    }
    const targetUrl = pullRequest.html_url;

    let octokit: Octokit | null = null;

    try {
      const appOctokit = await app.getInstallationOctokit(installationId);
      const tokenResponse = await appOctokit.request("POST /app/installations/{installation_id}/access_tokens", {
        installation_id: installationId
      });
      const token = tokenResponse.data.token as string;
      octokit = createOctokit(token);

      const reporter = createCheckReporterImpl({
        octokit,
        owner,
        repo,
        headSha,
        targetUrl
      });
      await reporter.init();

      const changedFiles = await listPullRequestFilesImpl({
        octokit,
        owner,
        repo,
        pullNumber: pullRequest.number
      });
      const hasSupportedFiles = changedFiles.some((file) => isSupportedFile(file));
      if (!hasSupportedFiles) {
        await reporter.completeSuccess("Skipped: no supported files changed");
        return;
      }

      const tooling = await detectRepoToolingImpl({ octokit, owner, repo, headSha });
      if (!tooling.hasEslint && !tooling.hasPrettier) {
        await reporter.completeSuccess("Skipped: Prettier/ESLint not configured");
        return;
      }

      await reporter.markInProgress();

      const runnerConfig = getRunnerConfigImpl();
      if (!runnerConfig.callbackToken || !runnerConfig.callbackUrl) {
        console.warn("Runner dispatch skipped due to missing callback configuration.");
        await reporter.completeSuccess("Skipped: dispatch failed (best-effort)");
        return;
      }

      const plan = getPlanImpl(installationId, repoFullName);
      const policy = planPolicyImpl(plan);

      try {
        await dispatchRunnerWorkflowImpl({
          octokit,
          runnerConfig,
          payload: {
            owner,
            repo,
            prNumber: pullRequest.number,
            headSha,
            baseSha: pullRequest.base.sha ?? "",
            ref: pullRequest.head.ref,
            installationId,
            plan,
            priority: policy.priority,
            callbackUrl: runnerConfig.callbackUrl,
            callbackToken: runnerConfig.callbackToken
          }
        });
      } catch (error) {
        console.error("Runner dispatch failed", error);
        await reporter.completeSuccess("Skipped: dispatch failed (best-effort)");
      }
    } catch (error) {
      console.error("Pull request handler failed", error);
      if (octokit) {
        const reporter = createCheckReporterImpl({
          octokit,
          owner,
          repo,
          headSha,
          targetUrl
        });
        await reporter.init();
        await reporter.completeSuccess("Skipped: internal error (best-effort)");
      }
      throw error;
    }
  };
