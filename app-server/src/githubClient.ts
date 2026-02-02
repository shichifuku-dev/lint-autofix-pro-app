export type OctokitLike = {
  checks: {
    listForRef: (params: {
      owner: string;
      repo: string;
      ref: string;
      per_page?: number;
    }) => Promise<{ data: { check_runs?: Array<{ name?: string; id?: number }> } }>;
    create: (params: Record<string, unknown>) => Promise<{ data: { id: number } }>;
    update: (params: Record<string, unknown>) => Promise<void>;
  };
  rest: {
    repos: {
      createCommitStatus: (params: Record<string, unknown>) => Promise<void>;
      getContent: (params: Record<string, unknown>) => Promise<{ data: unknown }>;
    };
    pulls: {
      listFiles: (params: Record<string, unknown>) => Promise<{ data: Array<{ filename: string }> }>;
    };
  };
  actions: {
    createWorkflowDispatch: (params: Record<string, unknown>) => Promise<void>;
  };
  paginate: <T>(method: (params: Record<string, unknown>) => Promise<{ data: T[] }>, params: Record<string, unknown>) => Promise<T[]>;
};
