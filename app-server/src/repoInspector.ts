import path from "node:path";
import type { Octokit } from "@octokit/rest";

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

const isNotFoundError = (error: unknown): boolean =>
  !!error && typeof error === "object" && "status" in error && (error as { status: number }).status === 404;

const getFileContent = async ({
  octokit,
  owner,
  repo,
  ref,
  filePath
}: {
  octokit: Octokit;
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
  octokit: Octokit;
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
  octokit: Octokit;
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
  octokit: Octokit;
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
  octokit: Octokit;
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
      const packageJson = JSON.parse(packageJsonRaw) as {
        scripts?: Record<string, string>;
        eslintConfig?: unknown;
        prettier?: unknown;
      };
      const scriptValues = Object.values(packageJson.scripts ?? {}).join(" ").toLowerCase();
      if (scriptValues.includes("eslint") || packageJson.eslintConfig) {
        hasEslintConfig = true;
      }
      if (scriptValues.includes("prettier") || packageJson.prettier) {
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
