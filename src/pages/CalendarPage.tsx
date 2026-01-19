import { useEffect, useMemo, useState } from "react";
import Calendar from "react-calendar";
import { cohorts, type CohortKey } from "../data/templates";
import {
  addTask,
  deleteTask,
  ensureTemplatesForCohort,
  loadCohort,
  loadTasks,
  saveCohort,
  saveTasks,
  setAssignee,
  toggleTask,
  type Task,
} from "../store/tasks";
import { useLocation } from "react-router-dom";
import { auth } from "../firebase";

function ymd(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function CalendarPage() {
  const [cohort, setCohort] = useState<CohortKey | "">("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [newTitle, setNewTitle] = useState("");

  const location = useLocation();

  const uid = auth.currentUser?.uid; // ✅ 로그인 사용자 uid

  // ✅ 로그인 사용자 기준으로 cohort/tasks 로드
  useEffect(() => {
    if (!uid) return;

    (async () => {
      const savedCohort = await loadCohort(uid);
      const savedTasks = await loadTasks(uid);
      setTasks(savedTasks);
      if (savedCohort) setCohort(savedCohort);
    })();
  }, [uid]);

  // ✅ cohort 바뀌면 템플릿 보장 + 저장(서버)
  useEffect(() => {
    if (!uid) return;
    if (!cohort) return;

    (async () => {
      await saveCohort(uid, cohort);

      setTasks((prev) => {
        const next = ensureTemplatesForCohort(prev, cohort);
        // fire-and-forget(비동기 저장)
        void saveTasks(uid, next);
        return next;
      });
    })();
  }, [cohort, uid]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const q = params.get("date"); // YYYY-MM-DD
    if (!q) return;

    const [y, m, d] = q.split("-").map(Number);
    if (!y || !m || !d) return;

    const next = new Date(y, m - 1, d);
    setSelectedDate(next);
  }, [location.search]);

  const selectedYmd = useMemo(() => ymd(selectedDate), [selectedDate]);

  const cohortTasks = useMemo(() => {
    if (!cohort) return [];
    return tasks.filter((t) => t.cohort === cohort);
  }, [tasks, cohort]);

  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of cohortTasks) {
      const arr = map.get(t.dueDate) ?? [];
      arr.push(t);
      map.set(t.dueDate, arr);
    }
    return map;
  }, [cohortTasks]);

  const dayTasks = useMemo(() => {
    return tasksByDate.get(selectedYmd) ?? [];
  }, [tasksByDate, selectedYmd]);

  const getDayStatus = (date: Date) => {
    const key = ymd(date);
    const list = tasksByDate.get(key) ?? [];
    if (list.length === 0) return "none";
    const allDone = list.every((t) => t.done);
    return allDone ? "done" : "todo";
  };

  // ✅ 로그인 안 됐으면 안내만 보여주기
  if (!uid) {
    return (
      <div className="card" style={{ padding: 16 }}>
        로그인이 필요합니다. (구글 로그인 후 동기화됩니다)
      </div>
    );
  }

  return (
    <div>
      <h1>캘린더</h1>

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

          <span style={{ color: "var(--muted)" }}>날짜 클릭 → 그날 해야 할 일 / 담당자 / 완료 체크</span>
        </div>
      </div>

      <div className="calendar-layout" style={{ display: "grid", gap: 14, marginTop: 12, alignItems: "start" }}>
        <div className="card">
          {!cohort ? (
            <div>차수를 먼저 선택해줘.</div>
          ) : (
            <Calendar
              onChange={(v) => {
                const d = Array.isArray(v) ? v[0] : v;
                if (d instanceof Date) setSelectedDate(d);
              }}
              value={selectedDate}
              tileClassName={({ date, view }) => {
                if (view !== "month") return "";
                const s = getDayStatus(date);
                if (s === "done") return "cal-day-done";
                if (s === "todo") return "cal-day-todo";
                return "";
              }}
              tileContent={({ date, view }) => {
                if (view !== "month") return null;
                const s = getDayStatus(date);
                return (
                  <div className="cal-marker">
                    <span className={`dot ${s === "todo" ? "on" : ""} ${s === "done" ? "done" : ""}`}>•</span>
                  </div>
                );
              }}
            />
          )}
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>{selectedYmd}</h3>

          {cohort && (
            <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="새 할 일 입력"
                style={{
                  flex: 1,
                  height: 36,
                  padding: "0 12px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                }}
              />

              <button
                className="btn"
                onClick={() => {
                  const title = newTitle.trim();
                  if (!title) return;

                  setTasks((prev) => {
                    const next = addTask(prev, {
                      cohort: cohort as CohortKey,
                      title,
                      dueDate: selectedYmd,
                      phase: "during",
                    });
                    void saveTasks(uid, next);
                    return next;
                  });

                  setNewTitle("");
                }}
              >
                추가
              </button>
            </div>
          )}

          {!cohort && <div style={{ color: "var(--muted)" }}>차수를 선택하면 일정에 표시됩니다.</div>}

          {cohort && dayTasks.length === 0 && (
            <div style={{ color: "var(--muted)", marginLeft: "5px", marginTop: "16px" }}>
              이 날짜에 등록된 할 일이 없습니다.
            </div>
          )}

          {cohort && dayTasks.length > 0 && (
            <div key={`${cohort}|${selectedYmd}`} style={{ display: "grid", gap: 10, marginTop: 10 }}>
              {dayTasks.map((t) => (
                <div key={`${t.id}|${t.cohort}|${t.dueDate}`} className="card" style={{ padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                    <label style={{ display: "flex", gap: 10, alignItems: "center", flex: 1 }}>
                      <input
                        type="checkbox"
                        checked={t.done}
                        onChange={() => {
                          setTasks((prev) => {
                            const next = toggleTask(prev, t.id);
                            void saveTasks(uid, next);
                            return next;
                          });
                        }}
                      />
                      <span style={{ textDecoration: t.done ? "line-through" : "none" }}>{t.title}</span>
                    </label>

                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <select
                        value={t.assignee}
                        onChange={(e) => {
                          const v = e.target.value;
                          setTasks((prev) => {
                            const next = setAssignee(prev, t.id, v);
                            void saveTasks(uid, next);
                            return next;
                          });
                        }}
                        style={{ height: 34, padding: "0 10px", borderRadius: 10, border: "1px solid var(--border)" }}
                      >
                        <option value="">담당자</option>
                        <option value="차연주">차연주</option>
                        <option value="한원석">한원석</option>
                        <option value="대한상공회의소">대한상공회의소</option>
                        <option value="포스텍">포스텍</option>
                      </select>

                      {t.id.includes(":custom:") && (
                        <button
                          onClick={() => {
                            setTasks((prev) => {
                              const next = deleteTask(prev, t.id);
                              void saveTasks(uid, next);
                              return next;
                            });
                          }}
                          style={{
                            height: 34,
                            padding: "0 10px",
                            borderRadius: 10,
                            border: "1px solid var(--border)",
                            background: "#fff",
                            cursor: "pointer",
                            fontWeight: 700,
                          }}
                          title="수동으로 추가한 할 일 삭제"
                        >
                          삭제
                        </button>
                      )}
                    </div>
                  </div>

                  <div style={{ marginTop: 6, color: "var(--muted)", fontSize: 12 }}>due: {t.dueDate}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
