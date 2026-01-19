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

export const taskTemplates: TaskTemplate[] = [
  { key: "promo_instagram", title: "인스타그램 홍보 게시", offsetDays: -42, anchor: "pythonStart" },
  { key: "entrants_info", title: "입과자 정보 정리", offsetDays: -21, anchor: "pythonStart" },
  { key: "vendor_register", title: "거래처 등록", offsetDays: -21, anchor: "pythonStart" },
  { key: "platform_register", title: "러닝플랫폼 등록", offsetDays: -21, anchor: "pythonStart" },
  { key: "dorm_assign", title: "국제관 방배정", offsetDays: -14, anchor: "pythonStart" },
  { key: "entrance_video", title: "입과식 영상 제작", offsetDays: -14, anchor: "pythonStart" },
  { key: "snack_order", title: "다과 주문", offsetDays: -4, anchor: "pythonStart" },

  // ✅ 수료식(= aiEnd) 기준 예시
  { key: "graduation_prep", title: "수료식 진행 준비", offsetDays: -14, anchor: "aiEnd" },
  { key: "certificate_prep", title: "수료증 준비", offsetDays: -1, anchor: "aiEnd" },
];


