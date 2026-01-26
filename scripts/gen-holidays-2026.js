import fs from "fs";

const YEAR = 2026;

// 🔐 여기서 API 키를 환경변수로 받음
const SERVICE_KEY = process.env.DATA_GO_KR_SERVICE_KEY;

if (!SERVICE_KEY) {
  console.error("❌ DATA_GO_KR_SERVICE_KEY 환경변수가 없습니다.");
  process.exit(1);
}

function ymdFromInt(v) {
  const s = String(v); // YYYYMMDD
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

async function run() {
  const url =
    "https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo" +
    `?serviceKey=${encodeURIComponent(SERVICE_KEY)}` +
    `&solYear=${YEAR}` +
    `&numOfRows=100` +
    `&pageNo=1` +
    `&_type=json`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`API 호출 실패: ${res.status}`);
  }

  const json = await res.json();
  const items = json?.response?.body?.items?.item ?? [];
  const list = Array.isArray(items) ? items : [items];

  const holidays = list.map((it) => ({
    date: ymdFromInt(it.locdate),
    name: it.dateName,
    substitute: String(it.dateName).includes("대체"),
  }));

  fs.writeFileSync(
    `public/holidays-${YEAR}.json`,
    JSON.stringify(holidays, null, 2),
    "utf-8"
  );

  console.log(`✅ public/holidays-${YEAR}.json 생성 완료`);
}

run();
