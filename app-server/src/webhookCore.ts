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
      account && "login" in account ? (account.login as string) : account && "name" in account ? (account.name as string) ?? "unknown" : "unknown";
    const accountType = account && "type" in account ? (account.type as string) : "Organization";
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
    await handler(payload as InstallationPayload);
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

const toUint8Array = (payload: ArrayBuffer | Uint8Array | string): Uint8Array => {
  if (payload instanceof Uint8Array) {
    return payload;
  }
  if (typeof payload === "string") {
    return new TextEncoder().encode(payload);
  }
  return new Uint8Array(payload);
};

const hexToBytes = (hex: string): Uint8Array => {
  const normalized = hex.trim().toLowerCase();
  const bytes = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(normalized.substr(i * 2, 2), 16);
  }
  return bytes;
};

const timingSafeEqual = (left: Uint8Array, right: Uint8Array): boolean => {
  if (left.length !== right.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < left.length; i += 1) {
    result |= left[i] ^ right[i];
  }
  return result === 0;
};

export const verifyWebhookSignature = async ({
  payload,
  signatureHeader,
  secret
}: {
  payload: ArrayBuffer | Uint8Array | string;
  signatureHeader?: string | null;
  secret: string;
}): Promise<boolean> => {
  if (!signatureHeader) {
    return false;
  }
  const [prefix, signatureHex] = signatureHeader.split("=");
  if (prefix !== "sha256" || !signatureHex) {
    return false;
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signed = await crypto.subtle.sign("HMAC", key, toUint8Array(payload));
  const expected = new Uint8Array(signed);
  const actual = hexToBytes(signatureHex);
  return timingSafeEqual(expected, actual);
};
