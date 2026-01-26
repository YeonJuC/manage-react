export type KRHoliday = {
  date: string; // YYYY-MM-DD
  name: string;
  substitute: boolean;
  type?: string;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function ymdFromYmdInt(ymd: number | string) {
  const s = String(ymd); // YYYYMMDD
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

/**
 * data.go.kr 공휴일(특일) API 기반
 * - 대체공휴일 포함
 * - 정확도가 가장 높음
 * - 연도별로 localStorage 캐싱
 */
export async function getKoreanHolidays(year: number): Promise<KRHoliday[]> {
  const cacheKey = `kr-holidays:${year}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached) as KRHoliday[];
    } catch {
      // ignore
    }
  }
  
  const serviceKey = import.meta.env.VITE_DATA_GO_KR_SERVICE_KEY as string | undefined;
  if (!serviceKey) {
    throw new Error("VITE_DATA_GO_KR_SERVICE_KEY가 없습니다. .env에 공공데이터포털 서비스키를 넣어주세요.");
  }

  // ✅ 공공데이터포털 특일정보(공휴일) API
  // (URL은 코드 안에만 넣음)
  const url =
    "/api/holiday/B090041/openapi/service/SpcdeInfoService/getRestDeInfo" +
    `?serviceKey=${serviceKey}` +
    `&solYear=${year}` +
    `&numOfRows=100` +
    `&pageNo=1` +
    `&_type=json`;


  const res = await fetch(url);
  if (!res.ok) throw new Error(`공휴일 API 호출 실패: ${res.status}`);

  const json = await res.json();

  const items = json?.response?.body?.items?.item;
  const list = (Array.isArray(items) ? items : items ? [items] : []) as any[];

  const holidays: KRHoliday[] = list.map((it) => {
    const date = ymdFromYmdInt(it.locdate); // YYYYMMDD -> YYYY-MM-DD
    const name = String(it.dateName ?? "");
    // API에서 대체공휴일은 보통 이름에 "대체공휴일"이 들어감
    const substitute = name.includes("대체");
    return { date, name, substitute };
  });

  // 날짜 중복 제거(혹시 모를 케이스)
  const uniq = Array.from(
    new Map(holidays.map((h) => [`${h.date}|${h.name}`, h])).values()
  ).sort((a, b) => (a.date < b.date ? -1 : 1));

  localStorage.setItem(cacheKey, JSON.stringify(uniq));
  return uniq;
}
