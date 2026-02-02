import type { OctokitLike } from "./githubClient.js";
import type { Plan, PlanPolicy } from "./plan.js";
import type { CheckReporter } from "./checkReporter.js";
import { getPrHeadSha } from "./status.js";
import type { RunnerConfig, RunnerDispatchPayload } from "./runnerDispatch.js";

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
  getInstallationToken: (installationId: number) => Promise<string>;
  createOctokit: (token: string) => OctokitLike;
  createCheckReporter: (options: {
    octokit: OctokitLike;
    owner: string;
    repo: string;
    headSha: string;
    targetUrl?: string;
  }) => CheckReporter;
  listPullRequestFiles: (params: {
    octokit: OctokitLike;
    owner: string;
    repo: string;
    pullNumber: number;
  }) => Promise<string[]>;
  detectRepoTooling: (params: {
    octokit: OctokitLike;
    owner: string;
    repo: string;
    headSha: string;
  }) => Promise<{ hasEslint: boolean; hasPrettier: boolean }>;
  isSupportedFile: (filename: string) => boolean;
  dispatchRunnerWorkflow: (params: {
    octokit: OctokitLike;
    runnerConfig: RunnerConfig;
    payload: RunnerDispatchPayload;
  }) => Promise<void>;
  getRunnerConfig: () => RunnerConfig;
  getPlan: (installationId: number, repoFullName: string) => Plan;
  planPolicy: (plan: Plan) => PlanPolicy;
};

const ALLOWED_ACTIONS = ["opened", "synchronize", "reopened", "ready_for_review"] as const;

const isPullRequestPayload = (value: unknown): value is PullRequestPayload =>
  !!value && typeof value === "object" && "action" in value;

export const createPullRequestHandler =
  ({
    getInstallationToken,
    createOctokit,
    createCheckReporter: createCheckReporterImpl,
    listPullRequestFiles: listPullRequestFilesImpl,
    detectRepoTooling: detectRepoToolingImpl,
    isSupportedFile: isSupportedFileImpl,
    dispatchRunnerWorkflow: dispatchRunnerWorkflowImpl,
    getRunnerConfig: getRunnerConfigImpl,
    getPlan: getPlanImpl,
    planPolicy: planPolicyImpl
  }: PullRequestHandlerDeps) =>
  async (event: { payload: unknown }): Promise<void> => {
    if (!isPullRequestPayload(event.payload)) {
      console.warn("Invalid pull_request payload");
      return;
    }
    const payload = event.payload;
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

    let octokit: OctokitLike | null = null;

    try {
      const token = await getInstallationToken(installationId);
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
      const hasSupportedFiles = changedFiles.some((file) => isSupportedFileImpl(file));
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
