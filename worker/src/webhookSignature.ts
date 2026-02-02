const hexToBytes = (hex: string): Uint8Array => {
  const normalized = hex.trim().toLowerCase();
  const bytes = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
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

  const payloadBytes =
    typeof payload === "string" ? new TextEncoder().encode(payload) : payload instanceof Uint8Array ? payload : new Uint8Array(payload);
  const signatureBytes = hexToBytes(signatureHex);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  return crypto.subtle.verify("HMAC", key, signatureBytes, payloadBytes);
};
