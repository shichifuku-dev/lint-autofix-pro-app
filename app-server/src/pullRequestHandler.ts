import { App } from "@octokit/app";
import { Octokit } from "@octokit/rest";
import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { buildCommentBody } from "./comment.js";
import { upsertIssueComment } from "./comments.js";
import { configToJson, getDefaultConfig } from "./config.js";
import {
  reportCheckCompleteFailure,
  reportCheckCompleteSuccess,
  reportCheckStart,
  type CheckRunIds
} from "./checks.js";
import { runPullRequestPipeline } from "./pipeline.js";
import {
  getPrHeadSha,
  reportRequiredStatusesFailure,
  reportRequiredStatusesStart,
  reportRequiredStatusesSuccess
} from "./status.js";

type PullRequestPayload = {
  action: "opened" | "synchronize" | "reopened" | "ready_for_review";
  installation?: { id: number };
  repository?: { name?: string; owner?: { login?: string; type?: string }; full_name?: string };
  pull_request?: {
    number: number;
    html_url?: string;
    head: { sha: string; ref: string; repo: { full_name: string } | null };
    base: { repo: { full_name: string } | null };
  };
};

type PullRequestHandlerDeps = {
  app: App;
  prisma: PrismaClient;
  runPullRequestPipeline: typeof runPullRequestPipeline;
  buildCommentBody: typeof buildCommentBody;
  upsertIssueComment: typeof upsertIssueComment;
  reportCheckStart: typeof reportCheckStart;
  reportCheckCompleteSuccess: typeof reportCheckCompleteSuccess;
  reportCheckCompleteFailure: typeof reportCheckCompleteFailure;
  reportRequiredStatusesStart: typeof reportRequiredStatusesStart;
  reportRequiredStatusesSuccess: typeof reportRequiredStatusesSuccess;
  reportRequiredStatusesFailure: typeof reportRequiredStatusesFailure;
  getDefaultConfig: typeof getDefaultConfig;
  createOctokit: (token: string) => Octokit;
};

const ALLOWED_ACTIONS = ["opened", "synchronize", "reopened", "ready_for_review"] as const;

const buildSuccessDescription = (result: {
  changedFiles: string[];
  installStatus: string;
  prettierStatus: string;
  eslintStatus: string;
}): string => {
  if (result.changedFiles.length > 0) {
    return "Lint Autofix Pro: fixes applied";
  }
  if (result.installStatus === "skipped" || result.prettierStatus === "skipped" || result.eslintStatus === "skipped") {
    return "No changes needed";
  }
  return "Lint Autofix Pro: completed";
};

export const createPullRequestHandler =
  ({
    app,
    prisma,
    runPullRequestPipeline,
    buildCommentBody,
    upsertIssueComment,
    reportCheckStart,
    reportCheckCompleteSuccess,
    reportCheckCompleteFailure,
    reportRequiredStatusesStart,
    reportRequiredStatusesSuccess,
    reportRequiredStatusesFailure,
    getDefaultConfig,
    createOctokit
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
    const repoFullName = payload.repository?.full_name;
    if (!owner || !repo) {
      console.warn("Missing repository info in pull_request payload", { installationId });
      return;
    }
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

    let checkRunIds: CheckRunIds | null = null;
    let octokit: Octokit | null = null;

    try {
      const appOctokit = await app.getInstallationOctokit(installationId);
      const tokenResponse = await appOctokit.request("POST /app/installations/{installation_id}/access_tokens", {
        installation_id: installationId
      });
      const token = tokenResponse.data.token as string;
      octokit = createOctokit(token);

      await reportRequiredStatusesStart({
        octokit,
        owner,
        repo,
        sha: headSha,
        targetUrl
      });

      checkRunIds = await reportCheckStart({
        octokit,
        owner,
        repo,
        headSha
      });
      const result = await runPullRequestPipeline({
        owner,
        repo,
        number: pullRequest.number,
        headSha,
        headRef: pullRequest.head.ref,
        headRepoFullName: pullRequest.head.repo.full_name,
        isFork: pullRequest.head.repo.full_name !== pullRequest.base.repo.full_name,
        installationToken: token
      });

      const resolvedRepoFullName = repoFullName ?? `${owner}/${repo}`;
      const accountLogin = owner;
      const accountType = payload.repository?.owner?.type ?? "Organization";
      try {
        await prisma.$transaction(async (tx) => {
          await tx.installation.upsert({
            where: { installationId },
            update: {
              accountLogin,
              accountType
            },
            create: {
              installationId,
              accountLogin,
              accountType
            }
          });
          await tx.repoConfig.upsert({
            where: {
              installationId_repoFullName: {
                installationId,
                repoFullName: resolvedRepoFullName
              }
            },
            update: {
              configJson: configToJson(result.config)
            },
            create: {
              installationId,
              repoFullName: resolvedRepoFullName,
              configJson: configToJson(result.config)
            }
          });
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
          console.warn("Skipping repoConfig upsert due to missing FK parent", {
            installationId,
            repoFullName: resolvedRepoFullName
          });
        } else {
          throw error;
        }
      }

      const commentBody = buildCommentBody({
        config: result.config,
        installStatus: result.installStatus,
        prettierStatus: result.prettierStatus,
        eslintStatus: result.eslintStatus,
        changedFiles: result.changedFiles,
        diff: result.diff,
        diffTruncated: result.diffTruncated,
        notes: result.notes,
        autoCommit: result.autoCommit
      });

      await upsertIssueComment({
        octokit,
        owner,
        repo,
        issueNumber: pullRequest.number,
        body: commentBody
      });

      await reportCheckCompleteSuccess({
        octokit,
        owner,
        repo,
        headSha,
        checkRunIds
      });

      await reportRequiredStatusesSuccess({
        octokit,
        owner,
        repo,
        sha: headSha,
        targetUrl,
        description: buildSuccessDescription(result)
      });
    } catch (error) {
      console.error("Processing error", error);
      if (octokit) {
        const config = getDefaultConfig();
        const commentBody = buildCommentBody({
          config,
          installStatus: "failed",
          prettierStatus: "skipped",
          eslintStatus: "skipped",
          changedFiles: [],
          diff: "",
          diffTruncated: false,
          notes: ["Lint Autofix Pro encountered an error while processing this pull request."],
          autoCommit: { attempted: false, pushed: false }
        });
        try {
          await upsertIssueComment({
            octokit,
            owner,
            repo,
            issueNumber: pullRequest.number,
            body: commentBody
          });
        } catch (commentError) {
          console.error("Failed to upsert error comment", commentError);
        }
      }

      if (octokit) {
        await reportCheckCompleteFailure({
          octokit,
          owner,
          repo,
          headSha,
          checkRunIds,
          error
        });
        await reportRequiredStatusesFailure({
          octokit,
          owner,
          repo,
          sha: headSha,
          targetUrl
        });
      }
    }
  };
