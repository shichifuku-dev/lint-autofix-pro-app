import { describe, expect, it, vi } from "vitest";
import type { Octokit } from "@octokit/rest";
import type { PrismaClient } from "@prisma/client";
import { createPullRequestHandler } from "./pullRequestHandler.js";
import { getDefaultConfig } from "./config.js";
import {
  reportRequiredStatusesFailure,
  reportRequiredStatusesStart,
  reportRequiredStatusesSuccess
} from "./status.js";

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
    base: { repo: { full_name: "octo/repo" } }
  }
});

const buildOctokit = () => {
  const createCommitStatus = vi.fn().mockResolvedValue({});
  return {
    rest: {
      repos: { createCommitStatus }
    }
  } as unknown as Octokit;
};

const buildPrisma = () =>
  ({
    $transaction: vi.fn(async (callback) => {
      const tx = {
        installation: { upsert: vi.fn() },
        repoConfig: { upsert: vi.fn() }
      };
      return callback(tx as any);
    })
  }) as unknown as PrismaClient;

const expectStatusCalls = (calls: Array<{ owner: string; repo: string; sha: string; context: string; state: string }>, state: string) => {
  expect(calls).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ owner: "octo", repo: "repo", sha: "sha123", context: "CI/check", state }),
      expect.objectContaining({ owner: "octo", repo: "repo", sha: "sha123", context: "CI/autofix", state })
    ])
  );
};

describe("pull request handler status reporting", () => {
  it("reports pending then success statuses on skip path", async () => {
    const octokit = buildOctokit();
    const createCommitStatus = octokit.rest.repos.createCommitStatus as unknown as ReturnType<typeof vi.fn>;
    const runPullRequestPipeline = vi.fn().mockResolvedValue({
      config: getDefaultConfig(),
      installStatus: "skipped",
      prettierStatus: "skipped",
      eslintStatus: "skipped",
      changedFiles: [],
      diff: "",
      diffTruncated: false,
      notes: ["No package.json found. Skipping dependency install and lint fixes."]
    });

    const handler = createPullRequestHandler({
      app: {
        getInstallationOctokit: vi.fn().mockResolvedValue({
          request: vi.fn().mockResolvedValue({ data: { token: "token123" } })
        })
      } as any,
      prisma: buildPrisma(),
      runPullRequestPipeline,
      buildCommentBody: vi.fn().mockReturnValue("comment"),
      upsertIssueComment: vi.fn().mockResolvedValue(undefined),
      reportCheckStart: vi.fn().mockResolvedValue({ "CI/check": 1, "CI/autofix": 2 }),
      reportCheckCompleteSuccess: vi.fn().mockResolvedValue(undefined),
      reportCheckCompleteFailure: vi.fn().mockResolvedValue(undefined),
      reportRequiredStatusesStart,
      reportRequiredStatusesSuccess,
      reportRequiredStatusesFailure,
      getDefaultConfig,
      createOctokit: () => octokit
    });

    await handler({ payload: buildPayload() });

    const calls = createCommitStatus.mock.calls.map(([args]) => args);
    expectStatusCalls(calls, "pending");
    expectStatusCalls(calls, "success");
  });

  it("reports pending then success statuses on normal path", async () => {
    const octokit = buildOctokit();
    const createCommitStatus = octokit.rest.repos.createCommitStatus as unknown as ReturnType<typeof vi.fn>;
    const runPullRequestPipeline = vi.fn().mockResolvedValue({
      config: getDefaultConfig(),
      installStatus: "ok",
      prettierStatus: "ok",
      eslintStatus: "ok",
      changedFiles: ["src/app.ts"],
      diff: "diff",
      diffTruncated: false,
      notes: []
    });

    const handler = createPullRequestHandler({
      app: {
        getInstallationOctokit: vi.fn().mockResolvedValue({
          request: vi.fn().mockResolvedValue({ data: { token: "token123" } })
        })
      } as any,
      prisma: buildPrisma(),
      runPullRequestPipeline,
      buildCommentBody: vi.fn().mockReturnValue("comment"),
      upsertIssueComment: vi.fn().mockResolvedValue(undefined),
      reportCheckStart: vi.fn().mockResolvedValue({ "CI/check": 1, "CI/autofix": 2 }),
      reportCheckCompleteSuccess: vi.fn().mockResolvedValue(undefined),
      reportCheckCompleteFailure: vi.fn().mockResolvedValue(undefined),
      reportRequiredStatusesStart,
      reportRequiredStatusesSuccess,
      reportRequiredStatusesFailure,
      getDefaultConfig,
      createOctokit: () => octokit
    });

    await handler({ payload: buildPayload() });

    const calls = createCommitStatus.mock.calls.map(([args]) => args);
    expectStatusCalls(calls, "pending");
    expectStatusCalls(calls, "success");
  });

  it("reports pending then failure statuses on error path", async () => {
    const octokit = buildOctokit();
    const createCommitStatus = octokit.rest.repos.createCommitStatus as unknown as ReturnType<typeof vi.fn>;
    const runPullRequestPipeline = vi.fn().mockRejectedValue(new Error("boom"));

    const handler = createPullRequestHandler({
      app: {
        getInstallationOctokit: vi.fn().mockResolvedValue({
          request: vi.fn().mockResolvedValue({ data: { token: "token123" } })
        })
      } as any,
      prisma: buildPrisma(),
      runPullRequestPipeline,
      buildCommentBody: vi.fn().mockReturnValue("comment"),
      upsertIssueComment: vi.fn().mockResolvedValue(undefined),
      reportCheckStart: vi.fn().mockResolvedValue({ "CI/check": 1, "CI/autofix": 2 }),
      reportCheckCompleteSuccess: vi.fn().mockResolvedValue(undefined),
      reportCheckCompleteFailure: vi.fn().mockResolvedValue(undefined),
      reportRequiredStatusesStart,
      reportRequiredStatusesSuccess,
      reportRequiredStatusesFailure,
      getDefaultConfig,
      createOctokit: () => octokit
    });

    await handler({ payload: buildPayload() });

    const calls = createCommitStatus.mock.calls.map(([args]) => args);
    expectStatusCalls(calls, "pending");
    expectStatusCalls(calls, "failure");
  });
});
