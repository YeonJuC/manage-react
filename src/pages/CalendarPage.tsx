import { useEffect, useMemo, useState } from "react";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import { cohorts, type CohortKey } from "../data/templates";
import { addTask, deleteTask, setAssignee, toggleTask, type Task } from "../store/tasks";
import { useLocation } from "react-router-dom";
import { useTasksStore } from "../store/TasksContext";
import { cohortDates } from "../data/cohortDates";

function ymd(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function phaseOf(dueDate: string, start: string, end: string) {
  if (dueDate < start) return "pre";
  if (dueDate <= end) return "during";
  return "post";
}

export default function CalendarPage() {
  const [editing, setEditing] = useState<Task | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDate, setEditDate] = useState(""); // YYYY-MM-DD
  
  const openEdit = (task: Task) => {
    setEditing(task);
    setEditTitle(task.title);
    setEditDate(task.dueDate); // dueDate가 string(YYYY-MM-DD)라 가정
  };

  const saveEdit = () => {
    if (!editing) return;

    const title = editTitle.trim();
    if (!title) return;
    if (!cohort) return;

    const range = cohortDates[cohort as CohortKey];
    const phase = range
      ? phaseOf(editDate, range.start, range.end)
      : editing.phase; // fallback: 기존값 유지

    setTasksAndSave((prev) =>
      prev.map((x) =>
        x.id === editing.id
          ? { ...x, title, dueDate: editDate, phase }
          : x
      )
    );

    setEditing(null);
  };

  const { uid, ready, hydrated, cohort, setCohort, tasks, setTasksAndSave } = useTasksStore();

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [newTitle, setNewTitle] = useState("");

  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const q = params.get("date");
    if (!q) return;

    const [y, m, d] = q.split("-").map(Number);
    if (!y || !m || !d) return;
    setSelectedDate(new Date(y, m - 1, d));
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

  const dayTasks = useMemo(() => tasksByDate.get(selectedYmd) ?? [], [tasksByDate, selectedYmd]);

  const getDayStatus = (date: Date) => {
    const key = ymd(date);
    const list = tasksByDate.get(key) ?? [];
    if (list.length === 0) return "none";
    return list.every((t) => t.done) ? "done" : "todo";
  };

  if (!ready) return <div className="card" style={{ padding: 16 }}>로딩 중…</div>;
  if (!uid) return <div className="card" style={{ padding: 16 }}>로그인이 필요합니다.</div>;
  if (!hydrated) return <div className="card" style={{ padding: 16 }}>데이터 불러오는 중…</div>;

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

      <div className="calendar-layout">
        <div className="card">
          {!cohort ? (
            <div style={{ color: "var(--muted)" }}>차수를 먼저 선택해줘.</div>
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
                style={{ flex: 1, height: 36, padding: "0 12px", borderRadius: 10, border: "1px solid var(--border)" }}
              />

              <button
                className="btn"
                onClick={() => {
                  const title = newTitle.trim();
                  if (!title) return;
                  if (!cohort) return;

                  const range = cohortDates[cohort as CohortKey];

                  const phase = range
                    ? phaseOf(selectedYmd, range.start, range.end)
                    : "during";

                  setTasksAndSave((prev) =>
                    addTask(prev, {
                      cohort: cohort as CohortKey,
                      title,
                      dueDate: selectedYmd,
                      phase,
                    })
                  );

                  setNewTitle("");
                }}
              >
                추가
              </button>
            </div>
          )}

          {!cohort && <div style={{ color: "var(--muted)" }}>차수를 선택하면 일정에 표시됩니다.</div>}

          {cohort && dayTasks.length === 0 && (
            <div style={{ color: "var(--muted)", marginLeft: 5, marginTop: 16 }}>이 날짜에 등록된 할 일이 없습니다.</div>
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
                        onChange={() => setTasksAndSave((prev) => toggleTask(prev, t.id))}
                      />
                      <span style={{ textDecoration: t.done ? "line-through" : "none" }}>{t.title}</span>
                    </label>

                    <div style={{ display: "flex", gap: 8, alignItems: "center" }} className="actions">
                      <select
                        value={t.assignee}
                        onChange={(e) => setTasksAndSave((prev) => setAssignee(prev, t.id, e.target.value))}
                        style={{ height: 34, padding: "0 10px", borderRadius: 10, border: "1px solid var(--border)" }}
                      >
                        <option value="">담당자</option>
                        <option value="차연주">차연주사원</option>
                        <option value="한원석">한원석교수</option>
                        <option value="대한상공회의소">대한상공회의소</option>
                        <option value="포스텍">포스텍</option>
                      </select>

                      <button className="btn-edit"
                        onClick={() => openEdit(t)}
                        style={{
                          height: 34,
                          padding: "0 10px",
                          borderRadius: 10,
                          border: "1px solid var(--border)",
                          background: "#fff",
                          cursor: "pointer",
                          fontWeight: 700,
                        }}
                      >
                        수정
                      </button>

                      {t.id.includes(":custom:") && (
                        <button className="btn-del"
                          onClick={() => setTasksAndSave((prev) => deleteTask(prev, t.id))}
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
          {editing && (
            <div
              onClick={() => setEditing(null)}
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.35)",
                display: "grid",
                placeItems: "center",
                zIndex: 9999,
                padding: 16,
              }}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: "min(520px, 100%)",
                  background: "#fff",
                  borderRadius: 14,
                  border: "1px solid var(--border)",
                  padding: 16,
                }}
              >
                <h3 style={{ margin: 0, marginBottom: 12 }}>할 일 수정</h3>

                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ display: "grid", gap: 6 }}>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>내용</div>
                    <input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      style={{
                        height: 38,
                        padding: "0 12px",
                        borderRadius: 10,
                        border: "1px solid var(--border)",
                      }}
                    />
                  </div>

                  <div style={{ display: "grid", gap: 6 }}>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>날짜</div>
                    <input
                      type="date"
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                      style={{
                        height: 38,
                        padding: "0 12px",
                        borderRadius: 10,
                        border: "1px solid var(--border)",
                      }}
                    />
                  </div>

                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
                    <button className="btn" onClick={() => setEditing(null)}>취소</button>
                    <button className="btn" onClick={saveEdit}>저장</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
