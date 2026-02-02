import type { Octokit } from "@octokit/rest";
import { createGitHubClient, type OctokitLike } from "../../shared/githubClient.js";

const requestJson = (octokit: Octokit) => async ({
  method,
  path,
  body
}: {
  method: string;
  path: string;
  body?: Record<string, unknown>;
}): Promise<unknown> => {
  const response = await octokit.request({
    method,
    url: path,
    ...(body ?? {})
  });
  return response.data;
};

const requestJsonNoBody = (octokit: Octokit) => async ({ path }: { path: string }): Promise<unknown> => {
  const response = await octokit.request({
    method: "GET",
    url: path
  });
  return response.data;
};

export const createOctokitClient = (octokit: Octokit): OctokitLike =>
  createGitHubClient({
    requestJson: requestJson(octokit),
    requestJsonNoBody: requestJsonNoBody(octokit)
  });

export type { OctokitLike };
