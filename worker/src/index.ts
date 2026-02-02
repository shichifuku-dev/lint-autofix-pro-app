import { createCheckReporter } from "../../shared/checkReporter.js";
import { createPullRequestHandler } from "../../shared/pullRequestHandler.js";
import { dispatchRunnerWorkflow } from "../../shared/runnerDispatch.js";
import { getPlan, planPolicy } from "../../shared/plan.js";
import { handleWebhookEvent } from "../../shared/webhookCore.js";
import { createWorkerGitHubClient } from "./githubClient.js";
import { detectRepoTooling, isSupportedFile, listPullRequestFiles } from "./repoInspector.js";
import { getInstallationToken } from "./githubApp.js";
import { verifyWebhookSignature } from "./webhookSignature.js";

type Env = {
  GITHUB_APP_ID: string;
  GITHUB_APP_PRIVATE_KEY: string;
  WEBHOOK_SECRET: string;
  RUNNER_OWNER?: string;
  RUNNER_REPO?: string;
  RUNNER_WORKFLOW?: string;
  RUNNER_CALLBACK_TOKEN?: string;
  PUBLIC_APP_URL?: string;
};

const getRunnerConfig = (env: Env) => {
  const owner = env.RUNNER_OWNER ?? "shichifuku-dev";
  const repo = env.RUNNER_REPO ?? "lint-autofix-pro-runner";
  const workflow = env.RUNNER_WORKFLOW ?? "run.yml";
  const callbackToken = env.RUNNER_CALLBACK_TOKEN ?? "";
  const publicAppUrl = env.PUBLIC_APP_URL ?? "";
  const callbackUrl = publicAppUrl ? new URL("/callbacks/runner", publicAppUrl).toString() : "";

  return {
    owner,
    repo,
    workflow,
    callbackToken,
    callbackUrl
  };
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json({ ok: true });
    }
    if (url.pathname !== "/") {
      return new Response("Not Found", { status: 404 });
    }
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const deliveryId = request.headers.get("X-GitHub-Delivery");
    const name = request.headers.get("X-GitHub-Event");
    const signature = request.headers.get("X-Hub-Signature-256");

    if (!deliveryId || !name || !signature) {
      return new Response("Missing webhook headers", { status: 400 });
    }

    const payloadBuffer = await request.arrayBuffer();
    const verified = await verifyWebhookSignature({
      payload: payloadBuffer,
      signatureHeader: signature,
      secret: env.WEBHOOK_SECRET
    });
    if (!verified) {
      console.error("Webhook verification failed", { deliveryId, event: name });
      return new Response("Webhook verification failed", { status: 401 });
    }

    const payloadText = new TextDecoder().decode(payloadBuffer);
    const handlerPromise = (async () => {
      let parsedPayload: unknown;
      try {
        parsedPayload = JSON.parse(payloadText);
      } catch (error) {
        console.error("Webhook payload parse error", error);
        return;
      }

      const pullRequestHandler = createPullRequestHandler({
        getInstallationToken: (installationId) =>
          getInstallationToken({
            appId: env.GITHUB_APP_ID,
            privateKey: env.GITHUB_APP_PRIVATE_KEY,
            installationId
          }),
        createOctokit: (token) => createWorkerGitHubClient(token),
        createCheckReporter,
        listPullRequestFiles,
        detectRepoTooling,
        isSupportedFile,
        dispatchRunnerWorkflow,
        getRunnerConfig: () => getRunnerConfig(env),
        getPlan,
        planPolicy
      });

      await handleWebhookEvent({
        name,
        payload: parsedPayload,
        handlers: {
          pull_request: (payload) => pullRequestHandler({ payload })
        },
        deliveryId
      });
    })();

    ctx.waitUntil(handlerPromise);
    return new Response("OK", { status: 200 });
  }
};
