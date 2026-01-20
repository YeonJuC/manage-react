import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { cohorts, type CohortKey } from "../data/templates";
import { useTasksStore } from "../store/TasksContext";
import type { Task } from "../store/tasks";

export default function Dashboard() {
  const { uid, ready, hydrated, cohort, setCohort, tasks } = useTasksStore();
  const nav = useNavigate();

  const cohortTasks = useMemo(() => {
    if (!cohort) return [];
    return tasks.filter((t) => t.cohort === cohort);
  }, [tasks, cohort]);

  const total = cohortTasks.length;
  const done = cohortTasks.reduce((acc, t) => acc + (t.done ? 1 : 0), 0);
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  const upcoming = useMemo(() => {
    // 미완료 우선 + 날짜 오름차순 + 7개
    return [...cohortTasks]
      .filter((t) => !t.done)
      .sort((a, b) => (a.dueDate > b.dueDate ? 1 : -1))
      .slice(0, 7);
  }, [cohortTasks]);

  const todayYmd = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }, []);

  const todayTasks = useMemo(() => {
    return cohortTasks.filter((t) => t.dueDate === todayYmd);
  }, [cohortTasks, todayYmd]);

  const overdueTasks = useMemo(() => {
    return cohortTasks
      .filter((t) => !t.done && t.dueDate < todayYmd)
      .sort((a, b) => (a.dueDate > b.dueDate ? 1 : -1))
      .slice(0, 7);
  }, [cohortTasks, todayYmd]);

  const goDate = (t: Task) => nav(`/calendar?date=${t.dueDate}`);

  if (!ready) return <div className="card" style={{ padding: 16 }}>로딩 중…</div>;
  if (!uid) return <div className="card" style={{ padding: 16 }}>로그인이 필요합니다.</div>;
  if (!hydrated) return <div className="card" style={{ padding: 16 }}>데이터 불러오는 중…</div>;

  return (
    <div>
      <h1>대시보드</h1>

      {/* 차수 선택 */}
      <div className="card" style={{ marginTop: 12 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <strong>차수 선택</strong>

          <select
            value={cohort}
            onChange={(e) => setCohort(e.target.value as CohortKey)}
            style={{ height: 36, padding: "0 10px", borderRadius: 10, border: "1px solid var(--border)" }}
          >
            <option value="">선택하세요</option>
            {cohorts.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>

          {cohort ? (
            <span style={{ color: "var(--muted)" }}>
              완료 {done} / {total} ({pct}%)
            </span>
          ) : (
            <span style={{ color: "var(--muted)" }}>차수를 선택하면 요약이 표시됩니다.</span>
          )}

          <button
            className="btn btn--ghost"
            onClick={() => nav("/tasks")}
            style={{ marginLeft: "auto", height: 34, borderRadius: 12 }}
          >
            할 일로 가기
          </button>
        </div>

        {cohort && (
          <div style={{ marginTop: 12 }}>
            <div className="progress">
              <div className="progress__bar" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* 요약 카드 3개 */}
      <div className="grid" style={{ marginTop: 12 }}>
        <div className="card">
          <div style={{ fontSize: 12, color: "var(--muted)" }}>전체 할 일</div>
          <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6 }}>{total}</div>
        </div>
        <div className="card">
          <div style={{ fontSize: 12, color: "var(--muted)" }}>완료</div>
          <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6 }}>{done}</div>
        </div>
        <div className="card">
          <div style={{ fontSize: 12, color: "var(--muted)" }}>잔여</div>
          <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6 }}>{Math.max(0, total - done)}</div>
        </div>
      </div>

      {/* 오늘 할 일 */}
      <div className="card" style={{ marginTop: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <h3 style={{ margin: 0 }}>오늘 할 일 ({todayYmd})</h3>
          <button className="btn btn--ghost" onClick={() => nav(`/calendar?date=${todayYmd}`)} style={{ height: 34, borderRadius: 12 }}>
            오늘 보기
          </button>
        </div>

        {!cohort && <div style={{ marginTop: 10, color: "var(--muted)" }}>차수를 선택해줘.</div>}

        {cohort && todayTasks.length === 0 && (
          <div style={{ marginTop: 10, color: "var(--muted)" }}>오늘 등록된 할 일이 없습니다.</div>
        )}

        {cohort && todayTasks.length > 0 && (
          <div className="dash-list" style={{ marginTop: 10 }}>
            {todayTasks.map((t) => (
              <button key={t.id} className="dash-item" onClick={() => goDate(t)} style={{ cursor: "pointer" }}>
                <span className="dash-badge">{t.phase}</span>
                <span className="dash-title">{t.title}</span>
                <span className="dash-date">{t.dueDate}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 다가오는 할 일 */}
      <div className="card" style={{ marginTop: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <h3 style={{ margin: 0 }}>다가오는 할 일</h3>
          <button className="btn btn--ghost" onClick={() => nav("/calendar")} style={{ height: 34, borderRadius: 12 }}>
            캘린더로 가기
          </button>
        </div>

        {!cohort && <div style={{ marginTop: 10, color: "var(--muted)" }}>차수를 선택해줘.</div>}

        {cohort && upcoming.length === 0 && (
          <div style={{ marginTop: 10, color: "var(--muted)" }}>미완료 할 일이 없습니다.</div>
        )}

        {cohort && upcoming.length > 0 && (
          <div className="dash-list" style={{ marginTop: 10 }}>
            {upcoming.map((t) => (
              <button key={t.id} className="dash-item" onClick={() => goDate(t)} style={{ cursor: "pointer" }}>
                <span className="dash-badge">{t.phase}</span>
                <span className="dash-title">{t.title}</span>
                <span className="dash-date">{t.dueDate}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 밀린 할 일 */}
      <div className="card" style={{ marginTop: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <h3 style={{ margin: 0 }}>밀린 할 일</h3>
          <button className="btn btn--ghost" onClick={() => nav("/tasks")} style={{ height: 34, borderRadius: 12 }}>
            정리하러 가기
          </button>
        </div>

        {!cohort && <div style={{ marginTop: 10, color: "var(--muted)" }}>차수를 선택해줘.</div>}

        {cohort && overdueTasks.length === 0 && (
          <div style={{ marginTop: 10, color: "var(--muted)" }}>밀린 할 일이 없습니다. 굿.</div>
        )}

        {cohort && overdueTasks.length > 0 && (
          <div className="dash-list" style={{ marginTop: 10 }}>
            {overdueTasks.map((t) => (
              <button key={t.id} className="dash-item" onClick={() => goDate(t)} style={{ cursor: "pointer" }}>
                <span className="dash-badge">{t.phase}</span>
                <span className="dash-title">{t.title}</span>
                <span className="dash-date">{t.dueDate}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
