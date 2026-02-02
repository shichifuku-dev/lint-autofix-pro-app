import type { CheckRunConclusion, CheckRunOutput, CheckRunStatus, OctokitLike } from "./githubClient.js";

const CHECK_NAMES = ["CI/check", "CI/autofix"] as const;

type CheckName = (typeof CHECK_NAMES)[number];

export type CheckRunIds = Record<CheckName, number>;

const buildOutput = (summary: string, text?: string): CheckRunOutput => ({
  title: "Lint Autofix Pro",
  summary,
  text
});

const pickNewestCheckRunId = (ids: number[]): number => Math.max(...ids);

const isCheckName = (value: string): value is CheckName => value === "CI/check" || value === "CI/autofix";

const collectExistingCheckRuns = (checkRuns: Array<{ name?: string; id?: number }>): Partial<CheckRunIds> | null => {
  const grouped = new Map<CheckName, number[]>();
  for (const run of checkRuns) {
    if (!run.name || typeof run.id !== "number") {
      continue;
    }
    if (isCheckName(run.name)) {
      const name = run.name;
      const entries = grouped.get(name) ?? [];
      entries.push(run.id);
      grouped.set(name, entries);
    }
  }

  if (grouped.size === 0) {
    return null;
  }

  const resolved: Partial<CheckRunIds> = {};
  for (const name of CHECK_NAMES) {
    const ids = grouped.get(name);
    if (ids && ids.length > 0) {
      resolved[name] = pickNewestCheckRunId(ids);
    }
  }
  return resolved;
};

export const ensureCheckRuns = async ({
  octokit,
  owner,
  repo,
  headSha
}: {
  octokit: OctokitLike;
  owner: string;
  repo: string;
  headSha: string;
}): Promise<CheckRunIds> => {
  const existingRuns = await octokit.checks.listForRef({
    owner,
    repo,
    ref: headSha,
    per_page: 100
  });

  const existing = collectExistingCheckRuns(existingRuns.data.check_runs ?? []) ?? {};
  const createdAt = new Date().toISOString();
  const results = await Promise.all(
    CHECK_NAMES.map(async (name) => {
      const existingId = existing[name];
      if (existingId) {
        console.log("Check run already exists", { name, checkRunId: existingId });
        return [name, existingId] as const;
      }
      const response = await octokit.checks.create({
        owner,
        repo,
        name,
        head_sha: headSha,
        status: "queued",
        started_at: createdAt,
        output: buildOutput("Lint Autofix Pro queued.")
      });
      console.log("Check run created", { name, checkRunId: response.data.id });
      return [name, response.data.id] as const;
    })
  );

  const idMap = new Map(results);
  const checkId = idMap.get("CI/check");
  const autofixId = idMap.get("CI/autofix");
  if (!checkId || !autofixId) {
    throw new Error("Missing check run IDs");
  }
  return {
    "CI/check": checkId,
    "CI/autofix": autofixId
  };
};

export const updateCheckRun = async ({
  octokit,
  owner,
  repo,
  headSha,
  checkRunId,
  name,
  status,
  conclusion,
  summary,
  text
}: {
  octokit: OctokitLike;
  owner: string;
  repo: string;
  headSha: string;
  checkRunId?: number;
  name: CheckName;
  status: CheckRunStatus;
  conclusion?: CheckRunConclusion;
  summary: string;
  text?: string;
}): Promise<void> => {
  const output = buildOutput(summary, text);
  const now = new Date().toISOString();
  if (checkRunId) {
    await octokit.checks.update({
      owner,
      repo,
      check_run_id: checkRunId,
      status,
      conclusion: status === "completed" ? conclusion : undefined,
      completed_at: status === "completed" ? now : undefined,
      started_at: status === "in_progress" ? now : undefined,
      output
    });
    console.log("Check run updated", { name, checkRunId, status, conclusion });
    return;
  }

  await octokit.checks.create({
    owner,
    repo,
    name,
    head_sha: headSha,
    status,
    conclusion: status === "completed" ? conclusion : undefined,
    completed_at: status === "completed" ? now : undefined,
    started_at: status === "in_progress" ? now : undefined,
    output
  });
  console.log("Check run created", { name, status, conclusion });
};

export const updateCheckRuns = async ({
  octokit,
  owner,
  repo,
  headSha,
  checkRunIds,
  status,
  conclusion,
  summary,
  text
}: {
  octokit: OctokitLike;
  owner: string;
  repo: string;
  headSha: string;
  checkRunIds?: CheckRunIds | null;
  status: CheckRunStatus;
  conclusion?: CheckRunConclusion;
  summary: string;
  text?: string;
}): Promise<void> => {
  await Promise.all(
    CHECK_NAMES.map((name) =>
      updateCheckRun({
        octokit,
        owner,
        repo,
        headSha,
        checkRunId: checkRunIds?.[name],
        name,
        status,
        conclusion,
        summary,
        text
      })
    )
  );
};

export const formatErrorDetails = (error: unknown): string => {
  if (error instanceof Error) {
    const stack = error.stack ? `\n\n${error.stack}` : "";
    return `${error.name}: ${error.message}${stack}`;
  }
  return String(error);
};
