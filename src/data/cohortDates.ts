import { cohorts, type CohortKey } from "./templates";

const byLabel = {
  "32기(1차)": { start: "2026-02-23", end: "2026-05-01" },
  "33기(2차)": { start: "2026-05-11", end: "2026-07-17" },
  "34기(3차)": { start: "2026-07-27", end: "2026-10-02" },
  "35기(4차)": { start: "2026-10-12", end: "2026-12-18" },
} as const;

// ✅ cohorts의 key(CohortKey) -> 날짜 로 만들어줌
export const cohortDates = cohorts.reduce((acc, c) => {
  const hit = byLabel[c.label as keyof typeof byLabel];
  if (hit) acc[c.key as CohortKey] = hit;
  return acc;
}, {} as Record<CohortKey, { start: string; end: string }>);


