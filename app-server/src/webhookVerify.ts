const textEncoder = new TextEncoder();

const toHex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

const timingSafeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) {
    return false;
  }
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return mismatch === 0;
};

export const verifyWebhookSignature = async ({
  secret,
  signature,
  payload
}: {
  secret: string;
  signature: string;
  payload: ArrayBuffer;
}): Promise<boolean> => {
  if (!secret) {
    return false;
  }
  const prefix = "sha256=";
  if (!signature.startsWith(prefix)) {
    return false;
  }

  const key = await crypto.subtle.importKey("raw", textEncoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign"
  ]);
  const mac = await crypto.subtle.sign("HMAC", key, payload);
  const expected = toHex(mac);
  const provided = signature.slice(prefix.length).toLowerCase();

  return timingSafeEqual(expected, provided);
};
