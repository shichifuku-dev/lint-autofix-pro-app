export type CheckRunStatus = "queued" | "in_progress" | "completed";
export type CheckRunConclusion = "success" | "failure";

export type CheckRunOutput = {
  title: string;
  summary: string;
  text?: string;
};

export type ChecksListForRefParams = {
  owner: string;
  repo: string;
  ref: string;
  per_page?: number;
};

export type ChecksCreateParams = {
  owner: string;
  repo: string;
  name: string;
  head_sha: string;
  status?: CheckRunStatus;
  conclusion?: CheckRunConclusion;
  started_at?: string;
  completed_at?: string;
  output: CheckRunOutput;
};

export type ChecksUpdateParams = {
  owner: string;
  repo: string;
  check_run_id: number;
  name?: string;
  status?: CheckRunStatus;
  conclusion?: CheckRunConclusion;
  started_at?: string;
  completed_at?: string;
  output?: CheckRunOutput;
};

export type CheckRunSummary = {
  id?: number;
  name?: string;
};

export type CheckRunsResponse = {
  check_runs?: CheckRunSummary[];
};

export type CreateCommitStatusParams = {
  owner: string;
  repo: string;
  sha: string;
  state: "pending" | "success" | "failure" | "error";
  context: string;
  description?: string;
  target_url?: string;
};

export type GetContentParams = {
  owner: string;
  repo: string;
  path: string;
  ref?: string;
};

export type GitHubContentFile = {
  content?: string;
};

export type GitHubContentResponse = GitHubContentFile | Array<unknown>;

export type PullListFilesParams = {
  owner: string;
  repo: string;
  pull_number: number;
  per_page?: number;
  page?: number;
};

export type PullFile = {
  filename: string;
};

export type CreateWorkflowDispatchParams = {
  owner: string;
  repo: string;
  workflow_id: string;
  ref: string;
  inputs?: Record<string, string>;
};

export type PaginateMethod<T, Params extends Record<string, unknown>> = (params: Params) => Promise<{ data: T[] }>;

export type OctokitLike = {
  checks: {
    listForRef: (params: ChecksListForRefParams) => Promise<{ data: CheckRunsResponse }>;
    create: (params: ChecksCreateParams) => Promise<{ data: { id: number } }>;
    update: (params: ChecksUpdateParams) => Promise<void>;
  };
  rest: {
    repos: {
      createCommitStatus: (params: CreateCommitStatusParams) => Promise<void>;
      getContent: (params: GetContentParams) => Promise<{ data: GitHubContentResponse }>;
    };
    pulls: {
      listFiles: (params: PullListFilesParams) => Promise<{ data: PullFile[] }>;
    };
  };
  actions: {
    createWorkflowDispatch: (params: CreateWorkflowDispatchParams) => Promise<void>;
  };
  paginate: <T, Params extends Record<string, unknown>>(method: PaginateMethod<T, Params>, params: Params) => Promise<T[]>;
};

type RequestJson = (params: { method: string; path: string; body?: Record<string, unknown> }) => Promise<unknown>;
type RequestJsonNoBody = (params: { path: string }) => Promise<unknown>;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const parseCheckRunsResponse = (value: unknown): CheckRunsResponse => {
  if (!isRecord(value) || !Array.isArray(value.check_runs)) {
    return { check_runs: [] };
  }
  const check_runs = value.check_runs
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .map((item) => ({
      id: typeof item.id === "number" ? item.id : undefined,
      name: typeof item.name === "string" ? item.name : undefined
    }));
  return { check_runs };
};

const parseCheckRunId = (value: unknown): number => {
  if (!isRecord(value) || typeof value.id !== "number") {
    throw new Error("Invalid check run response");
  }
  return value.id;
};

const parsePullFilesResponse = (value: unknown): PullFile[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is { filename: string } => isRecord(item) && typeof item.filename === "string")
    .map((item) => ({ filename: item.filename }));
};

const parseContentResponse = (value: unknown): GitHubContentResponse => {
  if (Array.isArray(value)) {
    return value;
  }
  if (isRecord(value)) {
    return { content: typeof value.content === "string" ? value.content : undefined };
  }
  return [];
};

export const createGitHubClient = ({
  requestJson,
  requestJsonNoBody
}: {
  requestJson: RequestJson;
  requestJsonNoBody: RequestJsonNoBody;
}): OctokitLike => {
  const checks = {
    listForRef: async (params: ChecksListForRefParams) => {
      const query = params.per_page ? `?per_page=${params.per_page}` : "";
      const data = await requestJsonNoBody({
        path: `/repos/${params.owner}/${params.repo}/commits/${params.ref}/check-runs${query}`
      });
      return { data: parseCheckRunsResponse(data) };
    },
    create: async (params: ChecksCreateParams) => {
      const { owner, repo, ...body } = params;
      const data = await requestJson({
        method: "POST",
        path: `/repos/${owner}/${repo}/check-runs`,
        body
      });
      return { data: { id: parseCheckRunId(data) } };
    },
    update: async (params: ChecksUpdateParams) => {
      const { owner, repo, check_run_id, ...body } = params;
      await requestJson({
        method: "PATCH",
        path: `/repos/${owner}/${repo}/check-runs/${check_run_id}`,
        body
      });
    }
  };

  const rest = {
    repos: {
      createCommitStatus: async (params: CreateCommitStatusParams) => {
        const { owner, repo, sha, ...body } = params;
        await requestJson({
          method: "POST",
          path: `/repos/${owner}/${repo}/statuses/${sha}`,
          body
        });
      },
      getContent: async (params: GetContentParams) => {
        const query = params.ref ? `?ref=${encodeURIComponent(params.ref)}` : "";
        const data = await requestJsonNoBody({
          path: `/repos/${params.owner}/${params.repo}/contents/${params.path}${query}`
        });
        return { data: parseContentResponse(data) };
      }
    },
    pulls: {
      listFiles: async (params: PullListFilesParams) => {
        const query = new URLSearchParams();
        if (params.per_page) {
          query.set("per_page", String(params.per_page));
        }
        if (params.page) {
          query.set("page", String(params.page));
        }
        const queryString = query.toString();
        const data = await requestJsonNoBody({
          path: `/repos/${params.owner}/${params.repo}/pulls/${params.pull_number}/files${queryString ? `?${queryString}` : ""}`
        });
        return { data: parsePullFilesResponse(data) };
      }
    }
  };

  const actions = {
    createWorkflowDispatch: async (params: CreateWorkflowDispatchParams) => {
      const { owner, repo, workflow_id, ...body } = params;
      await requestJson({
        method: "POST",
        path: `/repos/${owner}/${repo}/actions/workflows/${workflow_id}/dispatches`,
        body
      });
    }
  };

  const paginate = async <T, Params extends Record<string, unknown>>(
    method: PaginateMethod<T, Params>,
    params: Params
  ): Promise<T[]> => {
    const perPage = typeof params.per_page === "number" ? params.per_page : 100;
    let page = 1;
    const results: T[] = [];
    while (true) {
      const response = await method({ ...params, per_page: perPage, page });
      results.push(...response.data);
      if (response.data.length < perPage) {
        break;
      }
      page += 1;
    }
    return results;
  };

  return {
    checks,
    rest,
    actions,
    paginate
  };
};
