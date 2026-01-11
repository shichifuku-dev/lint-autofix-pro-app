import { Octokit } from "@octokit/rest";

const CHECK_NAMES = ["CI/check", "CI/autofix"] as const;

type CheckName = (typeof CHECK_NAMES)[number];

type CheckRunIds = Record<CheckName, number>;

type CheckOutput = {
  title: string;
  summary: string;
  text?: string;
};

const buildOutput = (summary: string, text?: string): CheckOutput => ({
  title: "Lint Autofix Pro",
  summary,
  text
});

const formatErrorDetails = (error: unknown): string => {
  if (error instanceof Error) {
    const stack = error.stack ? `\n\n${error.stack}` : "";
    return `${error.name}: ${error.message}${stack}`;
  }
  return String(error);
};

export const createCheckRuns = async ({
  octokit,
  owner,
  repo,
  headSha
}: {
  octokit: Octokit;
  owner: string;
  repo: string;
  headSha: string;
}): Promise<CheckRunIds> => {
  const startedAt = new Date().toISOString();
  const runs = await Promise.all(
    CHECK_NAMES.map(async (name) => {
      const response = await octokit.checks.create({
        owner,
        repo,
        name,
        head_sha: headSha,
        status: "in_progress",
        started_at: startedAt,
        output: buildOutput("Lint Autofix Pro started.")
      });
      return [name, response.data.id] as const;
    })
  );

  return Object.fromEntries(runs) as CheckRunIds;
};

export const reportCheckStart = async ({
  octokit,
  owner,
  repo,
  headSha
}: {
  octokit: Octokit;
  owner: string;
  repo: string;
  headSha: string;
}): Promise<CheckRunIds> =>
  createCheckRuns({
    octokit,
    owner,
    repo,
    headSha
  });

export const completeCheckRuns = async ({
  octokit,
  owner,
  repo,
  headSha,
  checkRunIds,
  conclusion,
  output
}: {
  octokit: Octokit;
  owner: string;
  repo: string;
  headSha: string;
  checkRunIds?: CheckRunIds | null;
  conclusion: "success" | "failure";
  output: CheckOutput;
}): Promise<void> => {
  const completedAt = new Date().toISOString();

  if (checkRunIds) {
    await Promise.all(
      CHECK_NAMES.map((name) =>
        octokit.checks.update({
          owner,
          repo,
          check_run_id: checkRunIds[name],
          status: "completed",
          conclusion,
          completed_at: completedAt,
          output
        })
      )
    );
    return;
  }

  await Promise.all(
    CHECK_NAMES.map((name) =>
      octokit.checks.create({
        owner,
        repo,
        name,
        head_sha: headSha,
        status: "completed",
        conclusion,
        completed_at: completedAt,
        output
      })
    )
  );
};

export const buildSuccessOutput = (): CheckOutput => buildOutput("Lint Autofix Pro finished successfully.");

export const buildFailureOutput = (error: unknown): CheckOutput =>
  buildOutput("Lint Autofix Pro encountered an error.", formatErrorDetails(error));

export const reportCheckCompleteSuccess = async ({
  octokit,
  owner,
  repo,
  headSha,
  checkRunIds
}: {
  octokit: Octokit;
  owner: string;
  repo: string;
  headSha: string;
  checkRunIds?: CheckRunIds | null;
}): Promise<void> =>
  completeCheckRuns({
    octokit,
    owner,
    repo,
    headSha,
    checkRunIds,
    conclusion: "success",
    output: buildSuccessOutput()
  });

export const reportCheckCompleteFailure = async ({
  octokit,
  owner,
  repo,
  headSha,
  checkRunIds,
  error
}: {
  octokit: Octokit;
  owner: string;
  repo: string;
  headSha: string;
  checkRunIds?: CheckRunIds | null;
  error: unknown;
}): Promise<void> =>
  completeCheckRuns({
    octokit,
    owner,
    repo,
    headSha,
    checkRunIds,
    conclusion: "failure",
    output: buildFailureOutput(error)
  });
