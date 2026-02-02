import crypto from "node:crypto";

const hexToBuffer = (hex: string): Buffer => Buffer.from(hex, "hex");

export const verifyWebhookSignature = ({
  payload,
  signatureHeader,
  secret
}: {
  payload: Buffer | string | Uint8Array;
  signatureHeader?: string | null;
  secret: string;
}): boolean => {
  if (!signatureHeader) {
    return false;
  }
  const [prefix, signatureHex] = signatureHeader.split("=");
  if (prefix !== "sha256" || !signatureHex) {
    return false;
  }
  const payloadBuffer = typeof payload === "string" ? Buffer.from(payload, "utf8") : Buffer.from(payload);
  const digest = crypto.createHmac("sha256", secret).update(payloadBuffer).digest("hex");
  const expected = Buffer.from(digest, "hex");
  const actual = hexToBuffer(signatureHex);
  if (expected.length !== actual.length) {
    return false;
  }
  return crypto.timingSafeEqual(expected, actual);
};
