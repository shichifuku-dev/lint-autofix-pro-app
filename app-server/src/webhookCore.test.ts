import { describe, expect, it } from "vitest";
import { verifyWebhookSignature } from "./webhookCore.js";

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

describe("verifyWebhookSignature", () => {
  it("verifies a valid signature", async () => {
    const payload = "hello world";
    const secret = "super-secret";
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
    const signature = `sha256=${toHex(new Uint8Array(mac))}`;

    const verified = await verifyWebhookSignature({
      payload,
      signatureHeader: signature,
      secret
    });

    expect(verified).toBe(true);
  });

  it("rejects an invalid signature", async () => {
    const verified = await verifyWebhookSignature({
      payload: "payload",
      signatureHeader: "sha256=deadbeef",
      secret: "secret"
    });

    expect(verified).toBe(false);
  });
});
