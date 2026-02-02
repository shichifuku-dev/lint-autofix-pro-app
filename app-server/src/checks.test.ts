import { describe, expect, it, vi } from "vitest";
import type { OctokitLike } from "./githubClient.js";
import { ensureCheckRuns, updateCheckRun, updateCheckRuns } from "./checks.js";

const buildOctokit = () => {
  const create = vi.fn();
  const update = vi.fn();
  const listForRef = vi.fn();
  return {
    checks: {
      create,
      update,
      listForRef
    }
  } as unknown as OctokitLike;
};

describe("checks helpers", () => {
  it("ensures check runs by reusing existing IDs", async () => {
    const octokit = buildOctokit();
    const listForRef = octokit.checks.listForRef as unknown as ReturnType<typeof vi.fn>;
    const create = octokit.checks.create as unknown as ReturnType<typeof vi.fn>;

    listForRef.mockResolvedValueOnce({
      data: {
        check_runs: [{ name: "CI/check", id: 101 }]
      }
    });
    create.mockResolvedValueOnce({ data: { id: 202 } });

    const result = await ensureCheckRuns({
      octokit,
      owner: "octo",
      repo: "repo",
      headSha: "sha123"
    });

    expect(listForRef).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ "CI/check": 101, "CI/autofix": 202 });
  });

  it("updates check runs with success", async () => {
    const octokit = buildOctokit();
    const update = octokit.checks.update as unknown as ReturnType<typeof vi.fn>;
    update.mockResolvedValue({});

    await updateCheckRuns({
      octokit,
      owner: "octo",
      repo: "repo",
      headSha: "sha123",
      checkRunIds: { "CI/check": 201, "CI/autofix": 202 },
      status: "completed",
      conclusion: "success",
      summary: "Done"
    });

    expect(update).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ check_run_id: 201, conclusion: "success" }));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ check_run_id: 202, conclusion: "success" }));
  });

  it("creates a check run when updating without an ID", async () => {
    const octokit = buildOctokit();
    const create = octokit.checks.create as unknown as ReturnType<typeof vi.fn>;
    create.mockResolvedValue({ data: { id: 303 } });

    await updateCheckRun({
      octokit,
      owner: "octo",
      repo: "repo",
      headSha: "sha123",
      name: "CI/check",
      status: "completed",
      conclusion: "failure",
      summary: "Oops"
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ name: "CI/check", conclusion: "failure" }));
  });
});
