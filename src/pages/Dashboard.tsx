import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { cohorts, type CohortKey } from "../data/templates";
import { useTasksStore } from "../store/TasksContext";
import type { Task } from "../store/tasks";

function labelPhase(p: Task["phase"]) {
  if (p === "pre") return "사전";
  if (p === "during") return "교육중";
  return "사후";
}

function sortByDate(a: Task, b: Task) {
  if (a.dueDate < b.dueDate) return -1;
  if (a.dueDate > b.dueDate) return 1;
  return a.title.localeCompare(b.title);
}

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

  const todayYmd = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }, []);

  const todayTasks = useMemo(() => {
    return cohortTasks
      .filter((t) => !t.done && t.dueDate === todayYmd)
      .sort(sortByDate)
      .slice(0, 10);
  }, [cohortTasks, todayYmd]);

  const overdueTasks = useMemo(() => {
    return cohortTasks
      .filter((t) => !t.done && t.dueDate < todayYmd)
      .sort(sortByDate)
      .slice(0, 10);
  }, [cohortTasks, todayYmd]);

  const upcomingTasks = useMemo(() => {
    return cohortTasks
      .filter((t) => !t.done && t.dueDate > todayYmd)
      .sort(sortByDate)
      .slice(0, 10);
  }, [cohortTasks, todayYmd]);

  const goDate = (t: Task) => nav(`/calendar?date=${t.dueDate}`);

  if (!ready) return <div className="card" style={{ padding: 16 }}>로딩 중…</div>;
  if (!uid) return <div className="card" style={{ padding: 16 }}>로그인이 필요합니다.</div>;
  if (!hydrated) return <div className="card" style={{ padding: 16 }}>데이터 불러오는 중…</div>;

  return (
    <div className="dashPage">
      <div className="dashTop">
        <div>
          <h1 className="dashH1">대시보드</h1>
          <div className="dashHint">
            {cohort ? (
              <>선택 차수 <b>{cohort}</b> · 완료 <b>{done}</b> / <b>{total}</b> ({pct}%)</>
            ) : (
              <>차수를 선택하면 일정 요약이 표시됩니다.</>
            )}
          </div>
        </div>

        <button className="btn btn--ghost dashGoBtn" onClick={() => nav("/tasks")}>
          할 일
        </button>
      </div>

      {/* 차수 선택 */}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="dashRow">
          <strong>차수 선택</strong>

          <select
            value={cohort}
            onChange={(e) => setCohort(e.target.value as CohortKey)}
            className="dashSelect"
          >
            <option value="">선택하세요</option>
            {cohorts.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>

          {cohort ? (
            <span className="dashMuted">
              완료 {done} / {total} ({pct}%)
            </span>
          ) : (
            <span className="dashMuted">차수를 선택해주세요.</span>
          )}
        </div>

        {cohort && (
          <div style={{ marginTop: 12 }}>
            <div className="progress">
              <div className="progress__bar" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* 숫자 요약 */}
      <div className="dashStats">
        <div className="card">
          <div className="dashStatLabel">전체 할 일</div>
          <div className="dashStatValue">{total}</div>
        </div>
        <div className="card">
          <div className="dashStatLabel">완료</div>
          <div className="dashStatValue">{done}</div>
        </div>
        <div className="card">
          <div className="dashStatLabel">잔여</div>
          <div className="dashStatValue">{Math.max(0, total - done)}</div>
        </div>
      </div>

      {/* ✅ 3개 섹션을 한꺼번에(그리드) */}
      <div className="dashTri">
        <section className="card dashBox">
          <div className="dashBoxHead">
            <div>
              <h3 className="dashBoxTitle">오늘 할 일</h3>
              <div className="dashBoxSub">{todayYmd}</div>
            </div>
            <button className="btn btn--ghost dashMiniBtn" onClick={() => nav(`/calendar?date=${todayYmd}`)}>
              오늘 보기
            </button>
          </div>

          {!cohort && <div className="dashEmpty">차수를 선택해주세요.</div>}
          {cohort && todayTasks.length === 0 && <div className="dashEmpty">오늘 할 일이 없습니다.</div>}
          {cohort && todayTasks.length > 0 && (
            <div className="dashList">
              {todayTasks.map((t) => (
                <button key={t.id} className="upcomingItem" onClick={() => goDate(t)}>
                  <span className={`upcomingPhase upcomingPhase--${t.phase}`}>{labelPhase(t.phase)}</span>
                  <span className="upcomingTitle">{t.title}</span>
                  <span className="upcomingDate">{t.dueDate}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="card dashBox">
          <div className="dashBoxHead">
            <div>
              <h3 className="dashBoxTitle">다가오는 할 일</h3>
              <div className="dashBoxSub">미완료 기준</div>
            </div>
            <button className="btn btn--ghost dashMiniBtn" onClick={() => nav("/calendar")}>
              캘린더
            </button>
          </div>

          {!cohort && <div className="dashEmpty">차수를 선택해주세요.</div>}
          {cohort && upcomingTasks.length === 0 && <div className="dashEmpty">다가오는 할 일이 없습니다.</div>}
          {cohort && upcomingTasks.length > 0 && (
            <div className="dashList">
              {upcomingTasks.map((t) => (
                <button key={t.id} className="upcomingItem" onClick={() => goDate(t)}>
                  <span className={`upcomingPhase upcomingPhase--${t.phase}`}>{labelPhase(t.phase)}</span>
                  <span className="upcomingTitle">{t.title}</span>
                  <span className="upcomingDate">{t.dueDate}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="card dashBox dashBox--danger">
          <div className="dashBoxHead">
            <div>
              <h3 className="dashBoxTitle">밀린 할 일</h3>
              <div className="dashBoxSub">오늘 이전 · 미완료</div>
            </div>
            <button className="btn btn--ghost dashMiniBtn" onClick={() => nav("/tasks")}>
              정리
            </button>
          </div>

          {!cohort && <div className="dashEmpty">차수를 선택해주세요.</div>}
          {cohort && overdueTasks.length === 0 && <div className="dashEmpty">밀린 할 일이 없습니다! GOOD!</div>}
          {cohort && overdueTasks.length > 0 && (
            <div className="dashList">
              {overdueTasks.map((t) => (
                <button key={t.id} className="upcomingItem" onClick={() => goDate(t)}>
                  <span className={`upcomingPhase upcomingPhase--${t.phase}`}>{labelPhase(t.phase)}</span>
                  <span className="upcomingTitle">{t.title}</span>
                  <span className="upcomingDate">{t.dueDate}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
