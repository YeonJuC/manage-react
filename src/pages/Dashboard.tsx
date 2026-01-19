import { useEffect, useMemo, useState } from "react";
import { loadCohort, loadTasks, type Task, type Phase } from "../store/tasks";
import { useNavigate } from "react-router-dom";
import { auth } from "../firebase"; // ✅ 추가

const phaseLabel: Record<Phase, string> = {
  pre: "사전",
  during: "교육 중",
  post: "사후",
};

function ymd(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function startOfWeekMonday(d: Date) {
  const copy = new Date(d);
  const day = copy.getDay();
  const diff = (day + 6) % 7;
  copy.setDate(copy.getDate() - diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(d: Date, n: number) {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

export default function Dashboard() {
  const [cohort, setCohort] = useState<string>("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const navigate = useNavigate();

  const uid = auth.currentUser?.uid; // ✅ 추가

  const goCalendar = (ymd: string) => {
    navigate(`/calendar?date=${ymd}`);
  };

  // ✅ Firestore에서 로드 (async)
  useEffect(() => {
    if (!uid) return;

    (async () => {
      const c = await loadCohort(uid);
      const t = await loadTasks(uid);
      if (c) setCohort(c);
      setTasks(t);
    })();
  }, [uid]);

  const todayYmd = useMemo(() => ymd(new Date()), []);
  const weekStart = useMemo(() => startOfWeekMonday(new Date()), []);
  const weekEnd = useMemo(() => ymd(addDays(weekStart, 6)), [weekStart]);
  const weekStartYmd = useMemo(() => ymd(weekStart), [weekStart]);

  const cohortTasks = useMemo(() => {
    if (!cohort) return [];
    return tasks.filter((t) => t.cohort === cohort);
  }, [tasks, cohort]);

  const totalCount = cohortTasks.length;
  const doneCount = useMemo(
    () => cohortTasks.reduce((acc, t) => acc + (t.done ? 1 : 0), 0),
    [cohortTasks]
  );

  const progressPct = useMemo(() => {
    if (totalCount === 0) return 0;
    return Math.round((doneCount / totalCount) * 100);
  }, [doneCount, totalCount]);

  const todayTasks = useMemo(() => {
    return cohortTasks
      .filter((t) => t.dueDate === todayYmd)
      .sort((a, b) => (a.done === b.done ? 0 : a.done ? 1 : -1));
  }, [cohortTasks, todayYmd]);

  const overdueTasks = useMemo(() => {
    return cohortTasks
      .filter((t) => !t.done && t.dueDate < todayYmd)
      .sort((a, b) => (a.dueDate > b.dueDate ? 1 : -1));
  }, [cohortTasks, todayYmd]);

  const weekTasks = useMemo(() => {
    return cohortTasks
      .filter((t) => t.dueDate >= weekStartYmd && t.dueDate <= weekEnd)
      .sort((a, b) => (a.dueDate > b.dueDate ? 1 : -1));
  }, [cohortTasks, weekStartYmd, weekEnd]);

  const weekDone = useMemo(
    () => weekTasks.reduce((acc, t) => acc + (t.done ? 1 : 0), 0),
    [weekTasks]
  );

  const upcoming = useMemo(() => {
    return cohortTasks
      .filter((t) => !t.done && t.dueDate > todayYmd)
      .sort((a, b) => (a.dueDate > b.dueDate ? 1 : -1))
      .slice(0, 5);
  }, [cohortTasks, todayYmd]);

  const phaseSummary = useMemo(() => {
    const by: Record<Phase, { total: number; done: number }> = {
      pre: { total: 0, done: 0 },
      during: { total: 0, done: 0 },
      post: { total: 0, done: 0 },
    };
    for (const t of cohortTasks) {
      by[t.phase].total += 1;
      if (t.done) by[t.phase].done += 1;
    }
    return by;
  }, [cohortTasks]);

  // ✅ 로그인 없으면 안내
  if (!uid) {
    return (
      <div className="card" style={{ padding: 16 }}>
        로그인이 필요합니다. (구글 로그인 후 데이터가 동기화됩니다)
      </div>
    );
  }

  return (
    <div>
      <h1>대시보드</h1>
      <p style={{ color: "var(--muted)", marginTop: 6 }}>
        {cohort ? `현재 선택: ${cohort}` : "차수를 선택하면 요약이 표시됩니다."}
      </p>

      {!cohort && (
        <div className="card" style={{ marginTop: 12 }}>
          차수를 먼저 선택해줘. (할 일/캘린더에서 선택하면 여기에도 반영됨)
        </div>
      )}

      {cohort && (
        <>
          {/* 상단 핵심 4개 */}
          <div
            style={{
              marginTop: 12,
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: 12,
            }}
          >
            <div className="card" style={{ cursor: "pointer" }} onClick={() => goCalendar(todayYmd)}>
              <div style={{ fontWeight: 800 }}>오늘</div>
              <div style={{ color: "var(--muted)", marginTop: 6 }}>
                할 일 {todayTasks.filter((t) => !t.done).length}건 / 완료{" "}
                {todayTasks.filter((t) => t.done).length}건
              </div>
            </div>

            <div className="card" style={{ cursor: "pointer" }}
              onClick={() => {
                // 지연이 있으면 가장 오래된 지연 날짜로, 없으면 오늘로
                const target = overdueTasks[0]?.dueDate ?? todayYmd;
                goCalendar(target);
              }}>
              <div style={{ fontWeight: 800 }}>지연 ⚠️</div>
              <div style={{ color: overdueTasks.length ? "#ef4444" : "var(--muted)", marginTop: 6 }}>
                {overdueTasks.length}건
              </div>
            </div>

            <div className="card" style={{ cursor: "pointer" }}
              onClick={() => {
                // 이번주는 주 시작일로 이동 (원하면 가장 가까운 weekTasks[0]?.dueDate로 바꿔도 됨)
                goCalendar(weekStartYmd);
              }}>
              <div style={{ fontWeight: 800 }}>이번 주</div>
              <div style={{ color: "var(--muted)", marginTop: 6 }}>
                완료 {weekDone} / {weekTasks.length}
              </div>
              <div className="progress" style={{ marginTop: 10 }}>
                <div
                  className="progress__bar"
                  style={{
                    width: weekTasks.length === 0 ? "0%" : `${Math.round((weekDone / weekTasks.length) * 100)}%`,
                  }}
                />
              </div>
            </div>

            <div className="card">
              <div style={{ fontWeight: 800 }}>차수 전체 진행률</div>
              <div style={{ color: "var(--muted)", marginTop: 6 }}>
                완료 {doneCount} / {totalCount} ({progressPct}%)
              </div>
              <div className="progress" style={{ marginTop: 10 }}>
                <div className="progress__bar" style={{ width: `${progressPct}%` }} />
              </div>
            </div>
          </div>

          {/* 하단 2열: 지연/다가오는 일정 + phase */}
          <div
            style={{
              marginTop: 12,
              display: "grid",
              gridTemplateColumns: "1.3fr 0.7fr",
              gap: 12,
              alignItems: "start",
            }}
          >
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontWeight: 800 }}>우선 처리</div>
                <div style={{ color: "var(--muted)", fontSize: 12 }}>
                  지연 → 오늘 → 다가오는 일정
                </div>
              </div>

              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>지연된 할 일</div>
                  {overdueTasks.length === 0 ? (
                    <div style={{ color: "var(--muted)" }}>없음</div>
                  ) : (
                    <div className="dash-list">
                      {overdueTasks.slice(0, 5).map((t) => (
                        <div
                          key={t.id}
                          className="dash-item"
                          style={{ cursor: "pointer" }}
                          onClick={() => goCalendar(t.dueDate)}
                        >
                          <span className="dash-badge">⚠️ {phaseLabel[t.phase]}</span>
                          <span className="dash-title">{t.title}</span>
                          <span className="dash-date">{t.dueDate}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>다가오는 일정</div>
                  {upcoming.length === 0 ? (
                    <div style={{ color: "var(--muted)" }}>없음</div>
                  ) : (
                    <div className="dash-list">
                      {upcoming.map((t) => (
                        <div
                          key={t.id}
                          className="dash-item"
                          style={{ cursor: "pointer" }}
                          onClick={() => goCalendar(t.dueDate)}
                        >
                          <span className="dash-badge">{phaseLabel[t.phase]}</span>
                          <span className="dash-title">{t.title}</span>
                          <span className="dash-date">{t.dueDate}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="card">
              <div style={{ fontWeight: 800 }}>Phase 요약</div>
              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                {(["pre", "during", "post"] as Phase[]).map((p) => {
                  const s = phaseSummary[p];
                  const pct = s.total === 0 ? 0 : Math.round((s.done / s.total) * 100);
                  const done = s.total > 0 && s.done === s.total;
                  return (
                    <div key={p} className="phase-row">
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ fontWeight: 700 }}>
                          {phaseLabel[p]}{" "}
                          <span style={{ color: "var(--muted)", fontSize: 12 }}>
                            {s.done}/{s.total}
                          </span>
                        </div>
                        <span
                          style={{
                            fontSize: 12,
                            padding: "6px 10px",
                            borderRadius: 999,
                            border: "1px solid var(--border)",
                            background: done ? "rgba(34,197,94,0.12)" : "rgba(59,130,246,0.08)",
                          }}
                        >
                          {s.total === 0 ? "없음" : done ? "완료" : "진행 중"}
                        </span>
                      </div>

                      <div className="progress" style={{ marginTop: 8 }}>
                        <div className="progress__bar" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}


