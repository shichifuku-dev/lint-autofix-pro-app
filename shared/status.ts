import type { OctokitLike } from "./githubClient.js";

const STATUS_CONTEXTS = ["CI/check", "CI/autofix"] as const;

type StatusContext = (typeof STATUS_CONTEXTS)[number];

export const getPrHeadSha = (payload: {
  pull_request?: {
    head?: { sha?: string };
  };
}): string | null => payload.pull_request?.head?.sha ?? null;

export const reportStatus = async ({
  octokit,
  owner,
  repo,
  sha,
  context,
  state,
  description,
  targetUrl
}: {
  octokit: OctokitLike;
  owner: string;
  repo: string;
  sha: string;
  context: StatusContext;
  state: "pending" | "success" | "failure";
  description: string;
  targetUrl?: string;
}): Promise<void> => {
  await octokit.rest.repos.createCommitStatus({
    owner,
    repo,
    sha,
    state,
    context,
    description,
    target_url: targetUrl
  });
};

const reportStatuses = async ({
  octokit,
  owner,
  repo,
  sha,
  state,
  description,
  targetUrl
}: {
  octokit: OctokitLike;
  owner: string;
  repo: string;
  sha: string;
  state: "pending" | "success" | "failure";
  description: string;
  targetUrl?: string;
}): Promise<void> => {
  const results = await Promise.allSettled(
    STATUS_CONTEXTS.map((context) =>
      reportStatus({
        octokit,
        owner,
        repo,
        sha,
        context,
        state,
        description,
        targetUrl
      })
    )
  );

  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.error("Failed to report commit status", {
        context: STATUS_CONTEXTS[index],
        owner,
        repo,
        sha,
        error: result.reason
      });
    }
  });
};

export const reportRequiredStatusesStart = async ({
  octokit,
  owner,
  repo,
  sha,
  targetUrl
}: {
  octokit: OctokitLike;
  owner: string;
  repo: string;
  sha: string;
  targetUrl?: string;
}): Promise<void> =>
  reportStatuses({
    octokit,
    owner,
    repo,
    sha,
    state: "pending",
    description: "Lint Autofix Pro: started",
    targetUrl
  });

export const reportRequiredStatusesSuccess = async ({
  octokit,
  owner,
  repo,
  sha,
  targetUrl,
  description = "Lint Autofix Pro: completed"
}: {
  octokit: OctokitLike;
  owner: string;
  repo: string;
  sha: string;
  targetUrl?: string;
  description?: string;
}): Promise<void> =>
  reportStatuses({
    octokit,
    owner,
    repo,
    sha,
    state: "success",
    description,
    targetUrl
  });

export const reportRequiredStatusesFailure = async ({
  octokit,
  owner,
  repo,
  sha,
  targetUrl,
  description = "Lint Autofix Pro: internal error"
}: {
  octokit: OctokitLike;
  owner: string;
  repo: string;
  sha: string;
  targetUrl?: string;
  description?: string;
}): Promise<void> =>
  reportStatuses({
    octokit,
    owner,
    repo,
    sha,
    state: "failure",
    description,
    targetUrl
  });
