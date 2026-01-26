import fs from "fs";

const YEARS = [2025, 2026, 2027, 2028];
const SERVICE_KEY = process.env.DATA_GO_KR_SERVICE_KEY;

if (!SERVICE_KEY) {
  console.error("❌ DATA_GO_KR_SERVICE_KEY 환경변수가 없습니다.");
  process.exit(1);
}

function ymdFromInt(v) {
  const s = String(v); // YYYYMMDD
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

async function fetchYear(year) {
  const url =
    "https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo" +
    `?serviceKey=${encodeURIComponent(SERVICE_KEY)}` +
    `&solYear=${year}` +
    `&numOfRows=100` +
    `&pageNo=1` +
    `&_type=json`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`${year} API 호출 실패: ${res.status}`);

  const json = await res.json();
  const items = json?.response?.body?.items?.item ?? [];
  const list = Array.isArray(items) ? items : [items];

  const holidays = list.map((it) => ({
    date: ymdFromInt(it.locdate),
    name: it.dateName,
    substitute: String(it.dateName).includes("대체"),
  }));

  // 날짜순 정렬 + 중복 제거(혹시 몰라서)
  const uniq = Array.from(new Map(holidays.map(h => [`${h.date}|${h.name}`, h])).values())
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  return uniq;
}

async function run() {
  for (const year of YEARS) {
    const data = await fetchYear(year);
    const out = `public/holidays-${year}.json`;
    fs.writeFileSync(out, JSON.stringify(data, null, 2), "utf-8");
    console.log(`✅ ${out} 생성 완료 (${data.length}개)`);
  }
  console.log("🎉 전체 완료");
}

run().catch((e) => {
  console.error("❌ 실패:", e);
  process.exit(1);
});
