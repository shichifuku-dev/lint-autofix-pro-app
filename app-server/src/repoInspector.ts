import path from "node:path";
import type { OctokitLike } from "../../shared/githubClient.js";

const SUPPORTED_EXTENSIONS = new Set([".js", ".ts", ".tsx", ".jsx", ".json", ".yaml", ".yml", ".css", ".md"]);
const README_REGEX = /^readme(\.|$)/i;

const ESLINT_CONFIG_FILES = [
  ".eslintrc",
  ".eslintrc.js",
  ".eslintrc.cjs",
  ".eslintrc.json",
  ".eslintrc.yaml",
  ".eslintrc.yml",
  "eslint.config.js",
  "eslint.config.mjs",
  "eslint.config.cjs",
  "eslint.config.ts"
];

const PRETTIER_CONFIG_FILES = [
  ".prettierrc",
  ".prettierrc.js",
  ".prettierrc.cjs",
  ".prettierrc.json",
  ".prettierrc.yaml",
  ".prettierrc.yml",
  ".prettierrc.toml",
  "prettier.config.js",
  "prettier.config.cjs",
  "prettier.config.mjs",
  "prettier.config.ts"
];

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object";

const isNotFoundError = (error: unknown): boolean => {
  if (!isRecord(error) || !("status" in error)) {
    return false;
  }
  return error.status === 404;
};

const getFileContent = async ({
  octokit,
  owner,
  repo,
  ref,
  filePath
}: {
  octokit: OctokitLike;
  owner: string;
  repo: string;
  ref: string;
  filePath: string;
}): Promise<string | null> => {
  try {
    const response = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: filePath,
      ref
    });
    if (Array.isArray(response.data)) {
      return null;
    }
    if ("content" in response.data && typeof response.data.content === "string") {
      return Buffer.from(response.data.content, "base64").toString("utf8");
    }
    return null;
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }
    throw error;
  }
};

const fileExists = async (params: {
  octokit: OctokitLike;
  owner: string;
  repo: string;
  ref: string;
  filePath: string;
}): Promise<boolean> => {
  const content = await getFileContent(params);
  return content !== null;
};

export const isSupportedFile = (filename: string): boolean => {
  const base = path.basename(filename);
  if (README_REGEX.test(base)) {
    return false;
  }
  const ext = path.extname(base).toLowerCase();
  return SUPPORTED_EXTENSIONS.has(ext);
};

export const listPullRequestFiles = async ({
  octokit,
  owner,
  repo,
  pullNumber
}: {
  octokit: OctokitLike;
  owner: string;
  repo: string;
  pullNumber: number;
}): Promise<string[]> => {
  const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
    owner,
    repo,
    pull_number: pullNumber,
    per_page: 100
  });
  return files.map((file) => file.filename);
};

const hasConfigFiles = async ({
  octokit,
  owner,
  repo,
  ref,
  paths
}: {
  octokit: OctokitLike;
  owner: string;
  repo: string;
  ref: string;
  paths: string[];
}): Promise<boolean> => {
  for (const configPath of paths) {
    if (await fileExists({ octokit, owner, repo, ref, filePath: configPath })) {
      return true;
    }
  }
  return false;
};

export const detectRepoTooling = async ({
  octokit,
  owner,
  repo,
  headSha
}: {
  octokit: OctokitLike;
  owner: string;
  repo: string;
  headSha: string;
}): Promise<{ hasEslint: boolean; hasPrettier: boolean }> => {
  const packageJsonRaw = await getFileContent({
    octokit,
    owner,
    repo,
    ref: headSha,
    filePath: "package.json"
  });

  let hasEslintConfig = await hasConfigFiles({ octokit, owner, repo, ref: headSha, paths: ESLINT_CONFIG_FILES });
  let hasPrettierConfig = await hasConfigFiles({ octokit, owner, repo, ref: headSha, paths: PRETTIER_CONFIG_FILES });

  if (packageJsonRaw) {
    try {
      const parsed = JSON.parse(packageJsonRaw);
      const packageJson = isRecord(parsed) ? parsed : null;
      const scripts = packageJson && isRecord(packageJson.scripts) ? packageJson.scripts : null;
      const scriptValues = scripts
        ? Object.values(scripts)
            .filter((value): value is string => typeof value === "string")
            .join(" ")
            .toLowerCase()
        : "";
      if (scriptValues.includes("eslint") || (packageJson && "eslintConfig" in packageJson)) {
        hasEslintConfig = true;
      }
      if (scriptValues.includes("prettier") || (packageJson && "prettier" in packageJson)) {
        hasPrettierConfig = true;
      }
    } catch (error) {
      console.warn("Failed to parse package.json for tooling detection", error);
    }
  }

  return {
    hasEslint: hasEslintConfig,
    hasPrettier: hasPrettierConfig
  };
};
