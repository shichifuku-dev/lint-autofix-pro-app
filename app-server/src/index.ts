import "dotenv/config";
import express from "express";
import { App } from "@octokit/app";
import { Webhooks } from "@octokit/webhooks";
import { prisma } from "./db.js";
import { Octokit } from "@octokit/rest";
import { buildCommentBody } from "./comment.js";
import { upsertIssueComment } from "./comments.js";
import { getDefaultConfig } from "./config.js";
import { reportCheckCompleteFailure, reportCheckCompleteSuccess, reportCheckStart } from "./checks.js";
import { runPullRequestPipeline } from "./pipeline.js";
import {
  reportRequiredStatusesFailure,
  reportRequiredStatusesStart,
  reportRequiredStatusesSuccess
} from "./status.js";
import { createPullRequestHandler } from "./pullRequestHandler.js";

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

const webhooks = new Webhooks({
  secret: process.env.WEBHOOK_SECRET ?? ""
});

webhooks.on("installation", async (event) => {
  const payload = event.payload as {
    action: "created" | "deleted";
    installation?: { id: number; account?: Record<string, unknown> | null };
  };
  const installationId = payload.installation?.id;
  if (!installationId) {
    return;
  }
  const account = payload.installation?.account;
  const accountLogin =
    account && "login" in account ? (account.login as string) : account && "name" in account ? (account.name as string) ?? "unknown" : "unknown";
  const accountType = account && "type" in account ? (account.type as string) : "Organization";
  if (payload.action === "deleted") {
    await prisma.repoConfig.deleteMany({
      where: { installationId }
    });
    await prisma.installation.deleteMany({
      where: { installationId }
    });
    return;
  }

  if (payload.action === "created") {
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
});

webhooks.on(
  "pull_request",
  createPullRequestHandler({
    app,
    prisma,
    runPullRequestPipeline,
    buildCommentBody,
    upsertIssueComment,
    reportCheckStart,
    reportCheckCompleteSuccess,
    reportCheckCompleteFailure,
    reportRequiredStatusesStart,
    reportRequiredStatusesSuccess,
    reportRequiredStatusesFailure,
    getDefaultConfig,
    createOctokit: (token) => new Octokit({ auth: token })
  })
);

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

  const payload = req.body.toString("utf8");

  try {
    webhooks.verify(payload, signature);
  } catch (error) {
    const statusCode = error instanceof Error && error.name === "WebhookVerificationError" ? 401 : 400;
    console.error("Webhook verification error", error);
    res.status(statusCode).send("Webhook verification failed");
    return;
  }

  res.status(200).send("OK");

  let parsedPayload: unknown;
  try {
    parsedPayload = JSON.parse(payload);
  } catch (error) {
    console.error("Webhook payload parse error", error);
    return;
  }

  void webhooks
    .receive({
      id,
      name: name as any,
      payload: parsedPayload as any
    } as any)
    .catch((error) => {
      console.error("Webhook handler error", error);
    });
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
