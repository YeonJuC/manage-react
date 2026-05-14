export const excelTaskTemplates = [
  { key: "a5571ca09c6d", title: "교육일정(시간표) 계획 수립", offsetDays: -28, defaultAssignee: "", anchor: "pythonStart" },
  { key: "cc1f8bde90d0", title: "대한상의 교육일정(시간표) 전달", offsetDays: -21, defaultAssignee: "신나라선생", anchor: "pythonStart" },
  { key: "91e5a03a4340", title: "교재 준비(총 7권)", offsetDays: -28, defaultAssignee: "", anchor: "pythonStart" },
  { key: "0564ecab1164", title: "교재 보완 및 수정", offsetDays: -14, defaultAssignee: "",anchor: "pythonStart" },
  { key: "9541b3991460", title: "교재 제본 의뢰", offsetDays: -10, defaultAssignee: "", anchor: "pythonStart" },
  { key: "716626585ae8", title: "교재 수령", offsetDays: -3, defaultAssignee: "", anchor: "pythonStart" },
  { key: "8c0d22e7cddd", title: "교육 입과 안내 오리엔테이션", offsetDays: -3, defaultAssignee: "" , anchor: "pythonStart"},
  { key: "507c2e81d603", title: "룸메이트 배정", offsetDays: -3, defaultAssignee: "", anchor: "pythonStart" },
  { key: "2602f4975820", title: "국제관 방배정 요청", offsetDays: -3, defaultAssignee: "김경수팀장", anchor: "pythonStart" },
  { key: "ee04c1c6e821", title: "포스텍식당 식사인원 명단 전달", offsetDays: -3, defaultAssignee: "박미향영양사", anchor: "pythonStart" },
  { key: "6ffe7fd65d61", title: "교육장 확인", offsetDays: -3, defaultAssignee: "", anchor: "pythonStart" },
  { key: "6d7140baf89c", title: "입과식 계획 준비", offsetDays: -21, defaultAssignee: "송지원선생", anchor: "pythonStart" },
  { key: "17976d42bda4", title: "교육 입과 안내 오리엔테이션", offsetDays: -3, defaultAssignee: "", anchor: "pythonStart" },
  { key: "61db463a9d2c", title: "입과 안내메일 발송", offsetDays: -3, defaultAssignee: "", anchor: "pythonStart" },
  { key: "7e9d42d6339b", title: "교육입과 오리엔테이션", offsetDays: 0, defaultAssignee: "", anchor: "pythonStart" },
  { key: "97813fea63d6", title: "공결신청(양식) 메일링", offsetDays: 1, defaultAssignee: "", anchor: "pythonStart" },
  { key: "2ce94d1af24d", title: "입과식 준비 및 진행", offsetDays: 0, defaultAssignee: "", anchor: "pythonStart" },
  { key: "337ee36d0d30", title: "현수막 제작", offsetDays: -3, defaultAssignee: "", anchor: "pythonStart" },
  { key: "aa33b775ffd2", title: "후배에게 전하는 영상 준비", offsetDays: -7, defaultAssignee: "", anchor: "pythonStart" },
  { key: "b9cb702feda0", title: "입과식 진행자료 준비", offsetDays: -3, defaultAssignee: "", anchor: "pythonStart" },

  { key: "aa18344ca9f1", title: "수료증 준비", offsetDays: -1, defaultAssignee: "", anchor: "aiEnd" },
  { key: "28d57fcede47", title: "상장 준비", offsetDays: -1, defaultAssignee: "", anchor: "aiEnd" },
  { key: "8bb2ec00d463", title: "시상품 준비", offsetDays: -14, defaultAssignee: "", anchor: "aiEnd" },
  { key: "f341cf00c32e", title: "시상품 입고 및 전달", offsetDays: -1, defaultAssignee: "송지원선생", anchor: "aiEnd" },
  { key: "478c255bcd5e", title: "수료식 진행 준비", offsetDays: -14, defaultAssignee: "송지원선생", anchor: "aiEnd" },

  { key: "214c4dfeaad0", title: "영어성적 확인", offsetDays: -14, defaultAssignee: "", anchor: "aiEnd" },
  { key: "820c2833af6c", title: "교육일정(시간)표 송부", offsetDays: -28, defaultAssignee: "신나라선생", anchor: "pythonStart" },
] as const;

export type ExcelTaskTemplate = (typeof excelTaskTemplates)[number];
