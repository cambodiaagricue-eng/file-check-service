export const STAGES = ["basic", "technical", "agri_business"] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_ORDER: Record<Stage, number> = {
  basic: 0,
  technical: 1,
  agri_business: 2,
};

export const STAGE_LABELS: Record<Stage, string> = {
  basic: "Basic",
  technical: "Technical",
  agri_business: "Agri-Business",
};

export function prerequisiteStage(stage: Stage): Stage | null {
  if (stage === "basic") return null;
  if (stage === "technical") return "basic";
  return "technical";
}
