import type { RepoConfig } from "./config.js";

export const COMMENT_MARKER = "<!-- lint-autofix-pro -->";

export type ToolStatus = "ok" | "skipped" | "failed";

export type CommentDetails = {
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

const statusIcon = (status: ToolStatus): string => {
  switch (status) {
    case "ok":
      return "✅";
    case "failed":
      return "❌";
    case "skipped":
    default:
      return "⚠️";
  }
};

const renderChangedFiles = (files: string[], maxFiles: number): string => {
  if (files.length === 0) {
    return "No changes detected.";
  }
  const limited = files.slice(0, maxFiles);
  const overflow = files.length - limited.length;
  const lines = limited.map((file) => `- \\`${file}\\``);
  if (overflow > 0) {
    lines.push(`- …and ${overflow} more`);
  }
  return lines.join("\n");
};

const renderHowToFix = (details: CommentDetails): string => {
  if (details.diff.length === 0) {
    return "No fixes were applied. Ensure Prettier/ESLint are installed and try pushing a new commit.";
  }
  if (details.autoCommit?.attempted && details.autoCommit.pushed) {
    return "Auto-commit is enabled. Pull the latest commits to get the fixes.";
  }
  if (details.autoCommit?.attempted && !details.autoCommit.pushed) {
    return details.autoCommit.reason ?? "Auto-commit was skipped. You can apply the diff manually.";
  }
  return "Apply the diff below locally or enable auto-commit in `.lint-autofix-pro.yml`.";
};

export const buildCommentBody = (details: CommentDetails): string => {
  const lines = [
    "## Lint Autofix Pro",
    "",
    `${COMMENT_MARKER}`,
    `Working directory: \\`${details.config.workingDirectory}\\``,
    "",
    "### What happened",
    `- Install dependencies: ${statusIcon(details.installStatus)}`,
    `- Prettier: ${statusIcon(details.prettierStatus)}`,
    `- ESLint: ${statusIcon(details.eslintStatus)}`,
    "",
    "### Changed files",
    renderChangedFiles(details.changedFiles, details.config.maxFiles),
    "",
    "### Diff",
    "```diff",
    details.diff.length > 0 ? details.diff : "(no changes)",
    "```"
  ];

  if (details.diffTruncated) {
    lines.push("Diff truncated to fit GitHub comment limits.");
  }

  if (details.notes.length > 0) {
    lines.push("", "### Notes", ...details.notes.map((note) => `- ${note}`));
  }

  lines.push("", "### How to fix", renderHowToFix(details));

  return lines.join("\n");
};
