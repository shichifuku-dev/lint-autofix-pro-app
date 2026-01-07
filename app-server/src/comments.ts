import type { Octokit } from "@octokit/rest";
import { COMMENT_MARKER } from "./comment.js";

export const upsertIssueComment = async ({
  octokit,
  owner,
  repo,
  issueNumber,
  body
}: {
  octokit: Octokit;
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
