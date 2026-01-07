import { describe, expect, it, vi } from "vitest";
import { upsertIssueComment } from "../src/comments.js";
import { COMMENT_MARKER } from "../src/comment.js";

describe("upsertIssueComment", () => {
  it("creates a new comment when none exists", async () => {
    const octokit = {
      paginate: vi.fn().mockResolvedValue([]),
      issues: {
        listComments: vi.fn(),
        createComment: vi.fn().mockResolvedValue({ data: { id: 42 } })
      }
    } as any;

    const result = await upsertIssueComment({
      octokit,
      owner: "octo",
      repo: "repo",
      issueNumber: 1,
      body: "hello"
    });

    expect(result.created).toBe(true);
    expect(result.commentId).toBe(42);
    expect(octokit.issues.createComment).toHaveBeenCalled();
  });

  it("updates existing comment with marker", async () => {
    const octokit = {
      paginate: vi.fn().mockResolvedValue([{ id: 99, body: `test ${COMMENT_MARKER}` }]),
      issues: {
        listComments: vi.fn(),
        updateComment: vi.fn().mockResolvedValue({ data: { id: 99 } }),
        createComment: vi.fn()
      }
    } as any;

    const result = await upsertIssueComment({
      octokit,
      owner: "octo",
      repo: "repo",
      issueNumber: 1,
      body: "updated"
    });

    expect(result.created).toBe(false);
    expect(result.commentId).toBe(99);
    expect(octokit.issues.updateComment).toHaveBeenCalled();
    expect(octokit.issues.createComment).not.toHaveBeenCalled();
  });
});
