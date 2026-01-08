import { describe, expect, it } from "vitest";
import { parseRepoConfig } from "../src/config.js";

describe("parseRepoConfig", () => {
  it("applies defaults when input is empty", () => {
    const config = parseRepoConfig(null);
    expect(config.workingDirectory).toBe(".");
    expect(config.runPrettier).toBe(true);
    expect(config.runEslint).toBe(true);
    expect(config.strict).toBe(false);
    expect(config.maxFiles).toBe(10);
    expect(config.mode).toBe("comment");
    expect(config.autocommit.enabled).toBe(false);
  });

  it("overrides values from yaml", () => {
    const config = parseRepoConfig({
      working_directory: "packages/app",
      run_prettier: false,
      run_eslint: true,
      strict: true,
      max_files: 5,
      mode: "autocommit",
      autocommit: {
        enabled: true,
        commit_message: "chore: autofix",
        author_name: "Bot",
        author_email: "bot@example.com"
      }
    });

    expect(config.workingDirectory).toBe("packages/app");
    expect(config.runPrettier).toBe(false);
    expect(config.strict).toBe(true);
    expect(config.maxFiles).toBe(5);
    expect(config.mode).toBe("autocommit");
    expect(config.autocommit.enabled).toBe(true);
    expect(config.autocommit.commitMessage).toBe("chore: autofix");
  });
});
