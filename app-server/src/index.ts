import "dotenv/config";
import express from "express";
import { App } from "@octokit/app";
import { prisma } from "./db.js";
import { Octokit } from "@octokit/rest";
import { createCheckReporter } from "./checkReporter.js";
import { ensureCheckRuns, updateCheckRun } from "./checks.js";
import { createOctokitClient } from "./githubClient.js";
import { getRunnerConfig } from "./runnerConfig.js";
import { createPullRequestHandler } from "./pullRequestHandler.js";
import { dispatchRunnerWorkflow } from "./runnerDispatch.js";
import { detectRepoTooling, isSupportedFile, listPullRequestFiles } from "./repoInspector.js";
import { getPlan, planPolicy } from "./plan.js";
import { reportStatus } from "./status.js";
import { handleInstallationEvent, handleWebhookEvent } from "./webhookCore.js";
import { verifyWebhookSignature } from "./webhookSignature.js";

const requiredEnv = ["GITHUB_APP_ID", "GITHUB_APP_PRIVATE_KEY", "WEBHOOK_SECRET"] as const;
for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}`);
  }
}

const privateKey = process.env.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, "\n") ?? "";

const app = new App({
  appId: Number(process.env.GITHUB_APP_ID),
  privateKey
});

const extractInstallationToken = (data: unknown): string => {
  if (!data || typeof data !== "object" || !("token" in data) || typeof data.token !== "string") {
    throw new Error("Missing installation access token");
  }
  return data.token;
};

const pullRequestHandler = createPullRequestHandler({
  getInstallationToken: async (installationId) => {
    const appOctokit = await app.getInstallationOctokit(installationId);
    const tokenResponse = await appOctokit.request("POST /app/installations/{installation_id}/access_tokens", {
      installation_id: installationId
    });
    return extractInstallationToken(tokenResponse.data);
  },
  createOctokit: (token) => createOctokitClient(new Octokit({ auth: token })),
  createCheckReporter,
  listPullRequestFiles,
  detectRepoTooling,
  isSupportedFile,
  dispatchRunnerWorkflow,
  getRunnerConfig,
  getPlan,
  planPolicy
});

const installationHandler = async (payload: { action: "created" | "deleted"; installation?: { id: number; account?: Record<string, unknown> | null } }) =>
  handleInstallationEvent({
    payload,
    store: {
      deleteInstallation: async (installationId) => {
        await prisma.repoConfig.deleteMany({
          where: { installationId }
        });
        await prisma.installation.deleteMany({
          where: { installationId }
        });
      },
      upsertInstallation: async ({ installationId, accountLogin, accountType }) => {
        await prisma.installation.upsert({
          where: { installationId },
          update: {
            accountLogin,
            accountType
          },
          create: {
            installationId,
            accountLogin,
            accountType
          }
        });
      }
    }
  });

const server = express();

server.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

server.get("/admin", async (req, res) => {
  const adminToken = process.env.ADMIN_TOKEN;
  const authHeader = req.headers.authorization ?? "";
  if (!adminToken || authHeader !== `Bearer ${adminToken}`) {
    res.status(401).send("Unauthorized");
    return;
  }

  const installations = await prisma.installation.findMany({
    include: { repoConfigs: true },
    orderBy: { id: "desc" }
  });

  const html = `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>Lint Autofix Pro Admin</title>
      <style>
        body { font-family: sans-serif; margin: 2rem; }
        h1 { margin-bottom: 1rem; }
        pre { background: #f4f4f4; padding: 1rem; }
      </style>
    </head>
    <body>
      <h1>Lint Autofix Pro Admin</h1>
      ${installations
        .map((install) => {
          const configs = install.repoConfigs
            .map((config) => `<li><strong>${config.repoFullName}</strong><pre>${config.configJson}</pre></li>`)
            .join("");
          return `
            <section>
              <h2>${install.accountLogin} (${install.accountType})</h2>
              <p>Installation ID: ${install.installationId}</p>
              <ul>${configs || "<li>No repo config stored yet.</li>"}</ul>
            </section>
          `;
        })
        .join("")}
    </body>
  </html>`;

  res.status(200).send(html);
});

server.post("/webhooks", express.raw({ type: "application/json" }), async (req, res) => {
  const idHeader = req.headers["x-github-delivery"];
  const nameHeader = req.headers["x-github-event"];
  const signatureHeader = req.headers["x-hub-signature-256"];
  const id = typeof idHeader === "string" ? idHeader : undefined;
  const name = typeof nameHeader === "string" ? nameHeader : undefined;
  const signature = typeof signatureHeader === "string" ? signatureHeader : undefined;

  if (!id || !name || !signature) {
    res.status(400).send("Missing webhook headers");
    return;
  }

  const payloadBuffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(String(req.body ?? ""));
  const payloadText = payloadBuffer.toString("utf8");
  const verified = verifyWebhookSignature({
    payload: payloadBuffer,
    signatureHeader: signature,
    secret: process.env.WEBHOOK_SECRET ?? ""
  });
  if (!verified) {
    console.error("Webhook verification error");
    res.status(401).send("Webhook verification failed");
    return;
  }

  res.status(200).send("OK");

  let parsedPayload: unknown;
  try {
    parsedPayload = JSON.parse(payloadText);
  } catch (error) {
    console.error("Webhook payload parse error", error);
    return;
  }

  void handleWebhookEvent({
    name,
    payload: parsedPayload,
    handlers: {
      installation: (payload) => installationHandler(payload),
      pull_request: (payload) => pullRequestHandler({ payload })
    },
    deliveryId: id
  }).catch((error) => {
    console.error("Webhook handler error", error);
  });
});

server.post("/callbacks/runner", express.json({ type: "application/json" }), async (req, res) => {
  const { callbackToken } = getRunnerConfig();
  const authHeader = req.headers.authorization ?? "";

  if (!callbackToken || authHeader !== `Bearer ${callbackToken}`) {
    res.status(401).send("Unauthorized");
    return;
  }

  const payload = typeof req.body === "object" && req.body !== null ? req.body : null;
  const owner = payload && "owner" in payload && typeof payload.owner === "string" ? payload.owner : null;
  const repo = payload && "repo" in payload && typeof payload.repo === "string" ? payload.repo : null;
  const headSha = payload && "headSha" in payload && typeof payload.headSha === "string" ? payload.headSha : null;
  const installationId =
    payload && "installationId" in payload && typeof payload.installationId === "number" ? payload.installationId : null;
  const summary = payload && "summary" in payload && typeof payload.summary === "string" ? payload.summary : null;
  const checkConclusion =
    payload && "checkConclusion" in payload && payload.checkConclusion === "failure" ? "failure" : "success";
  const autofixConclusion =
    payload && "autofixConclusion" in payload && payload.autofixConclusion === "failure" ? "failure" : "success";
  const detailsUrl = payload && "detailsUrl" in payload && typeof payload.detailsUrl === "string" ? payload.detailsUrl : undefined;

  if (!owner || !repo || !headSha || !installationId || !summary) {
    res.status(400).send("Missing callback payload fields");
    return;
  }

  try {
    const appOctokit = await app.getInstallationOctokit(installationId);
    const tokenResponse = await appOctokit.request("POST /app/installations/{installation_id}/access_tokens", {
      installation_id: installationId
    });
    const token = extractInstallationToken(tokenResponse.data);
    const octokit = createOctokitClient(new Octokit({ auth: token }));

    try {
      const checkRunIds = await ensureCheckRuns({
        octokit,
        owner,
        repo,
        headSha
      });

      await updateCheckRun({
        octokit,
        owner,
        repo,
        headSha,
        checkRunId: checkRunIds["CI/check"],
        name: "CI/check",
        status: "completed",
        conclusion: checkConclusion,
        summary,
        text: detailsUrl ? `Details: ${detailsUrl}` : undefined
      });

      await updateCheckRun({
        octokit,
        owner,
        repo,
        headSha,
        checkRunId: checkRunIds["CI/autofix"],
        name: "CI/autofix",
        status: "completed",
        conclusion: autofixConclusion,
        summary,
        text: detailsUrl ? `Details: ${detailsUrl}` : undefined
      });
    } catch (error) {
      console.error("Check run update failed; falling back to commit statuses.", error);
      await reportStatus({
        octokit,
        owner,
        repo,
        sha: headSha,
        context: "CI/check",
        state: checkConclusion === "failure" ? "failure" : "success",
        description: summary,
        targetUrl: detailsUrl
      });
      await reportStatus({
        octokit,
        owner,
        repo,
        sha: headSha,
        context: "CI/autofix",
        state: autofixConclusion === "failure" ? "failure" : "success",
        description: summary,
        targetUrl: detailsUrl
      });
    }

    res.status(200).send("OK");
  } catch (error) {
    console.error("Runner callback error", error);
    res.status(500).send("Callback processing failed");
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => {
  console.log(`Lint Autofix Pro server listening on port ${port}`);
});

process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await prisma.$disconnect();
  process.exit(0);
});

if (process.env.NODE_ENV === "test") {
  console.warn("Running in test mode.");
}
