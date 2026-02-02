import { COMMENT_MARKER } from "./comment.js";

type IssueCommentClient = {
  paginate: <T, Params extends Record<string, unknown>>(
    method: (params: Params) => Promise<{ data: T[] }>,
    params: Params
  ) => Promise<T[]>;
  issues: {
    listComments: (params: { owner: string; repo: string; issue_number: number; per_page?: number; page?: number }) => Promise<{
      data: Array<{ id: number; body?: string | null }>;
    }>;
    updateComment: (params: { owner: string; repo: string; comment_id: number; body: string }) => Promise<{ data: { id: number } }>;
    createComment: (params: { owner: string; repo: string; issue_number: number; body: string }) => Promise<{ data: { id: number } }>;
  };
};

export const upsertIssueComment = async ({
  octokit,
  owner,
  repo,
  issueNumber,
  body
}: {
  octokit: IssueCommentClient;
  owner: string;
  repo: string;
  issueNumber: number;
  body: string;
}): Promise<{ created: boolean; commentId: number }> => {
  const existing = await octokit.paginate(octokit.issues.listComments, {
    owner,
    repo,
    issue_number: issueNumber,
    per_page: 100
  });

  const match = existing.find((comment) => comment.body?.includes(COMMENT_MARKER));
  if (match) {
    const updated = await octokit.issues.updateComment({
      owner,
      repo,
      comment_id: match.id,
      body
    });
    return { created: false, commentId: updated.data.id };
  }

  const created = await octokit.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body
  });

  return { created: true, commentId: created.data.id };
};
