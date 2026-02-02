import { Octokit } from "@octokit/rest";
import { ensureCheckRuns, updateCheckRuns, type CheckRunIds } from "./checks.js";
import {
  reportRequiredStatusesFailure,
  reportRequiredStatusesStart,
  reportRequiredStatusesSuccess
} from "./status.js";

type CheckReporterOptions = {
  octokit: Octokit;
  owner: string;
  repo: string;
  headSha: string;
  targetUrl?: string;
};

export type CheckReporter = {
  init: () => Promise<void>;
  markInProgress: () => Promise<void>;
  completeSuccess: (summary: string, text?: string) => Promise<void>;
  completeFailure: (summary: string, text?: string) => Promise<void>;
  usingCommitStatuses: () => boolean;
};

export const createCheckReporter = ({ octokit, owner, repo, headSha, targetUrl }: CheckReporterOptions): CheckReporter => {
  let checkRunIds: CheckRunIds | null = null;
  let useCommitStatuses = false;

  const fallbackToStatuses = async (conclusion: "success" | "failure", summary: string) => {
    if (conclusion === "success") {
      await reportRequiredStatusesSuccess({ octokit, owner, repo, sha: headSha, targetUrl, description: summary });
      return;
    }
    await reportRequiredStatusesFailure({ octokit, owner, repo, sha: headSha, targetUrl, description: summary });
  };

  const init = async () => {
    try {
      checkRunIds = await ensureCheckRuns({ octokit, owner, repo, headSha });
    } catch (error) {
      console.error("Failed to ensure check runs; falling back to commit statuses", error);
      useCommitStatuses = true;
    }
  };

  const markInProgress = async () => {
    if (useCommitStatuses) {
      await reportRequiredStatusesStart({ octokit, owner, repo, sha: headSha, targetUrl });
      return;
    }
    try {
      await updateCheckRuns({
        octokit,
        owner,
        repo,
        headSha,
        checkRunIds,
        status: "in_progress",
        summary: "Lint Autofix Pro is running."
      });
    } catch (error) {
      console.error("Failed to update check runs to in_progress; falling back to statuses", error);
      useCommitStatuses = true;
      await reportRequiredStatusesStart({ octokit, owner, repo, sha: headSha, targetUrl });
    }
  };

  const complete = async (conclusion: "success" | "failure", summary: string, text?: string) => {
    if (useCommitStatuses) {
      await fallbackToStatuses(conclusion, summary);
      return;
    }
    try {
      await updateCheckRuns({
        octokit,
        owner,
        repo,
        headSha,
        checkRunIds,
        status: "completed",
        conclusion,
        summary,
        text
      });
    } catch (error) {
      console.error("Failed to complete check runs; falling back to statuses", error);
      useCommitStatuses = true;
      await fallbackToStatuses(conclusion, summary);
    }
  };

  return {
    init,
    markInProgress,
    completeSuccess: (summary, text) => complete("success", summary, text),
    completeFailure: (summary, text) => complete("failure", summary, text),
    usingCommitStatuses: () => useCommitStatuses
  };
};
