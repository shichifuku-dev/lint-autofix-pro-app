import { describe, expect, it, vi } from "vitest";
import { type Octokit } from "@octokit/rest";
import { reportCheckCompleteFailure, reportCheckCompleteSuccess, reportCheckStart } from "./checks.js";

const buildOctokit = () => {
  const create = vi.fn();
  const update = vi.fn();
  return {
    checks: {
      create,
      update
    }
  } as unknown as Octokit;
};

describe("checks helpers", () => {
  it("creates in-progress check runs for required contexts", async () => {
    const octokit = buildOctokit();
    const create = octokit.checks.create as unknown as ReturnType<typeof vi.fn>;
    create.mockResolvedValueOnce({ data: { id: 101 } });
    create.mockResolvedValueOnce({ data: { id: 102 } });

    const result = await reportCheckStart({
      octokit,
      owner: "octo",
      repo: "repo",
      headSha: "sha123"
    });

    expect(create).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ name: "CI/check", status: "in_progress", head_sha: "sha123" }));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ name: "CI/autofix", status: "in_progress", head_sha: "sha123" }));
    expect(result).toEqual({ "CI/check": 101, "CI/autofix": 102 });
  });

  it("completes check runs with success", async () => {
    const octokit = buildOctokit();
    const update = octokit.checks.update as unknown as ReturnType<typeof vi.fn>;
    update.mockResolvedValue({});

    await reportCheckCompleteSuccess({
      octokit,
      owner: "octo",
      repo: "repo",
      headSha: "sha123",
      checkRunIds: { "CI/check": 201, "CI/autofix": 202 }
    });

    expect(update).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ check_run_id: 201, conclusion: "success" }));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ check_run_id: 202, conclusion: "success" }));
  });

  it("creates completed failure check runs when ids are missing", async () => {
    const octokit = buildOctokit();
    const create = octokit.checks.create as unknown as ReturnType<typeof vi.fn>;
    create.mockResolvedValue({ data: { id: 301 } });

    await reportCheckCompleteFailure({
      octokit,
      owner: "octo",
      repo: "repo",
      headSha: "sha123",
      error: new Error("boom")
    });

    expect(create).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ name: "CI/check", conclusion: "failure" }));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ name: "CI/autofix", conclusion: "failure" }));
  });
});
