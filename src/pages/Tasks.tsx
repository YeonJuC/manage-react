import React, { useEffect, useMemo, useRef, useState } from "react";
import { cohorts, type CohortKey } from "../data/templates";
import {
  addTask,
  deleteTask,
  toggleTask,
  setAssignee,
  type Task,
  type Phase,
} from "../store/tasks";
import { seedTasks32 } from "../data/seedTasks32";
import { cohortDates } from "../data/cohortDates";
import { useTasksStore } from "../store/TasksContext";
import { materializeTemplatesForCohort } from "../store/customTemplates";

const phaseLabel: Record<Phase, string> = {
  pre: "사전",
  during: "교육 중",
  post: "사후",
};

function parseYmd(ymd: string) {
  const [y, m, d] = ymd.split("-").map((n) => Number(n));
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}
function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
function fmtYmd(date: Date) {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function diffDays(a: Date, b: Date) {
  const ms = 24 * 60 * 60 * 1000;
  const ax = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const bx = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((ax - bx) / ms);
}
function phaseOf(dueYmd: string, startYmd: string, endYmd: string): Phase {
  const due = parseYmd(dueYmd).getTime();
  const start = parseYmd(startYmd).getTime();
  const end = parseYmd(endYmd).getTime();
  if (due < start) return "pre";
  if (due > end) return "post";
  return "during";
}

export default function Tasks() {
  const {
    uid,
    ready,
    hydrated,
    cohort,
    setCohort,
    tasks,
    setTasksAndSave,
    applyTemplateToAllCohorts,
    bulkUpdateByTemplateId,
    bulkDeleteByTemplateId,
  } = useTasksStore();

  const [editing, setEditing] = useState<Task | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editPhase, setEditPhase] = useState<Task["phase"]>("during");

  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement | null>(null);
  const [filter, setFilter] = useState<"all" | "pre" | "during" | "post">("all");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    let arr = tasks.filter((t) => t.cohort === cohort);
    if (filter !== "all") arr = arr.filter((t) => t.phase === filter);
    const query = q.trim();
    if (query) {
      const lower = query.toLowerCase();
      arr = arr.filter(
        (t) =>
          t.title.toLowerCase().includes(lower) ||
          (t.assignee ?? "").toLowerCase().includes(lower)
      );
    }
    return arr;
  }, [tasks, cohort, filter, q]);

  const total = filtered.length;
  const doneCount = filtered.filter((t) => t.done).length;

  const onAdd = () => {
    if (!cohort) return;
    const title = window.prompt("업무명을 입력하세요");
    if (!title || !title.trim()) return;
    const dueDate = window.prompt("기한(YYYY-MM-DD) 입력", "");
    if (!dueDate || !dueDate.trim()) return;
    const due = dueDate.trim();
    const target = cohortDates[cohort as CohortKey];
    const phase = target ? phaseOf(due, target.start, target.end) : "during";

    setTasksAndSave((prev) =>
      addTask(prev, {
        cohort,
        title: title.trim(),
        dueDate: due,
        phase,
        assignee: "",
        origin: "custom",
      })
    );
  };

  const onEditOpen = (t: Task) => {
    setEditing(t);
    setEditTitle(t.title);
    setEditDate(t.dueDate);
    setEditPhase(t.phase);
  };

  const onEditSave = () => {
    if (!editing) return;
    const title = editTitle.trim();
    const dueDate = editDate.trim();
    if (!title || !dueDate) return;

    const target = cohortDates[editing.cohort as CohortKey];
    const phase = target ? phaseOf(dueDate, target.start, target.end) : editPhase;

    setTasksAndSave((prev) => {
      const idx = prev.findIndex((x) => x.id === editing.id);
      if (idx < 0) return prev;
      const copy = [...prev];
      copy[idx] = { ...copy[idx], title, dueDate, phase };
      return copy;
    });

    setEditing(null);
  };

  const onDelete = (id: string) => {
    if (!window.confirm("삭제할까요?")) return;
    setTasksAndSave((prev) => deleteTask(prev, id));
  };

  const onToggle = (id: string) => {
    setTasksAndSave((prev) => toggleTask(prev, id));
  };

  const onSetAssignee = (id: string) => {
    const who = window.prompt("담당자 이름(또는 공백)", "");
    if (who === null) return;
    setTasksAndSave((prev) => setAssignee(prev, id, who.trim()));
  };

  // ✅ 업무 일괄 등록(핵심 수정)
  const onBulkSeed = () => {
    if (!cohort) return;

    const baseKey = cohorts.find((c) => c.label === "32기(1차)")?.key;
    if (!baseKey) return alert('cohorts에 "32기(1차)" 라벨이 없어요.');

    const base = cohortDates[baseKey as CohortKey];
    const target = cohortDates[cohort as CohortKey];
    if (!target) return alert("선택한 차수에 대한 일정 정보가 없습니다.");

    const delta = diffDays(parseYmd(target.start), parseYmd(base.start));

    let added = 0,
      skipped = 0,
      updated = 0;

    setTasksAndSave((prev) => {
      let next = prev;

      const exists = new Map<string, number>();
      next.forEach((t, idx) => exists.set(`${t.cohort}|${t.dueDate}|${t.title}`, idx));

      // 1) ✅ 32기(기준 차수)에 '실제로 존재하는 업무들'을 그대로 복사해서 적용
      //    - 32기에서 수동으로 추가한 업무(일괄등록에 없던 내용)까지 포함
      //    - 날짜는 목표 차수 start 기준으로 shift, phase는 목표 차수 기간 기준으로 재계산
      const baseTasks = prev.filter((t) => t.cohort === baseKey);

      const shouldCopyFromBase = cohort !== baseKey && baseTasks.length > 0;

      if (shouldCopyFromBase) {
        for (const srcTask of baseTasks) {
          const title = srcTask.title?.trim();
          if (!title || !srcTask.dueDate) continue;

          const shiftedDue = fmtYmd(addDays(parseYmd(srcTask.dueDate), delta));
          const shiftedPhase = phaseOf(shiftedDue, target.start, target.end);

          const key = `${cohort}|${shiftedDue}|${title}`;
          const idx = exists.get(key);
          if (idx !== undefined) {
            skipped++;
            continue;
          }

          next = addTask(next, {
            cohort,
            title,
            dueDate: shiftedDue,
            phase: shiftedPhase,
            assignee: srcTask.assignee ?? "",
            origin: srcTask.origin ?? "custom",
            templateId: (srcTask as any).templateId,
          });
          exists.set(key, next.length - 1);
          added++;
        }
      } else {
        // ✅ 32기이거나(기준 차수) / 아직 32기 업무가 비어있을 때는 seed + 템플릿으로 채움(기존 방식)
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
            origin: "seed",
          });
          exists.set(key, next.length - 1);
          added++;
        }
      }

      // 2) ✅ 사용자가 32기에서 '템플릿으로 저장'해둔 커스텀 업무도 같이 적용
      //    - 단, 다음 기수는 "32기의 실제 업무 전체를 복사"하므로 중복 방지 위해 base-copy 모드일 때는 생략
      if (!shouldCopyFromBase) {
        const tplItems = materializeTemplatesForCohort(cohort as CohortKey);
        for (const t of tplItems) {
          const title = t.title?.trim();
          if (!title || !t.dueDate) continue;

          const fixedPhase = phaseOf(t.dueDate, target.start, target.end);
          const key = `${cohort}|${t.dueDate}|${title}`;
          const idx = exists.get(key);
          if (idx !== undefined) {
            skipped++;
            continue;
          }

          next = addTask(next, {
            cohort,
            title,
            dueDate: t.dueDate,
            phase: fixedPhase,
            assignee: t.assignee ?? "",
            templateId: (t as any).templateId,
            origin: "custom",
          });
          exists.set(key, next.length - 1);
          added++;
        }
      }

      queueMicrotask(() => {
        alert(`일괄 등록 완료 ✅\n추가: ${added}개\n중복 스킵: ${skipped}개\n업데이트: ${updated}개`);
      });

      return next;
    });
  };

  // ✅ 차수 선택 후, 해당 차수에 할 일이 비어있다면 1회 자동으로 "일괄 등록" 실행
  //    (반복 실행 방지: ownerUid+cohort 기준으로 로컬에 기록)
  useEffect(() => {
    if (!uid || !cohort) return;
    if (!hydrated) return;

    const alreadyKey = `seeded_${uid}_${cohort}`;
    if (localStorage.getItem(alreadyKey) === "1") return;

    const hasAny = tasks.some((t) => t.cohort === cohort);
    if (hasAny) return;

    localStorage.setItem(alreadyKey, "1");
    onBulkSeed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, cohort, hydrated]);

  if (!ready) return <div style={{ padding: 16 }}>로딩중...</div>;

  return (
    <div className="page-wrap" style={{ padding: 16 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>할일</h2>

        <select
          value={cohort ?? ""}
          onChange={(e) => setCohort(e.target.value as any)}
          style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #ddd" }}
        >
          <option value="" disabled>
            차수 선택
          </option>
          {cohorts.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={onAdd}
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #ddd",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          + 추가
        </button>

        <button
          type="button"
          onClick={onBulkSeed}
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #ddd",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          업무 일괄 등록
        </button>

        <div style={{ flex: 1 }} />

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="검색(업무/담당자)"
          style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #ddd" }}
        />

        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as any)}
          style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #ddd" }}
        >
          <option value="all">전체</option>
          <option value="pre">사전</option>
          <option value="during">교육 중</option>
          <option value="post">사후</option>
        </select>
      </div>

      <div style={{ marginTop: 10, opacity: 0.8 }}>
        총 {total}개 / 완료 {doneCount}개
      </div>

      <div ref={listRef} style={{ marginTop: 14, display: "grid", gap: 10 }}>
        {filtered.map((t) => (
          <div
            key={t.id}
            style={{
              border: "1px solid #e6e6e6",
              borderRadius: 14,
              padding: 12,
              background: "#fff",
            }}
          >
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button
                type="button"
                onClick={() => onToggle(t.id)}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 999,
                  border: "1px solid #ddd",
                  cursor: "pointer",
                  fontWeight: 800,
                }}
                title="완료 토글"
              >
                {t.done ? "✓" : ""}
              </button>

              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, textDecoration: t.done ? "line-through" : "none" }}>
                  {t.title}
                </div>
                <div style={{ fontSize: 13, opacity: 0.8, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <span>기한: {t.dueDate}</span>
                  <span>구간: {phaseLabel[t.phase]}</span>
                  <span>담당: {t.assignee || "-"}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setMenuOpenId((cur) => (cur === t.id ? null : t.id));
                }}
                style={{
                  padding: "8px 10px",
                  borderRadius: 12,
                  border: "1px solid #ddd",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                ⋯
              </button>
            </div>

            {menuOpenId === t.id && (
              <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => {
                    onEditOpen(t);
                    setMenuOpenId(null);
                  }}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 12,
                    border: "1px solid #ddd",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  수정
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onSetAssignee(t.id);
                    setMenuOpenId(null);
                  }}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 12,
                    border: "1px solid #ddd",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  담당자
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onDelete(t.id);
                    setMenuOpenId(null);
                  }}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 12,
                    border: "1px solid #ddd",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  삭제
                </button>

                {t.templateId && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        const ok = window.confirm("이 템플릿을 모든 차수에 적용할까요?");
                        if (!ok) return;
                        applyTemplateToAllCohorts(t.templateId!);
                        setMenuOpenId(null);
                      }}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 12,
                        border: "1px solid #ddd",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      템플릿 전체 적용
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const ok = window.confirm("이 템플릿의 제목/기한을 일괄 변경할까요?");
                        if (!ok) return;
                        const nt = window.prompt("새 제목(공백이면 유지)", t.title) ?? "";
                        const nd = window.prompt("새 기한(YYYY-MM-DD, 공백이면 유지)", t.dueDate) ?? "";
                        bulkUpdateByTemplateId(t.templateId!, {
                          title: nt.trim() ? nt.trim() : undefined,
                          dueDate: nd.trim() ? nd.trim() : undefined,
                        });
                        setMenuOpenId(null);
                      }}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 12,
                        border: "1px solid #ddd",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      템플릿 일괄 수정
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const ok = window.confirm("이 템플릿으로 생성된 업무를 모두 삭제할까요?");
                        if (!ok) return;
                        bulkDeleteByTemplateId(t.templateId!);
                        setMenuOpenId(null);
                      }}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 12,
                        border: "1px solid #ddd",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      템플릿 일괄 삭제
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {editing && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.3)",
            display: "grid",
            placeItems: "center",
            padding: 16,
          }}
          onClick={() => setEditing(null)}
        >
          <div
            style={{
              width: "min(520px, 100%)",
              background: "#fff",
              borderRadius: 16,
              padding: 14,
              border: "1px solid #eee",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0 }}>업무 수정</h3>

            <div style={{ display: "grid", gap: 10 }}>
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="업무명"
                style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #ddd" }}
              />
              <input
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                placeholder="기한 YYYY-MM-DD"
                style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #ddd" }}
              />
              <select
                value={editPhase}
                onChange={(e) => setEditPhase(e.target.value as any)}
                style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #ddd" }}
              >
                <option value="pre">사전</option>
                <option value="during">교육 중</option>
                <option value="post">사후</option>
              </select>

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #ddd", fontWeight: 800 }}
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={onEditSave}
                  style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #ddd", fontWeight: 800 }}
                >
                  저장
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}