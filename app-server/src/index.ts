import "dotenv/config";
import express from "express";
import { App } from "@octokit/app";
import { prisma } from "./db.js";
import { Octokit } from "@octokit/rest";
import { createCheckReporter } from "./checkReporter.js";
import { ensureCheckRuns, updateCheckRun } from "./checks.js";
import { getRunnerConfig } from "./runnerConfig.js";
import { createPullRequestHandler } from "./pullRequestHandler.js";
import { dispatchRunnerWorkflow } from "./runnerDispatch.js";
import { detectRepoTooling, isSupportedFile, listPullRequestFiles } from "./repoInspector.js";
import { getPlan, planPolicy } from "./plan.js";
import { reportStatus } from "./status.js";
import { handleInstallationEvent, handleWebhookEvent, verifyWebhookSignature } from "./webhookCore.js";

const requiredEnv = ["APP_ID", "PRIVATE_KEY", "WEBHOOK_SECRET"] as const;
for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}`);
  }
}

const privateKey = process.env.PRIVATE_KEY?.replace(/\\n/g, "\n") ?? "";

const app = new App({
  appId: Number(process.env.APP_ID),
  privateKey
});

const pullRequestHandler = createPullRequestHandler({
  getInstallationToken: async (installationId) => {
    const appOctokit = await app.getInstallationOctokit(installationId);
    const tokenResponse = await appOctokit.request("POST /app/installations/{installation_id}/access_tokens", {
      installation_id: installationId
    });
    return tokenResponse.data.token as string;
  },
  createOctokit: (token) => new Octokit({ auth: token }),
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
  const id = req.headers["x-github-delivery"] as string | undefined;
  const name = req.headers["x-github-event"] as string | undefined;
  const signature = req.headers["x-hub-signature-256"] as string | undefined;

  if (!id || !name || !signature) {
    res.status(400).send("Missing webhook headers");
    return;
  }

  const payloadBuffer = req.body as Buffer;
  const payloadText = payloadBuffer.toString("utf8");
  const verified = await verifyWebhookSignature({
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

  const payload = req.body as {
    owner?: string;
    repo?: string;
    headSha?: string;
    installationId?: number;
    checkConclusion?: "success" | "failure";
    autofixConclusion?: "success" | "failure";
    summary?: string;
    detailsUrl?: string;
  };

  if (!payload.owner || !payload.repo || !payload.headSha || !payload.installationId || !payload.summary) {
    res.status(400).send("Missing callback payload fields");
    return;
  }

  const checkConclusion = payload.checkConclusion ?? "success";
  const autofixConclusion = payload.autofixConclusion ?? "success";

  try {
    const appOctokit = await app.getInstallationOctokit(payload.installationId);
    const tokenResponse = await appOctokit.request("POST /app/installations/{installation_id}/access_tokens", {
      installation_id: payload.installationId
    });
    const token = tokenResponse.data.token as string;
    const octokit = new Octokit({ auth: token });

    try {
      const checkRunIds = await ensureCheckRuns({
        octokit,
        owner: payload.owner,
        repo: payload.repo,
        headSha: payload.headSha
      });

      await updateCheckRun({
        octokit,
        owner: payload.owner,
        repo: payload.repo,
        headSha: payload.headSha,
        checkRunId: checkRunIds["CI/check"],
        name: "CI/check",
        status: "completed",
        conclusion: checkConclusion,
        summary: payload.summary,
        text: payload.detailsUrl ? `Details: ${payload.detailsUrl}` : undefined
      });

      await updateCheckRun({
        octokit,
        owner: payload.owner,
        repo: payload.repo,
        headSha: payload.headSha,
        checkRunId: checkRunIds["CI/autofix"],
        name: "CI/autofix",
        status: "completed",
        conclusion: autofixConclusion,
        summary: payload.summary,
        text: payload.detailsUrl ? `Details: ${payload.detailsUrl}` : undefined
      });
    } catch (error) {
      console.error("Check run update failed; falling back to commit statuses.", error);
      await reportStatus({
        octokit,
        owner: payload.owner,
        repo: payload.repo,
        sha: payload.headSha,
        context: "CI/check",
        state: checkConclusion === "failure" ? "failure" : "success",
        description: payload.summary,
        targetUrl: payload.detailsUrl
      });
      await reportStatus({
        octokit,
        owner: payload.owner,
        repo: payload.repo,
        sha: payload.headSha,
        context: "CI/autofix",
        state: autofixConclusion === "failure" ? "failure" : "success",
        description: payload.summary,
        targetUrl: payload.detailsUrl
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
