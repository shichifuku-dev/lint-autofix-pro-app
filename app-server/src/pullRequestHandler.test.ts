import { describe, expect, it, vi } from "vitest";
import { createPullRequestHandler } from "./pullRequestHandler.js";

const buildPayload = () => ({
  action: "opened",
  installation: { id: 123 },
  repository: {
    name: "repo",
    full_name: "octo/repo",
    owner: { login: "octo", type: "Organization" }
  },
  pull_request: {
    number: 42,
    html_url: "https://github.com/octo/repo/pull/42",
    head: { sha: "sha123", ref: "feature", repo: { full_name: "octo/repo" } },
    base: { sha: "base123", repo: { full_name: "octo/repo" } }
  }
});

const buildOctokit = () => ({
  actions: {
    createWorkflowDispatch: vi.fn().mockResolvedValue({})
  }
}) as any;

describe("pull request handler dispatch flow", () => {
  it("skips when no supported files are changed", async () => {
    const octokit = buildOctokit();
    const completeSuccess = vi.fn().mockResolvedValue(undefined);
    const markInProgress = vi.fn().mockResolvedValue(undefined);

    const handler = createPullRequestHandler({
      getInstallationToken: vi.fn().mockResolvedValue("token123"),
      createOctokit: () => octokit,
      createCheckReporter: () => ({
        init: vi.fn().mockResolvedValue(undefined),
        markInProgress,
        completeSuccess,
        completeFailure: vi.fn().mockResolvedValue(undefined),
        usingCommitStatuses: vi.fn().mockReturnValue(false)
      }),
      listPullRequestFiles: vi.fn().mockResolvedValue(["README.md"]),
      detectRepoTooling: vi.fn().mockResolvedValue({ hasEslint: true, hasPrettier: true }),
      isSupportedFile: vi.fn().mockReturnValue(false),
      dispatchRunnerWorkflow: vi.fn().mockResolvedValue(undefined),
      getRunnerConfig: vi.fn().mockReturnValue({
        owner: "runner",
        repo: "runner-repo",
        workflow: "run.yml",
        callbackToken: "token",
        callbackUrl: "https://example.com/callbacks/runner"
      }),
      getPlan: vi.fn().mockReturnValue("free"),
      planPolicy: vi.fn().mockReturnValue({
        dispatchTarget: "free",
        priority: 10,
        maxRuntimeSec: 900,
        allowFixCommit: true
      })
    });

    await handler({ payload: buildPayload() });

    expect(markInProgress).not.toHaveBeenCalled();
    expect(completeSuccess).toHaveBeenCalledWith("Skipped: no supported files changed");
  });

  it("skips when tooling is not configured", async () => {
    const octokit = buildOctokit();
    const completeSuccess = vi.fn().mockResolvedValue(undefined);

    const handler = createPullRequestHandler({
      getInstallationToken: vi.fn().mockResolvedValue("token123"),
      createOctokit: () => octokit,
      createCheckReporter: () => ({
        init: vi.fn().mockResolvedValue(undefined),
        markInProgress: vi.fn().mockResolvedValue(undefined),
        completeSuccess,
        completeFailure: vi.fn().mockResolvedValue(undefined),
        usingCommitStatuses: vi.fn().mockReturnValue(false)
      }),
      listPullRequestFiles: vi.fn().mockResolvedValue(["src/app.ts"]),
      detectRepoTooling: vi.fn().mockResolvedValue({ hasEslint: false, hasPrettier: false }),
      isSupportedFile: vi.fn().mockReturnValue(true),
      dispatchRunnerWorkflow: vi.fn().mockResolvedValue(undefined),
      getRunnerConfig: vi.fn().mockReturnValue({
        owner: "runner",
        repo: "runner-repo",
        workflow: "run.yml",
        callbackToken: "token",
        callbackUrl: "https://example.com/callbacks/runner"
      }),
      getPlan: vi.fn().mockReturnValue("free"),
      planPolicy: vi.fn().mockReturnValue({
        dispatchTarget: "free",
        priority: 10,
        maxRuntimeSec: 900,
        allowFixCommit: true
      })
    });

    await handler({ payload: buildPayload() });

    expect(completeSuccess).toHaveBeenCalledWith("Skipped: Prettier/ESLint not configured");
  });

  it("marks checks in progress and skips on dispatch failure", async () => {
    const octokit = buildOctokit();
    const completeSuccess = vi.fn().mockResolvedValue(undefined);
    const markInProgress = vi.fn().mockResolvedValue(undefined);
    const dispatchRunnerWorkflow = vi.fn().mockRejectedValue(new Error("boom"));

    const handler = createPullRequestHandler({
      getInstallationToken: vi.fn().mockResolvedValue("token123"),
      createOctokit: () => octokit,
      createCheckReporter: () => ({
        init: vi.fn().mockResolvedValue(undefined),
        markInProgress,
        completeSuccess,
        completeFailure: vi.fn().mockResolvedValue(undefined),
        usingCommitStatuses: vi.fn().mockReturnValue(false)
      }),
      listPullRequestFiles: vi.fn().mockResolvedValue(["src/app.ts"]),
      detectRepoTooling: vi.fn().mockResolvedValue({ hasEslint: true, hasPrettier: true }),
      isSupportedFile: vi.fn().mockReturnValue(true),
      dispatchRunnerWorkflow,
      getRunnerConfig: vi.fn().mockReturnValue({
        owner: "runner",
        repo: "runner-repo",
        workflow: "run.yml",
        callbackToken: "token",
        callbackUrl: "https://example.com/callbacks/runner"
      }),
      getPlan: vi.fn().mockReturnValue("free"),
      planPolicy: vi.fn().mockReturnValue({
        dispatchTarget: "free",
        priority: 10,
        maxRuntimeSec: 900,
        allowFixCommit: true
      })
    });

    await handler({ payload: buildPayload() });

    expect(markInProgress).toHaveBeenCalled();
    expect(completeSuccess).toHaveBeenCalledWith("Skipped: dispatch failed (best-effort)");
    expect(dispatchRunnerWorkflow).toHaveBeenCalled();
  });
});
