import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyWebhookSignature } from "./webhookSignature.js";

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

describe("verifyWebhookSignature", () => {
  it("verifies a valid signature", () => {
    const payload = "hello world";
    const secret = "super-secret";
    const signature = `sha256=${toHex(
      new Uint8Array(
        crypto
          .createHmac("sha256", secret)
          .update(payload)
          .digest()
      )
    )}`;

    const verified = verifyWebhookSignature({
      payload,
      signatureHeader: signature,
      secret
    });

    expect(verified).toBe(true);
  });

  it("rejects an invalid signature", () => {
    const verified = verifyWebhookSignature({
      payload: "payload",
      signatureHeader: "sha256=deadbeef",
      secret: "secret"
    });

    expect(verified).toBe(false);
  });
});
