export type KVNamespace = {
  get: (key: string) => Promise<string | null>;
  put: (key: string, value: string) => Promise<void>;
  delete: (key: string) => Promise<void>;
  list: (options?: { prefix?: string; cursor?: string }) => Promise<{ keys: Array<{ name: string }>; cursor?: string }>;
};

export type InstallationRecord = {
  installationId: number;
  accountLogin: string;
  accountType: string;
  updatedAt: string;
};

export type RepoConfigRecord = {
  repoFullName: string;
  configJson: string;
  installationId: number;
  updatedAt: string;
};

const installationKey = (installationId: number): string => `installation:${installationId}`;
const repoConfigKey = (repoFullName: string): string => `repoConfig:${repoFullName}`;
const installationReposKey = (installationId: number): string => `installationRepos:${installationId}`;

const parseJson = <T>(raw: string | null): T | null => {
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    console.error("Failed to parse KV payload", error);
    return null;
  }
};

const listAllKeys = async (kv: KVNamespace, prefix: string): Promise<string[]> => {
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const response = await kv.list({ prefix, cursor });
    keys.push(...response.keys.map((key) => key.name));
    cursor = response.cursor;
  } while (cursor);
  return keys;
};

export const getInstallation = async (kv: KVNamespace, installationId: number): Promise<InstallationRecord | null> =>
  parseJson<InstallationRecord>(await kv.get(installationKey(installationId)));

export const putInstallation = async (kv: KVNamespace, record: InstallationRecord): Promise<void> => {
  await kv.put(installationKey(record.installationId), JSON.stringify(record));
};

export const deleteInstallation = async (kv: KVNamespace, installationId: number): Promise<void> => {
  await kv.delete(installationKey(installationId));
  await kv.delete(installationReposKey(installationId));
};

export const listInstallations = async (kv: KVNamespace): Promise<InstallationRecord[]> => {
  const keys = await listAllKeys(kv, "installation:");
  const records = await Promise.all(keys.map((key) => kv.get(key).then((raw) => parseJson<InstallationRecord>(raw))));
  return records.filter((record): record is InstallationRecord => !!record);
};

export const getRepoConfig = async (kv: KVNamespace, repoFullName: string): Promise<RepoConfigRecord | null> =>
  parseJson<RepoConfigRecord>(await kv.get(repoConfigKey(repoFullName)));

export const putRepoConfig = async (kv: KVNamespace, record: RepoConfigRecord): Promise<void> => {
  await kv.put(repoConfigKey(record.repoFullName), JSON.stringify(record));
  const repos = (await getInstallationRepos(kv, record.installationId)) ?? [];
  if (!repos.includes(record.repoFullName)) {
    repos.push(record.repoFullName);
    await setInstallationRepos(kv, record.installationId, repos);
  }
};

export const deleteRepoConfig = async (kv: KVNamespace, repoFullName: string): Promise<void> => {
  const record = await getRepoConfig(kv, repoFullName);
  if (!record) {
    return;
  }
  await kv.delete(repoConfigKey(repoFullName));
  const repos = (await getInstallationRepos(kv, record.installationId)) ?? [];
  const nextRepos = repos.filter((name) => name !== repoFullName);
  await setInstallationRepos(kv, record.installationId, nextRepos);
};

export const getInstallationRepos = async (kv: KVNamespace, installationId: number): Promise<string[] | null> =>
  parseJson<string[]>(await kv.get(installationReposKey(installationId)));

export const setInstallationRepos = async (kv: KVNamespace, installationId: number, repos: string[]): Promise<void> => {
  await kv.put(installationReposKey(installationId), JSON.stringify(repos));
};

export const listRepoConfigsForInstallation = async (
  kv: KVNamespace,
  installationId: number
): Promise<RepoConfigRecord[]> => {
  const repos = await getInstallationRepos(kv, installationId);
  if (repos && repos.length > 0) {
    const records = await Promise.all(repos.map((repo) => getRepoConfig(kv, repo)));
    return records.filter((record): record is RepoConfigRecord => !!record);
  }

  const keys = await listAllKeys(kv, "repoConfig:");
  const records = await Promise.all(keys.map((key) => kv.get(key).then((raw) => parseJson<RepoConfigRecord>(raw))));
  return records.filter((record): record is RepoConfigRecord => !!record && record.installationId === installationId);
};

export const deleteInstallationData = async (kv: KVNamespace, installationId: number): Promise<void> => {
  const repoConfigs = await listRepoConfigsForInstallation(kv, installationId);
  await Promise.all(repoConfigs.map((config) => kv.delete(repoConfigKey(config.repoFullName))));
  await deleteInstallation(kv, installationId);
};
