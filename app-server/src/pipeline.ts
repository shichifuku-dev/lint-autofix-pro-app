import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { loadRepoConfig, type RepoConfig } from "./config.js";
import type { ToolStatus } from "./comment.js";

const execFileAsync = promisify(execFile);

const npmCacheDir = path.join(os.tmpdir(), "lint-autofix-pro-npm-cache");

const MAX_DIFF_LENGTH = 60000;

export type PullRequestContext = {
  owner: string;
  repo: string;
  number: number;
  headSha: string;
  headRef: string;
  headRepoFullName: string;
  isFork: boolean;
  installationToken: string;
};

export type PipelineResult = {
  config: RepoConfig;
  installStatus: ToolStatus;
  prettierStatus: ToolStatus;
  eslintStatus: ToolStatus;
  changedFiles: string[];
  diff: string;
  diffTruncated: boolean;
  notes: string[];
  autoCommit?: {
    attempted: boolean;
    pushed: boolean;
    reason?: string;
  };
};

const runCommand = async (
  command: string,
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv; timeoutMs?: number }
): Promise<{ code: number; stdout: string; stderr: string }> => {
  try {
    const result = await execFileAsync(command, args, {
      cwd: options.cwd,
      env: options.env,
      timeout: options.timeoutMs ?? 10 * 60 * 1000,
      maxBuffer: 10 * 1024 * 1024
    });
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    if (error instanceof Error && "stdout" in error && "stderr" in error) {
      const err = error as NodeJS.ErrnoException & { stdout: string; stderr: string; code?: number };
      return { code: typeof err.code === "number" ? err.code : 1, stdout: err.stdout ?? "", stderr: err.stderr ?? "" };
    }
    return { code: 1, stdout: "", stderr: String(error) };
  }
};

const runCommandOrThrow = async (
  command: string,
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv; timeoutMs?: number }
): Promise<void> => {
  const result = await runCommand(command, args, options);
  if (result.code !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
};

const ensureDirExists = async (dir: string): Promise<boolean> => {
  try {
    const stat = await fs.stat(dir);
    return stat.isDirectory();
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
};

const detectMissingTool = (output: string): boolean => {
  const haystack = output.toLowerCase();
  return (
    haystack.includes("could not determine executable to run") ||
    haystack.includes("command not found") ||
    haystack.includes("no such file or directory") ||
    haystack.includes("cannot find module")
  );
};

const sanitizeRelativePath = (repoRoot: string, workingDir: string): string => {
  const relative = path.relative(repoRoot, workingDir).replaceAll("\\\\", "/");
  return relative.length === 0 ? "." : relative;
};

const limitDiff = (diff: string): { diff: string; truncated: boolean } => {
  if (diff.length <= MAX_DIFF_LENGTH) {
    return { diff, truncated: false };
  }
  return { diff: diff.slice(0, MAX_DIFF_LENGTH) + "\n...", truncated: true };
};

export const runPullRequestPipeline = async (context: PullRequestContext): Promise<PipelineResult> => {
  const notes: string[] = [];
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "lint-autofix-pro-"));
  let config: RepoConfig | null = null;

  const cleanup = async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  };

  try {
    const repoDir = path.join(tempDir, "repo");
    await fs.mkdir(repoDir);

    const remoteUrl = `https://x-access-token:${context.installationToken}@github.com/${context.owner}/${context.repo}.git`;

    await runCommandOrThrow("git", ["init"], { cwd: repoDir });
    await runCommandOrThrow("git", ["remote", "add", "origin", remoteUrl], { cwd: repoDir });
    await runCommandOrThrow("git", ["fetch", "--depth=1", "origin", context.headSha], { cwd: repoDir });
    await runCommandOrThrow("git", ["checkout", "-b", context.headRef, "FETCH_HEAD"], { cwd: repoDir });

    config = await loadRepoConfig(repoDir);
    const workingDir = path.join(repoDir, config.workingDirectory);

    if (!(await ensureDirExists(workingDir))) {
      notes.push(`Working directory \`${config.workingDirectory}\` not found. Skipping.`);
      return {
        config,
        installStatus: "skipped",
        prettierStatus: "skipped",
        eslintStatus: "skipped",
        changedFiles: [],
        diff: "",
        diffTruncated: false,
        notes
      };
    }

    const packageJsonStat = await fs
      .stat(path.join(workingDir, "package.json"))
      .then(() => true)
      .catch(() => false);

    let installStatus: ToolStatus = "ok";
    if (!packageJsonStat) {
      installStatus = "skipped";
      notes.push("No package.json found. Skipping dependency install and lint fixes.");
    } else {
      const packageLockExists = await fs
        .stat(path.join(workingDir, "package-lock.json"))
        .then(() => true)
        .catch(() => false);

      const installCommand = packageLockExists ? ["ci"] : ["install", "--no-audit", "--no-fund"];
      const installResult = await runCommand("npm", installCommand, {
        cwd: workingDir,
        env: { ...process.env, npm_config_cache: npmCacheDir }
      });
      if (installResult.code !== 0) {
        installStatus = "failed";
        notes.push("Dependency install failed. Check package.json scripts and npm logs.");
      }
    }

    const hasEslintConfig = async () => {
      const configs = ["eslint.config.js", "eslint.config.mjs", "eslint.config.cjs", "eslint.config.ts"];
      for (const configFile of configs) {
        if (await fs.stat(path.join(workingDir, configFile)).then(() => true).catch(() => false)) {
          return true;
        }
      }
      return false;
    };

    const runFixTool = async (name: "prettier" | "eslint", args: string[]): Promise<ToolStatus> => {
      if ((name === "prettier" && !config.runPrettier) || (name === "eslint" && !config.runEslint)) {
        return "skipped";
      }
      if (installStatus === "failed") {
        return config.strict ? "failed" : "skipped";
      }
      if (!packageJsonStat) {
        return "skipped";
      }
      if (name === "eslint") {
        const eslintConfig = await hasEslintConfig();
        if (!eslintConfig && !config.strict) {
          notes.push("ESLint flat config (eslint.config.*) not found. Skipping ESLint.");
          return "skipped";
        }
      }
      const result = await runCommand("npx", ["--no-install", name, ...args], {
        cwd: workingDir,
        env: process.env
      });
      if (result.code === 0) {
        return "ok";
      }
      const missing = detectMissingTool(result.stderr + result.stdout);
      if (missing && !config.strict) {
        notes.push(`${name} not installed. Add it to devDependencies or enable strict mode.`);
        return "skipped";
      }
      notes.push(`${name} failed. Review logs in the server output.`);
      return "failed";
    };

    const prettierStatus = await runFixTool("prettier", ["--write", "."]);
    const eslintStatus = await runFixTool("eslint", ["--fix", "."]);

    const relativeWorkingDir = sanitizeRelativePath(repoDir, workingDir);
    const isRootWorkingDir = relativeWorkingDir === ".";
    const statusResult = await runCommand("git", ["status", "--porcelain"], { cwd: repoDir });
    const changedLines = statusResult.stdout.split("\n").filter(Boolean);
    const outsideFiles = changedLines
      .map((line) => line.slice(3))
      .filter((file) => !isRootWorkingDir && !file.startsWith(relativeWorkingDir));

    if (outsideFiles.length > 0) {
      await runCommand("git", ["checkout", "--", ...outsideFiles], { cwd: repoDir });
      notes.push("Changes outside the working directory were discarded.");
    }

    const changedFilesResult = await runCommand("git", ["diff", "--name-only", "--", relativeWorkingDir], {
      cwd: repoDir
    });
    const changedFiles = changedFilesResult.stdout.split("\n").filter(Boolean);

    const diffResult = await runCommand("git", ["diff", "--", relativeWorkingDir], { cwd: repoDir });
    const limitedDiff = limitDiff(diffResult.stdout);

    const autoCommit = await maybeAutoCommit({
      context,
      repoDir,
      relativeWorkingDir,
      config,
      changedFiles
    });

    return {
      config,
      installStatus,
      prettierStatus,
      eslintStatus,
      changedFiles,
      diff: limitedDiff.diff,
      diffTruncated: limitedDiff.truncated,
      notes,
      autoCommit
    };
  } finally {
    await cleanup();
  }
};

const maybeAutoCommit = async ({
  context,
  repoDir,
  relativeWorkingDir,
  config,
  changedFiles
}: {
  context: PullRequestContext;
  repoDir: string;
  relativeWorkingDir: string;
  config: RepoConfig;
  changedFiles: string[];
}): Promise<PipelineResult["autoCommit"]> => {
  if (config.mode !== "autocommit" || !config.autocommit.enabled) {
    return { attempted: false, pushed: false };
  }

  if (changedFiles.length === 0) {
    return { attempted: true, pushed: false, reason: "No changes to auto-commit." };
  }

  if (context.isFork) {
    return {
      attempted: true,
      pushed: false,
      reason: "Auto-commit skipped because the pull request comes from a fork."
    };
  }

  await runCommand("git", ["add", relativeWorkingDir], { cwd: repoDir });
  await runCommand("git", ["config", "user.name", config.autocommit.authorName], { cwd: repoDir });
  await runCommand("git", ["config", "user.email", config.autocommit.authorEmail], { cwd: repoDir });

  const commitResult = await runCommand("git", ["commit", "-m", config.autocommit.commitMessage], { cwd: repoDir });
  if (commitResult.code !== 0) {
    return { attempted: true, pushed: false, reason: "Auto-commit failed to create a commit." };
  }

  const remoteUrl = `https://x-access-token:${context.installationToken}@github.com/${context.owner}/${context.repo}.git`;
  await runCommand("git", ["remote", "set-url", "origin", remoteUrl], { cwd: repoDir });
  const pushResult = await runCommand("git", ["push", "origin", `HEAD:refs/heads/${context.headRef}`], {
    cwd: repoDir
  });

  if (pushResult.code !== 0) {
    return { attempted: true, pushed: false, reason: "Auto-commit failed to push to the PR branch." };
  }

  return { attempted: true, pushed: true };
};
