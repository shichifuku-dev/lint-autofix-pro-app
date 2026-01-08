import fs from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";

export type RepoConfig = {
  workingDirectory: string;
  runPrettier: boolean;
  runEslint: boolean;
  strict: boolean;
  maxFiles: number;
  mode: "comment" | "autocommit";
  autocommit: {
    enabled: boolean;
    commitMessage: string;
    authorName: string;
    authorEmail: string;
  };
};

const DEFAULT_CONFIG: RepoConfig = {
  workingDirectory: ".",
  runPrettier: true,
  runEslint: true,
  strict: false,
  maxFiles: 10,
  mode: "comment",
  autocommit: {
    enabled: false,
    commitMessage: "chore: lint autofix",
    authorName: "Lint Autofix Pro",
    authorEmail: "lint-autofix-pro@users.noreply.github.com"
  }
};

export const CONFIG_FILE_NAME = ".lint-autofix-pro.yml";

export const parseRepoConfig = (input: unknown): RepoConfig => {
  const config = { ...DEFAULT_CONFIG };
  if (!input || typeof input !== "object") {
    return config;
  }
  const data = input as Record<string, unknown>;
  if (typeof data.working_directory === "string" && data.working_directory.trim()) {
    config.workingDirectory = data.working_directory;
  }
  if (typeof data.run_prettier === "boolean") {
    config.runPrettier = data.run_prettier;
  }
  if (typeof data.run_eslint === "boolean") {
    config.runEslint = data.run_eslint;
  }
  if (typeof data.strict === "boolean") {
    config.strict = data.strict;
  }
  if (typeof data.max_files === "number" && Number.isFinite(data.max_files)) {
    config.maxFiles = Math.max(1, Math.floor(data.max_files));
  }
  if (data.mode === "comment" || data.mode === "autocommit") {
    config.mode = data.mode;
  }
  if (typeof data.autocommit === "object" && data.autocommit) {
    const auto = data.autocommit as Record<string, unknown>;
    if (typeof auto.enabled === "boolean") {
      config.autocommit.enabled = auto.enabled;
    }
    if (typeof auto.commit_message === "string" && auto.commit_message.trim()) {
      config.autocommit.commitMessage = auto.commit_message;
    }
    if (typeof auto.author_name === "string" && auto.author_name.trim()) {
      config.autocommit.authorName = auto.author_name;
    }
    if (typeof auto.author_email === "string" && auto.author_email.trim()) {
      config.autocommit.authorEmail = auto.author_email;
    }
  }

  return config;
};

export const loadRepoConfig = async (repoRoot: string): Promise<RepoConfig> => {
  const rootConfigPath = path.join(repoRoot, CONFIG_FILE_NAME);
  let rawConfig: RepoConfig = DEFAULT_CONFIG;
  let workingDirectory = DEFAULT_CONFIG.workingDirectory;

  try {
    const raw = await fs.readFile(rootConfigPath, "utf8");
    rawConfig = parseRepoConfig(yaml.load(raw));
    workingDirectory = rawConfig.workingDirectory;
  } catch (error) {
    if (!(error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT")) {
      throw error;
    }
  }

  const workingDirConfigPath = path.join(repoRoot, workingDirectory, CONFIG_FILE_NAME);
  if (workingDirConfigPath !== rootConfigPath) {
    try {
      const raw = await fs.readFile(workingDirConfigPath, "utf8");
      rawConfig = parseRepoConfig(yaml.load(raw));
    } catch (error) {
      if (!(error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT")) {
        throw error;
      }
    }
  }

  return rawConfig;
};

export const configToJson = (config: RepoConfig): string => JSON.stringify(config, null, 2);

export const getDefaultConfig = (): RepoConfig => ({ ...DEFAULT_CONFIG, autocommit: { ...DEFAULT_CONFIG.autocommit } });
