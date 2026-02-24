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

  // ✅ 완료 항목 접기/펼치기(기본: 접힘)
  const [doneOpen, setDoneOpen] = useState<{ pre: boolean; during: boolean; post: boolean }>({
    pre: false,
    during: false,
    post: false,
  });
  const [editing, setEditing] = useState<Task | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editPhase, setEditPhase] = useState<Task["phase"]>("during");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement | null>(null);
  const [q, setQ] = useState("");

  // ✅ (UI 복원) 필터 드롭다운 없이, 검색만 유지하고 phase별로 섹션 분리
  const visible = useMemo(() => {
    let arr = tasks.filter((t) => t.cohort === cohort);

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
  }, [tasks, cohort, q]);

  const byPhase = useMemo(() => {
    const pre = visible.filter((t) => t.phase === "pre");
    const during = visible.filter((t) => t.phase === "during");
    const post = visible.filter((t) => t.phase === "post");
    return { pre, during, post };
  }, [visible]);

  const sortByDateAsc = (a: Task, b: Task) => a.dueDate.localeCompare(b.dueDate);

  const splitAndSort = (items: Task[]) => {
    const undone = items.filter((t) => !t.done).sort(sortByDateAsc);
    const done = items.filter((t) => t.done).sort(sortByDateAsc);
    return { undone, done };
  };

  const phaseBuckets = useMemo(() => {
    return {
      pre: splitAndSort(byPhase.pre),
      during: splitAndSort(byPhase.during),
      post: splitAndSort(byPhase.post),
    };
  }, [byPhase]);

  const total = visible.length;
  const doneCount = visible.filter((t) => t.done).length;

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

  /**
   * ✅ 업무 일괄 등록 (핵심)
   * - 32기(첫 기수)는 seedTasks32 + templates로 채움
   * - 그 외 기수는 "바로 전 기수의 실제 tasks(수동 추가 포함)"를 통째로 복사
   * - 날짜는 (현재기수.start - 전기수.start) 만큼 shift
   * - phase는 현재기수 기간 기준으로 재계산
   * - 중복(제목+기한) 방지
   */
  const onBulkSeed = () => {
    if (!cohort) return;

    const target = cohortDates[cohort as CohortKey];
    if (!target) return alert("선택한 차수에 대한 일정 정보가 없습니다.");

    const cohortOrder = cohorts.map((c) => c.key);
    const idx = cohortOrder.indexOf(cohort as CohortKey);
    const prevCohort = idx > 0 ? (cohortOrder[idx - 1] as CohortKey) : null;

    const prevDates = prevCohort ? cohortDates[prevCohort] : null;

    let added = 0,
      skipped = 0,
      updated = 0;

    setTasksAndSave((prev) => {
      let next = prev;

      const exists = new Map<string, number>();
      next.forEach((t, i) => exists.set(`${t.cohort}|${t.dueDate}|${t.title}`, i));

      // ✅ 전기수 복사 가능 여부
      const prevTasks = prevCohort ? prev.filter((t) => t.cohort === prevCohort) : [];
      const canCopyPrev = !!prevCohort && prevTasks.length > 0 && !!prevDates;

      if (canCopyPrev) {
        const delta = diffDays(parseYmd(target.start), parseYmd(prevDates!.start));

        for (const src of prevTasks) {
          const title = (src.title ?? "").trim();
          if (!title || !src.dueDate) continue;

          const shiftedDue = fmtYmd(addDays(parseYmd(src.dueDate), delta));
          const shiftedPhase = phaseOf(shiftedDue, target.start, target.end);

          const key = `${cohort}|${shiftedDue}|${title}`;
          if (exists.has(key)) {
            skipped++;
            continue;
          }

          next = addTask(next, {
            cohort,
            title,
            dueDate: shiftedDue,
            phase: shiftedPhase,
            assignee: src.assignee ?? "",
            origin: src.origin ?? "custom", // ✅ 수동추가(custom)도 그대로 포함
            templateId: (src as any).templateId,
          });

          exists.set(key, next.length - 1);
          added++;
        }
      } else {
        // ✅ 첫 기수(32기) 등 "복사할 전기수 데이터가 없을 때"만 seed + templates로 채움
        const baseKey = cohorts.find((c) => c.label.includes("32기"))?.key as CohortKey | undefined;
        const base = baseKey ? cohortDates[baseKey] : null;
        const delta = base ? diffDays(parseYmd(target.start), parseYmd(base.start)) : 0;

        // 1) seed
        for (const item of seedTasks32) {
          const title = (item.title ?? "").trim();
          if (!title || !item.dueDate) continue;

          const shiftedDue = base ? fmtYmd(addDays(parseYmd(item.dueDate), delta)) : item.dueDate;
          const shiftedPhase = phaseOf(shiftedDue, target.start, target.end);

          const key = `${cohort}|${shiftedDue}|${title}`;
          const idxExist = exists.get(key);

          if (idxExist !== undefined) {
            skipped++;
            const cur = next[idxExist];
            if ((!cur.assignee || cur.assignee === "") && item.assignee) {
              const copy = [...next];
              copy[idxExist] = { ...cur, assignee: item.assignee };
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

        // 2) templates
        const tplItems = materializeTemplatesForCohort(cohort as CohortKey);
        for (const t of tplItems) {
          const title = (t.title ?? "").trim();
          if (!title || !t.dueDate) continue;

          const fixedPhase = phaseOf(t.dueDate, target.start, target.end);
          const key = `${cohort}|${t.dueDate}|${title}`;
          if (exists.has(key)) {
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
        const baseMsg = canCopyPrev
          ? `전기수(${prevCohort}) 업무를 복사해 적용했습니다.`
          : "기본 업무/템플릿으로 채웠습니다.";
        alert(
          `${baseMsg}\n\n일괄 등록 완료 ✅\n추가: ${added}개\n중복 스킵: ${skipped}개\n업데이트: ${updated}개`
        );
      });

      return next;
    });
  };

  // ✅ 차수 선택 후, 해당 차수에 할 일이 비어있으면 1회 자동 일괄등록
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

  const PhaseSection = ({ phase }: { phase: Phase }) => {
    const title = phaseLabel[phase];
    const items = phaseBuckets[phase];
    const undone = items.undone;
    const done = items.done;

    const pillClass =
      phase === "pre"
        ? "dashPill dashPill--pre"
        : phase === "during"
          ? "dashPill dashPill--during"
          : "dashPill dashPill--post";

    const renderRow = (t: Task) => (
      <div key={t.id} className="dashItem">
        <label>
          <input
            type="checkbox"
            checked={!!t.done}
            onChange={() => onToggle(t.id)}
            style={{ width: 18, height: 18, accentColor: "#2563eb", cursor: "pointer" }}
            aria-label="완료 토글"
          />
          <div style={{ minWidth: 0 }}>
            <div className={`dashItemTitle ${t.done ? "is-done" : ""}`}>{t.title}</div>
            <div className="dashItemDate">
              {t.dueDate} · 담당 {t.assignee?.trim() ? t.assignee : "-"}
            </div>
          </div>
        </label>

        <div className="actions">
          <button type="button" className="btn-more" title="담당자" onClick={() => onSetAssignee(t.id)}>
            담당
          </button>
          <button type="button" className="btn-edit" onClick={() => onEditOpen(t)}>
            수정
          </button>
          <button type="button" className="btn-del" onClick={() => onDelete(t.id)}>
            삭제
          </button>

          {t.templateId && (
            <button
              type="button"
              className="btn-more"
              onClick={() => setMenuOpenId((cur) => (cur === t.id ? null : t.id))}
              aria-expanded={menuOpenId === t.id}
              title="템플릿 옵션"
            >
              ⋯
            </button>
          )}
        </div>

        {t.templateId && menuOpenId === t.id && (
          <div style={{ gridColumn: "1 / -1", marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                const ok = window.confirm("이 템플릿을 모든 차수에 적용할까요?");
                if (!ok) return;
                applyTemplateToAllCohorts({
                  templateId: t.templateId!,
                  title: t.title,
                  assignee: t.assignee ?? "",
                  offsetDays: 0,
                });
                setMenuOpenId(null);
              }}
            >
              템플릿 전체 적용
            </button>
            <button
              type="button"
              className="btn btn--ghost"
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
            >
              템플릿 일괄 수정
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                const ok = window.confirm("이 템플릿으로 생성된 업무를 모두 삭제할까요?");
                if (!ok) return;
                bulkDeleteByTemplateId(t.templateId!);
                setMenuOpenId(null);
              }}
            >
              템플릿 일괄 삭제
            </button>
          </div>
        )}
      </div>
    );

    return (
      <section className="card" style={{ marginTop: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className={pillClass}>{title}</span>
            <div style={{ color: "var(--muted)", fontSize: 12 }}>
              미완료 {undone.length} · 완료 {done.length}
            </div>
          </div>

          {done.length > 0 && (
            <button
              type="button"
              className="btn btn--ghost"
              style={{ height: 34, borderRadius: 12 }}
              onClick={() => setDoneOpen((p) => ({ ...p, [phase]: !p[phase] }))}
            >
              {doneOpen[phase] ? "완료 접기" : "완료 보기"}
            </button>
          )}
        </div>

        <div className="dashList" style={{ marginTop: 10 }}>
          {undone.length === 0 && done.length === 0 ? (
            <div className="dashEmpty">등록된 업무가 없습니다.</div>
          ) : (
            <>
              {undone.map(renderRow)}
              {doneOpen[phase] && done.map(renderRow)}
            </>
          )}
        </div>
      </section>
    );
  };

  if (!ready) return <div style={{ padding: 16 }}>로딩중...</div>;

  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>할 일</h2>

        <select
          value={cohort ?? ""}
          onChange={(e) => setCohort(e.target.value as any)}
          style={{ height: 40, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)" }}
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

        <button type="button" className="btn" onClick={onAdd}>
          + 추가
        </button>

        <button type="button" className="btn btn--ghost" onClick={onBulkSeed}>
          업무 일괄 등록
        </button>

        <div style={{ flex: 1 }} />

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="검색(업무/담당자)"
          style={{ height: 40, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)" }}
        />
      </div>

      <div style={{ marginTop: 10, color: "var(--muted)", fontSize: 13 }}>
        총 {total}개 · 완료 {doneCount}개
      </div>

      <div ref={listRef} style={{ marginTop: 10 }}>
        <PhaseSection phase="pre" />
        <PhaseSection phase="during" />
        <PhaseSection phase="post" />
      </div>

      {editing && (
        <div className="modalOverlay" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: 0 }}>업무 수정</h3>

            <div className="modalField">
              <label>업무명</label>
              <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="업무명" />
            </div>

            <div className="modalField">
              <label>기한</label>
              <input value={editDate} onChange={(e) => setEditDate(e.target.value)} placeholder="YYYY-MM-DD" />
            </div>

            <div className="modalField">
              <label>구간</label>
              <select value={editPhase} onChange={(e) => setEditPhase(e.target.value as any)}>
                <option value="pre">사전</option>
                <option value="during">교육 중</option>
                <option value="post">사후</option>
              </select>
            </div>

            <div className="modalActions">
              <button type="button" className="btn btn--ghost" onClick={() => setEditing(null)}>
                취소
              </button>
              <button type="button" className="btn" onClick={onEditSave}>
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}