import { App } from "@octokit/app";
import { Octokit } from "@octokit/rest";
import { createCheckReporter } from "./checkReporter.js";
import { ensureCheckRuns, updateCheckRun } from "./checks.js";
import { getRunnerConfig, type RunnerEnv } from "./runnerConfig.js";
import { createPullRequestHandler } from "./pullRequestHandler.js";
import { dispatchRunnerWorkflow } from "./runnerDispatch.js";
import { detectRepoTooling, listPullRequestFiles } from "./repoInspector.js";
import { getPlan, planPolicy } from "./plan.js";
import { reportStatus } from "./status.js";
import {
  deleteInstallationData,
  listInstallations,
  listRepoConfigsForInstallation,
  putInstallation,
  type InstallationRecord
} from "./kvStore.js";
import { createRouter, jsonResponse, type WorkerExecutionContext } from "./router.js";
import { verifyWebhookSignature } from "./webhookVerify.js";

export type WorkerEnv = RunnerEnv & {
  KV: import("./kvStore.js").KVNamespace;
  GITHUB_APP_ID: string;
  GITHUB_APP_PRIVATE_KEY: string;
  WEBHOOK_SECRET: string;
  ADMIN_TOKEN?: string;
  CALLBACK_TOKEN?: string;
};

const buildApp = (env: WorkerEnv): App => {
  const appId = env.GITHUB_APP_ID;
  const privateKey = env.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, "\n") ?? "";
  if (!appId || !privateKey) {
    throw new Error("Missing GitHub App credentials.");
  }
  return new App({
    appId: Number(appId),
    privateKey
  });
};

const renderAdminPage = async (env: WorkerEnv): Promise<string> => {
  const installations = await listInstallations(env.KV);
  installations.sort((a, b) => b.installationId - a.installationId);
  const htmlSections = await Promise.all(
    installations.map(async (install) => {
      const repoConfigs = await listRepoConfigsForInstallation(env.KV, install.installationId);
      const configs = repoConfigs
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
  );

  return `<!doctype html>
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
      ${htmlSections.join("")}
    </body>
  </html>`;
};

const handleInstallationEvent = async (env: WorkerEnv, payload: {
  action?: "created" | "deleted";
  installation?: { id?: number; account?: Record<string, unknown> | null };
}): Promise<void> => {
  const installationId = payload.installation?.id;
  if (!installationId) {
    return;
  }
  const account = payload.installation?.account;
  const accountLogin =
    account && "login" in account ? (account.login as string) : account && "name" in account ? (account.name as string) ?? "unknown" : "unknown";
  const accountType = account && "type" in account ? (account.type as string) : "Organization";

  if (payload.action === "deleted") {
    await deleteInstallationData(env.KV, installationId);
    return;
  }

  if (payload.action === "created") {
    const record: InstallationRecord = {
      installationId,
      accountLogin,
      accountType,
      updatedAt: new Date().toISOString()
    };
    await putInstallation(env.KV, record);
  }
};

const handleWebhookEvent = async (env: WorkerEnv, name: string, payload: unknown): Promise<void> => {
  if (name === "installation") {
    await handleInstallationEvent(env, payload as Parameters<typeof handleInstallationEvent>[1]);
    return;
  }
  if (name === "pull_request") {
    const app = buildApp(env);
    const handler = createPullRequestHandler({
      app,
      createOctokit: (token) => new Octokit({ auth: token }),
      createCheckReporter,
      listPullRequestFiles,
      detectRepoTooling,
      dispatchRunnerWorkflow,
      getRunnerConfig: () => getRunnerConfig(env),
      getPlan,
      planPolicy
    });
    await handler({ payload });
  }
};

const router = createRouter<WorkerEnv>();

router.add("GET", "/health", () => jsonResponse({ ok: true }));

router.add("GET", "/admin", async (request, env) => {
  const adminToken = env.ADMIN_TOKEN ?? "";
  const authHeader = request.headers.get("authorization") ?? "";
  if (!adminToken || authHeader !== `Bearer ${adminToken}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const html = await renderAdminPage(env);
  return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
});

const handleWebhookRequest = async (request: Request, env: WorkerEnv, ctx: WorkerExecutionContext): Promise<Response> => {
  const id = request.headers.get("x-github-delivery") ?? "";
  const name = request.headers.get("x-github-event") ?? "";
  const signature = request.headers.get("x-hub-signature-256") ?? "";

  if (!id || !name || !signature) {
    return new Response("Missing webhook headers", { status: 400 });
  }

  const payloadBuffer = await request.arrayBuffer();
  const verified = await verifyWebhookSignature({
    secret: env.WEBHOOK_SECRET ?? "",
    signature,
    payload: payloadBuffer
  });
  if (!verified) {
    return new Response("Webhook verification failed", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(payloadBuffer));
  } catch (error) {
    console.error("Webhook payload parse error", error);
    return new Response("Invalid JSON payload", { status: 400 });
  }

  ctx.waitUntil(
    handleWebhookEvent(env, name, payload).catch((error) => {
      console.error("Webhook handler error", error);
    })
  );

  return new Response("OK", { status: 200 });
};

router.add("POST", "/webhooks", handleWebhookRequest);
router.add("POST", "/", handleWebhookRequest);

router.add("POST", "/callbacks/runner", async (request, env) => {
  const callbackToken = env.CALLBACK_TOKEN ?? "";
  const authHeader = request.headers.get("authorization") ?? "";

  if (!callbackToken || authHeader !== `Bearer ${callbackToken}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const payload = (await request.json()) as {
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
    return new Response("Missing callback payload fields", { status: 400 });
  }

  const checkConclusion = payload.checkConclusion ?? "success";
  const autofixConclusion = payload.autofixConclusion ?? "success";

  try {
    const app = buildApp(env);
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

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("Runner callback error", error);
    return new Response("Callback processing failed", { status: 500 });
  }
});

export default {
  async fetch(request: Request, env: WorkerEnv, ctx: WorkerExecutionContext): Promise<Response> {
    try {
      return await router.handle(request, env, ctx);
    } catch (error) {
      console.error("Unhandled request error", error);
      return new Response("Internal Server Error", { status: 500 });
    }
  }
};
