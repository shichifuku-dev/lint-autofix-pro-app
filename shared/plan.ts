export type Plan = "free";

export type PlanPolicy = {
  dispatchTarget: "free";
  priority: number;
  maxRuntimeSec: number;
  allowFixCommit: boolean;
};

export const getPlan = (_installationId: number, _repoFullName: string): Plan => "free";

export const planPolicy = (_plan: Plan): PlanPolicy => ({
  dispatchTarget: "free",
  priority: 10,
  maxRuntimeSec: 900,
  allowFixCommit: true
});
