import type { CohortKey, AnchorKey } from "./templates";

export type CohortSchedule = Record<AnchorKey, string>;

export const schedules: Record<CohortKey, CohortSchedule> = {
  "32": { pythonStart:"2026-02-23", bigdataStart:"2026-03-02", aiStart:"2026-03-30", aiEnd:"2026-05-01" },
  "33": { pythonStart:"2026-05-11", bigdataStart:"2026-05-18", aiStart:"2026-06-15", aiEnd:"2026-07-17" },
  "34": { pythonStart:"2026-07-27", bigdataStart:"2026-08-03", aiStart:"2026-08-31", aiEnd:"2026-10-02" },
  "35": { pythonStart:"2026-10-12", bigdataStart:"2026-10-19", aiStart:"2026-11-16", aiEnd:"2026-12-18" },
};
