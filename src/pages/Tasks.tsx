import { useEffect, useMemo, useState } from "react";
import { cohorts, type CohortKey } from "../data/templates";
import {
  ensureTemplatesForCohort,
  loadCohort,
  loadTasks,
  saveCohort,
  saveTasks,
  toggleTask,
  setAssignee,
  addTask,
  deleteTask,
  type Task,
  type Phase,
} from "../store/tasks";
import { seedTasks32 } from "../data/seedTasks32";
import { cohortDates } from "../data/cohortDates";
import { auth } from "../firebase"; // ✅ 추가

const [hydrated, setHydrated] = useState(false);

const phaseLabel: Record<Phase, string> = {
  pre: "사전",
  during: "교육 중",
  post: "사후",
};

function ymdToday() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseYmd(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function fmtYmd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function addDays(date: Date, n: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + n);
  return copy;
}
function diffDays(a: Date, b: Date) {
  const ms = a.getTime() - b.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}
function phaseOf(dueDate: string, start: string, end: string) {
  if (dueDate < start) return "pre";
  if (dueDate <= end) return "during";
  return "post";
}

export default function Tasks() {
  const [cohort, setCohort] = useState<CohortKey | "">("");
  const [tasks, setTasks] = useState<Task[]>([]);

  const uid = auth.currentUser?.uid; // ✅ 추가

  // 추가 폼 상태
  const [newPhase, setNewPhase] = useState<Phase>("during");
  const [newTitle, setNewTitle] = useState("");
  const [newDueDate, setNewDueDate] = useState(ymdToday());
  const [newAssignee, setNewAssignee] = useState("");

  // ✅ 로그인 사용자 기준 로드
  useEffect(() => {
    if (!uid) return;

    (async () => {
      const savedCohort = await loadCohort(uid);
      const savedTasks = await loadTasks(uid);
      setTasks(savedTasks);
      if (savedCohort) setCohort(savedCohort);

      setHydrated(true);
    })();
  }, [uid]);

  // ✅ 차수 선택 시 템플릿 자동 생성 + 저장(서버)
  useEffect(() => {
    if (!uid) return;
    if (!hydrated) return;
    if (!cohort) return;

    (async () => {
      await saveCohort(uid, cohort);

      setTasks((prev) => {
        const next = ensureTemplatesForCohort(prev, cohort);
        void saveTasks(uid, next);
        return next;
      });
    })();
  }, [cohort, uid, hydrated]);

  const filtered = useMemo(() => {
    if (!cohort) return [];
    return tasks
      .filter((t) => t.cohort === cohort)
      .sort((a, b) => (a.dueDate > b.dueDate ? 1 : -1));
  }, [tasks, cohort]);

  const grouped = useMemo(() => {
    return {
      pre: filtered.filter((t) => t.phase === "pre"),
      during: filtered.filter((t) => t.phase === "during"),
      post: filtered.filter((t) => t.phase === "post"),
    };
  }, [filtered]);

  const { doneCount, totalCount } = useMemo(() => {
    const totalCount = filtered.length;
    const doneCount = filtered.reduce((acc, t) => acc + (t.done ? 1 : 0), 0);
    return { doneCount, totalCount };
  }, [filtered]);

  const bulkImport = () => {
    if (!uid) return;
    if (!cohort) return;

    const baseKey = cohorts.find((c) => c.label === "32기(1차)")?.key;
    if (!baseKey) {
      alert('cohorts에 "32기(1차)" 라벨이 없어요.');
      return;
    }

    const base = cohortDates[baseKey as CohortKey];
    const target = cohortDates[cohort as CohortKey];

    if (!target) {
      alert("선택한 차수에 대한 일정 정보가 없습니다.");
      return;
    }

    const delta = diffDays(parseYmd(target.start), parseYmd(base.start));

    setTasks((prev) => {
      let next = prev;

      const exists = new Map<string, number>();
      next.forEach((t, idx) => {
        exists.set(`${t.cohort}|${t.dueDate}|${t.title}`, idx);
      });

      let added = 0;
      let skipped = 0;
      let updated = 0;

      if (!seedTasks32 || seedTasks32.length === 0) {
        alert("seedTasks32가 비어있어요. seedTasks32.ts 내용을 확인해줘.");
        return prev;
      }

      for (const item of seedTasks32) {
        const title = item.title?.trim();
        if (!title || !item.dueDate) continue;

        const shiftedDue = fmtYmd(addDays(parseYmd(item.dueDate), delta));
        const shiftedPhase = phaseOf(shiftedDue, target.start, target.end);

        const key = `${cohort}|${shiftedDue}|${title}`;
        const idx = exists.get(key);

        if (idx !== undefined) {
          skipped++;
          const cur = next[idx];
          if ((!cur.assignee || cur.assignee === "") && item.assignee) {
            const copy = [...next];
            copy[idx] = { ...cur, assignee: item.assignee };
            next = copy;
            updated++;
          }
          continue;
        }

        next = addTask(next, {
          cohort,
          title,
          dueDate: shiftedDue,
          phase: shiftedPhase,
          assignee: item.assignee ?? "",
        });

        exists.set(key, next.length - 1);
        added++;
      }

      void saveTasks(uid, next);
      alert(`일괄 등록 완료 ✅\n추가: ${added}개\n중복 스킵: ${skipped}개\n업데이트: ${updated}개`);
      return next;
    });
  };

  const onAdd = () => {
    if (!uid) return;
    if (!cohort) return;
    if (!newTitle.trim()) return;

    setTasks((prev) => {
      const next = addTask(prev, {
        cohort,
        title: newTitle.trim(),
        dueDate: newDueDate,
        phase: newPhase,
        assignee: newAssignee,
      });
      void saveTasks(uid, next);
      return next;
    });

    setNewTitle("");
  };

  const Section = ({ phase }: { phase: Phase }) => {
    const list = grouped[phase];
    const phaseDone = list.length > 0 && list.every((t) => t.done);

    return (
      <section className="card" style={{ padding: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <h3 style={{ margin: 0 }}>
            {phaseLabel[phase]}{" "}
            <span style={{ fontSize: 12, color: "var(--muted)", marginLeft: 8 }}>
              ({list.filter((t) => t.done).length}/{list.length})
            </span>
          </h3>

          <span
            style={{
              fontSize: 12,
              padding: "6px 10px",
              borderRadius: 999,
              border: "1px solid var(--border)",
              background: phaseDone ? "rgba(34,197,94,0.12)" : "rgba(59,130,246,0.08)",
            }}
          >
            {list.length === 0 ? "없음" : phaseDone ? "완료" : "진행 중"}
          </span>
        </div>

        <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
          {list.length === 0 && <div style={{ color: "var(--muted)" }}>등록된 할 일이 없습니다.</div>}

          {list.map((t) => (
            <div
              key={t.id}
              className="card"
              style={{ padding: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}
            >
              <label style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
                <input
                  type="checkbox"
                  checked={t.done}
                  onChange={() => {
                    if (!uid) return;
                    setTasks((prev) => {
                      const next = toggleTask(prev, t.id);
                      void saveTasks(uid, next);
                      return next;
                    });
                  }}
                />
                <div style={{ minWidth: 0 }}>
                  <div style={{ textDecoration: t.done ? "line-through" : "none", fontWeight: 700 }}>
                    {t.title}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{t.dueDate}</div>
                </div>
              </label>

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <select
                  value={t.assignee}
                  onChange={(e) => {
                    if (!uid) return;
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

                <button
                  className="btn"
                  style={{ height: 34, borderRadius: 10 }}
                  onClick={() => {
                    if (!uid) return;
                    setTasks((prev) => {
                      const next = deleteTask(prev, t.id);
                      void saveTasks(uid, next);
                      return next;
                    });
                  }}
                >
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  };

  // ✅ 로그인 안내
  if (!uid) {
    return (
      <div className="card" style={{ padding: 16 }}>
        로그인이 필요합니다. (구글 로그인 후 데이터가 동기화됩니다)
      </div>
    );
  }

  return (
    <div>
      <h1>할 일</h1>

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

          {cohort && (
            <span style={{ color: "var(--muted)" }}>
              전체 완료 {doneCount} / {totalCount}
              {totalCount > 0 && ` (${Math.round((doneCount / totalCount) * 100)}%)`}
            </span>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 12, padding: 14 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <strong>할 일 추가</strong>

          <select
            value={newPhase}
            onChange={(e) => setNewPhase(e.target.value as Phase)}
            style={{ height: 36, padding: "0 10px", borderRadius: 10, border: "1px solid var(--border)" }}
          >
            <option value="pre">사전</option>
            <option value="during">교육 중</option>
            <option value="post">사후</option>
          </select>

          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="할 일 제목"
            style={{ height: 36, padding: "0 10px", borderRadius: 10, border: "1px solid var(--border)", width: 260 }}
          />

          <input
            type="date"
            value={newDueDate}
            onChange={(e) => setNewDueDate(e.target.value)}
            style={{ height: 36, padding: "0 10px", borderRadius: 10, border: "1px solid var(--border)" }}
          />

          <select
            value={newAssignee}
            onChange={(e) => setNewAssignee(e.target.value)}
            style={{ height: 36, padding: "0 10px", borderRadius: 10, border: "1px solid var(--border)" }}
          >
            <option value="">담당자</option>
            <option value="차연주">차연주</option>
            <option value="한원석">한원석</option>
            <option value="대한상공회의소">대한상공회의소</option>
            <option value="포스텍">포스텍</option>
          </select>

          <button className="btn" style={{ height: 36, borderRadius: 10 }} disabled={!cohort} onClick={onAdd}>
            추가
          </button>

          {cohort && (
            <button className="btn btn--ghost" onClick={bulkImport} style={{ marginLeft: "auto", fontWeight: 800 }}>
              일괄 등록(업무일지)
            </button>
          )}

          {!cohort && <span style={{ color: "var(--muted)" }}>차수를 먼저 선택해줘.</span>}
        </div>
      </div>

      <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
        <Section phase="pre" />
        <Section phase="during" />
        <Section phase="post" />
      </div>
    </div>
  );
}
