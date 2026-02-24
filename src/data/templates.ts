export type CohortKey = "32" | "33" | "34" | "35";

export type AnchorKey = "pythonStart" | "bigdataStart" | "aiStart" | "aiEnd";

export type TaskTemplate = {
  key: string;
  title: string;
  offsetDays: number;
  anchor: AnchorKey;
  defaultAssignee?: string;
};

export const cohorts: { key: CohortKey; label: string }[] = [
  { key: "32", label: "32기(1차)" },
  { key: "33", label: "33기(2차)" },
  { key: "34", label: "34기(3차)" },
  { key: "35", label: "35기(4차)" },
];

