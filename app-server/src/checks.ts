import { Octokit } from "@octokit/rest";

const CHECK_NAMES = ["CI/check", "CI/autofix"] as const;

type CheckName = (typeof CHECK_NAMES)[number];

export type CheckRunIds = Record<CheckName, number>;

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

const pickNewestCheckRunId = (ids: number[]): number => Math.max(...ids);

const collectExistingCheckRuns = (checkRuns: Array<{ name?: string; id?: number }>): CheckRunIds | null => {
  const grouped = new Map<CheckName, number[]>();
  for (const run of checkRuns) {
    if (!run.name || typeof run.id !== "number") {
      continue;
    }
    if (CHECK_NAMES.includes(run.name as CheckName)) {
      const name = run.name as CheckName;
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
  return resolved as CheckRunIds;
};

export const ensureCheckRuns = async ({
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
  const existingRuns = await octokit.checks.listForRef({
    owner,
    repo,
    ref: headSha,
    per_page: 100
  });

  const existing = collectExistingCheckRuns(existingRuns.data.check_runs ?? []) ?? ({} as CheckRunIds);
  const createdAt = new Date().toISOString();
  const results = await Promise.all(
    CHECK_NAMES.map(async (name) => {
      const existingId = existing[name];
      if (existingId) {
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
      return [name, response.data.id] as const;
    })
  );

  return Object.fromEntries(results) as CheckRunIds;
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
  octokit: Octokit;
  owner: string;
  repo: string;
  headSha: string;
  checkRunId?: number;
  name: CheckName;
  status: "queued" | "in_progress" | "completed";
  conclusion?: "success" | "failure";
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
  octokit: Octokit;
  owner: string;
  repo: string;
  headSha: string;
  checkRunIds?: CheckRunIds | null;
  status: "queued" | "in_progress" | "completed";
  conclusion?: "success" | "failure";
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
