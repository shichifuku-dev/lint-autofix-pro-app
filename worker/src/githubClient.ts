import { createGitHubClient } from "../../shared/githubClient.js";

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

const requestJsonNoBody = async ({ token, path }: { token: string; path: string }): Promise<unknown> => {
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

export const createWorkerGitHubClient = (token: string) =>
  createGitHubClient({
    requestJson: ({ method, path, body }) => requestJson({ token, method, path, body }),
    requestJsonNoBody: ({ path }) => requestJsonNoBody({ token, path })
  });
