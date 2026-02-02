import type { OctokitLike } from "../../app-server/src/githubClient.js";

const GITHUB_API_BASE = "https://api.github.com";

const buildHeaders = (token: string): HeadersInit => ({
  Authorization: `token ${token}`,
  Accept: "application/vnd.github+json",
  "User-Agent": "lint-autofix-pro-worker",
  "X-GitHub-Api-Version": "2022-11-28"
});

const requestJson = async ({
  token,
  method,
  path,
  body
}: {
  token: string;
  method: string;
  path: string;
  body?: Record<string, unknown>;
}): Promise<unknown> => {
  const response = await fetch(`${GITHUB_API_BASE}${path}`, {
    method,
    headers: {
      ...buildHeaders(token),
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API request failed (${response.status}): ${text}`);
  }

  if (response.status === 204) {
    return null;
  }
  return response.json();
};

const requestJsonNoBody = async ({
  token,
  path
}: {
  token: string;
  path: string;
}): Promise<unknown> => {
  const response = await fetch(`${GITHUB_API_BASE}${path}`, {
    method: "GET",
    headers: buildHeaders(token)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API request failed (${response.status}): ${text}`);
  }

  return response.json();
};

export const createGitHubClient = (token: string): OctokitLike => {
  const rest = {
    repos: {
      createCommitStatus: async (params: Record<string, unknown>) => {
        const { owner, repo, sha, ...body } = params as {
          owner: string;
          repo: string;
          sha: string;
        };
        await requestJson({
          token,
          method: "POST",
          path: `/repos/${owner}/${repo}/statuses/${sha}`,
          body
        });
      },
      getContent: async (params: Record<string, unknown>) => {
        const { owner, repo, path, ref } = params as {
          owner: string;
          repo: string;
          path: string;
          ref?: string;
        };
        const query = ref ? `?ref=${encodeURIComponent(ref)}` : "";
        const data = await requestJsonNoBody({ token, path: `/repos/${owner}/${repo}/contents/${path}${query}` });
        return { data };
      }
    },
    pulls: {
      listFiles: async (params: Record<string, unknown>) => {
        const { owner, repo, pull_number, per_page, page } = params as {
          owner: string;
          repo: string;
          pull_number: number;
          per_page?: number;
          page?: number;
        };
        const query = new URLSearchParams();
        if (per_page) {
          query.set("per_page", String(per_page));
        }
        if (page) {
          query.set("page", String(page));
        }
        const queryString = query.toString();
        const data = await requestJsonNoBody({
          token,
          path: `/repos/${owner}/${repo}/pulls/${pull_number}/files${queryString ? `?${queryString}` : ""}`
        });
        return { data: data as Array<{ filename: string }> };
      }
    }
  };

  const checks = {
    listForRef: async (params: Record<string, unknown>) => {
      const { owner, repo, ref, per_page } = params as {
        owner: string;
        repo: string;
        ref: string;
        per_page?: number;
      };
      const query = per_page ? `?per_page=${per_page}` : "";
      const data = await requestJsonNoBody({
        token,
        path: `/repos/${owner}/${repo}/commits/${ref}/check-runs${query}`
      });
      return { data: data as { check_runs?: Array<{ name?: string; id?: number }> } };
    },
    create: async (params: Record<string, unknown>) => {
      const { owner, repo, ...body } = params as { owner: string; repo: string };
      const data = await requestJson({
        token,
        method: "POST",
        path: `/repos/${owner}/${repo}/check-runs`,
        body
      });
      return { data: data as { id: number } };
    },
    update: async (params: Record<string, unknown>) => {
      const { owner, repo, check_run_id, ...body } = params as {
        owner: string;
        repo: string;
        check_run_id: number;
      };
      await requestJson({
        token,
        method: "PATCH",
        path: `/repos/${owner}/${repo}/check-runs/${check_run_id}`,
        body
      });
    }
  };

  const actions = {
    createWorkflowDispatch: async (params: Record<string, unknown>) => {
      const { owner, repo, workflow_id, ...body } = params as {
        owner: string;
        repo: string;
        workflow_id: string;
      };
      await requestJson({
        token,
        method: "POST",
        path: `/repos/${owner}/${repo}/actions/workflows/${workflow_id}/dispatches`,
        body
      });
    }
  };

  const paginate = async <T>(
    method: (params: Record<string, unknown>) => Promise<{ data: T[] }>,
    params: Record<string, unknown>
  ): Promise<T[]> => {
    const perPage = (params.per_page as number | undefined) ?? 100;
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
