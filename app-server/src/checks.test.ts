import { describe, expect, it, vi } from "vitest";
import type { OctokitLike } from "../../shared/githubClient.js";
import { ensureCheckRuns, updateCheckRun, updateCheckRuns } from "./checks.js";

const buildOctokit = (): {
  octokit: OctokitLike;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  listForRef: ReturnType<typeof vi.fn>;
} => {
  const create = vi.fn<OctokitLike["checks"]["create"]>();
  const update = vi.fn<OctokitLike["checks"]["update"]>();
  const listForRef = vi.fn<OctokitLike["checks"]["listForRef"]>();
  const octokit: OctokitLike = {
    checks: {
      create,
      update,
      listForRef
    },
    rest: {
      repos: {
        createCommitStatus: vi.fn(),
        getContent: vi.fn()
      },
      pulls: {
        listFiles: vi.fn()
      }
    },
    actions: {
      createWorkflowDispatch: vi.fn()
    },
    paginate: vi.fn(async () => [])
  };
  return { octokit, create, update, listForRef };
};

describe("checks helpers", () => {
  it("ensures check runs by reusing existing IDs", async () => {
    const { octokit, listForRef, create } = buildOctokit();

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
    const { octokit, update } = buildOctokit();
    update.mockResolvedValue(undefined);

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
    const { octokit, create } = buildOctokit();
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
