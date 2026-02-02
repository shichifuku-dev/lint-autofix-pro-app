export type Plan = "free";

export type PlanPolicy = {
  dispatchTarget: "free";
  priority: number;
  maxRuntimeSec: number;
  allowFixCommit: boolean;
};

export const getPlan = (_installationId: number, _repoFullName: string): Plan => "free";

export const planPolicy = (plan: Plan): PlanPolicy => {
  if (plan !== "free") {
    return {
      dispatchTarget: "free",
      priority: 10,
      maxRuntimeSec: 900,
      allowFixCommit: true
    };
  }
  return {
    dispatchTarget: "free",
    priority: 10,
    maxRuntimeSec: 900,
    allowFixCommit: true
  };
};
