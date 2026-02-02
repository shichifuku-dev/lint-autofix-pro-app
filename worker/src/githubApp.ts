const base64UrlEncode = (input: ArrayBuffer | Uint8Array | string): string => {
  let bytes: Uint8Array;
  if (typeof input === "string") {
    bytes = new TextEncoder().encode(input);
  } else if (input instanceof Uint8Array) {
    bytes = input;
  } else {
    bytes = new Uint8Array(input);
  }
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const decodeBase64 = (value: string): string => atob(value);

const importPrivateKey = async (pem: string): Promise<CryptoKey> => {
  const stripped = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const binary = decodeBase64(stripped);
  const bytes = new Uint8Array([...binary].map((char) => char.charCodeAt(0)));
  return crypto.subtle.importKey(
    "pkcs8",
    bytes.buffer,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  );
};

export const createAppJwt = async ({
  appId,
  privateKeyPem
}: {
  appId: string;
  privateKeyPem: string;
}): Promise<string> => {
  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64UrlEncode(
    JSON.stringify({
      iat: now - 60,
      exp: now + 9 * 60,
      iss: appId
    })
  );
  const message = `${header}.${payload}`;
  const key = await importPrivateKey(privateKeyPem);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(message));
  return `${message}.${base64UrlEncode(signature)}`;
};

export const getInstallationToken = async ({
  appId,
  privateKeyBase64,
  installationId
}: {
  appId: string;
  privateKeyBase64: string;
  installationId: number;
}): Promise<string> => {
  const privateKeyPem = decodeBase64(privateKeyBase64).replace(/\\n/g, "\n");
  const jwt = await createAppJwt({ appId, privateKeyPem });
  const response = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "lint-autofix-pro-worker",
      "X-GitHub-Api-Version": "2022-11-28"
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to create installation token (${response.status}): ${text}`);
  }

  const data = (await response.json()) as { token?: string };
  if (!data.token) {
    throw new Error("Missing installation token in GitHub response");
  }
  return data.token;
};
