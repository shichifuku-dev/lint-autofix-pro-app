type Logger = Pick<typeof console, "log" | "warn" | "error">;

type InstallationPayload = {
  action: "created" | "deleted";
  installation?: { id: number; account?: Record<string, unknown> | null };
};

export type InstallationStore = {
  deleteInstallation: (installationId: number) => Promise<void>;
  upsertInstallation: (params: { installationId: number; accountLogin: string; accountType: string }) => Promise<void>;
};

export const handleInstallationEvent = async ({
  payload,
  store,
  logger = console
}: {
  payload: InstallationPayload;
  store?: InstallationStore;
  logger?: Logger;
}): Promise<void> => {
  const installationId = payload.installation?.id;
  if (!installationId) {
    return;
  }

  if (!store) {
    logger.warn("Installation event received without storage handler", { installationId });
    return;
  }

  if (payload.action === "deleted") {
    await store.deleteInstallation(installationId);
    return;
  }

  if (payload.action === "created") {
    const account = payload.installation?.account;
    const accountLogin =
      account && typeof account === "object" && "login" in account && typeof account.login === "string"
        ? account.login
        : account && typeof account === "object" && "name" in account && typeof account.name === "string"
          ? account.name
          : "unknown";
    const accountType =
      account && typeof account === "object" && "type" in account && typeof account.type === "string"
        ? account.type
        : "Organization";
    await store.upsertInstallation({
      installationId,
      accountLogin,
      accountType
    });
  }
};

export type WebhookHandlers = {
  installation?: (payload: InstallationPayload) => Promise<void>;
  pull_request?: (payload: unknown) => Promise<void>;
};

const isInstallationPayload = (value: unknown): value is InstallationPayload =>
  !!value && typeof value === "object" && "action" in value;

export const handleWebhookEvent = async ({
  name,
  payload,
  handlers,
  logger = console,
  deliveryId
}: {
  name: string;
  payload: unknown;
  handlers: WebhookHandlers;
  logger?: Logger;
  deliveryId?: string | null;
}): Promise<void> => {
  logger.log("Webhook received", { event: name, deliveryId: deliveryId ?? undefined });

  if (name === "installation") {
    const handler = handlers.installation;
    if (!handler) {
      return;
    }
    if (isInstallationPayload(payload)) {
      await handler(payload);
    } else {
      logger.warn("Invalid installation payload", { event: name, deliveryId: deliveryId ?? undefined });
    }
    return;
  }

  if (name === "pull_request") {
    const handler = handlers.pull_request;
    if (!handler) {
      return;
    }
    await handler(payload);
  }
};
