import React, { useEffect, useMemo, useRef, useState } from "react";
import { cohorts } from "../data/templates";
import { addTask, deleteTask, toggleTask, setAssignee } from "../store/tasks";
import { seedTasks32 } from "../data/seedTasks32";
import { cohortDates } from "../data/cohortDates";
import { useTasksStore } from "../store/TasksContext";
import { materializeTemplatesForCohort } from "../store/customTemplates";

const phaseLabel = {
  pre: "사전",
  during: "교육 중",
  post: "사후",
};

function parseYmd(ymd) {
  const [y, m, d] = String(ymd).split("-").map((n) => Number(n));
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}
function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
function fmtYmd(date) {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function diffDays(a, b) {
  const ms = 24 * 60 * 60 * 1000;
  const ax = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const bx = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((ax - bx) / ms);
}
function phaseOf(dueYmd, startYmd, endYmd) {
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

  const listRef = useRef(null);

  const [q, setQ] = useState("");
  const [menuOpenId, setMenuOpenId] = useState(null);

  const [editing, setEditing] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editPhase, setEditPhase] = useState("during");

  // ✅ 완료는 기본 접힘
  const [collapsedDone, setCollapsedDone] = useState({
    pre: true,
    during: true,
    post: true,
  });

  const sortByDateAsc = (a, b) => String(a.dueDate).localeCompare(String(b.dueDate));

  const visible = useMemo(() => {
    let arr = tasks.filter((t) => t.cohort === cohort);
    const query = q.trim();
    if (query) {
      const lower = query.toLowerCase();
      arr = arr.filter(
        (t) =>
          String(t.title || "").toLowerCase().includes(lower) ||
          String(t.assignee || "").toLowerCase().includes(lower)
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

  const phaseBuckets = useMemo(() => {
    const split = (items) => {
      const undone = items.filter((t) => !t.done).sort(sortByDateAsc);
      const done = items.filter((t) => t.done).sort(sortByDateAsc);
      return { undone, done };
    };
    return {
      pre: split(byPhase.pre),
      during: split(byPhase.during),
      post: split(byPhase.post),
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
    const target = cohortDates[cohort];
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

  const onEditOpen = (t) => {
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

    const target = cohortDates[editing.cohort];
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

  const onDelete = (id) => {
    if (!window.confirm("삭제할까요?")) return;
    setTasksAndSave((prev) => deleteTask(prev, id));
  };

  const onToggle = (id) => {
    setTasksAndSave((prev) => toggleTask(prev, id));
  };

  const onSetAssignee = (id) => {
    const who = window.prompt("담당자 이름(또는 공백)", "");
    if (who === null) return;
    setTasksAndSave((prev) => setAssignee(prev, id, who.trim()));
  };

  // ✅ 전기수(수동 포함) 복사 + 날짜 shift + phase 재계산
  const onBulkSeed = () => {
    if (!cohort) return;

    const target = cohortDates[cohort];
    if (!target) return alert("선택한 차수에 대한 일정 정보가 없습니다.");

    const cohortOrder = cohorts.map((c) => c.key);
    const idx = cohortOrder.indexOf(cohort);
    const prevCohort = idx > 0 ? cohortOrder[idx - 1] : null;
    const prevDates = prevCohort ? cohortDates[prevCohort] : null;

    let added = 0,
      skipped = 0,
      updated = 0;

    setTasksAndSave((prev) => {
      let next = prev;

      const exists = new Map();
      next.forEach((t, i) => exists.set(`${t.cohort}|${t.dueDate}|${t.title}`, i));

      const prevTasks = prevCohort ? prev.filter((t) => t.cohort === prevCohort) : [];
      const canCopyPrev = !!prevCohort && prevTasks.length > 0 && !!prevDates;

      if (canCopyPrev) {
        const delta = diffDays(parseYmd(target.start), parseYmd(prevDates.start));

        for (const src of prevTasks) {
          const title = String(src.title || "").trim();
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
            assignee: src.assignee || "",
            origin: src.origin || "custom",
            templateId: src.templateId,
          });

          exists.set(key, next.length - 1);
          added++;
        }
      } else {
        // (전기수가 없으면) seed + templates
        const baseKey = cohorts.find((c) => String(c.label || "").includes("32기"))?.key;
        const base = baseKey ? cohortDates[baseKey] : null;
        const delta = base ? diffDays(parseYmd(target.start), parseYmd(base.start)) : 0;

        for (const item of seedTasks32) {
          const title = String(item.title || "").trim();
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
            assignee: item.assignee || "",
            origin: "seed",
          });

          exists.set(key, next.length - 1);
          added++;
        }

        const tplItems = materializeTemplatesForCohort(cohort) || [];
        for (const t of tplItems) {
          const title = String(t.title || "").trim();
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
            assignee: t.assignee || "",
            templateId: t.templateId,
            origin: "custom",
          });

          exists.set(key, next.length - 1);
          added++;
        }
      }

      queueMicrotask(() => {
        const baseMsg = canCopyPrev
          ? `전기수(${prevCohort}) 업무(수동 포함)를 복사해 적용했습니다.`
          : "기본 업무/템플릿으로 채웠습니다.";
        alert(
          `${baseMsg}\n\n일괄 등록 완료 ✅\n추가: ${added}개\n중복 스킵: ${skipped}개\n업데이트: ${updated}개`
        );
      });

      return next;
    });
  };

  // ✅ 차수 이동했는데 해당 차수 task가 비어있으면 1회 자동 일괄등록
  useEffect(() => {
    if (!uid || !cohort) return;
    if (!hydrated) return;

    const key = `seeded_${uid}_${cohort}`;
    if (localStorage.getItem(key) === "1") return;

    const hasAny = tasks.some((t) => t.cohort === cohort);
    if (hasAny) return;

    localStorage.setItem(key, "1");
    onBulkSeed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, cohort, hydrated]);

  const TaskCard = ({ t }) => (
    <div className={`task-card ${t.done ? "is-done" : ""}`}>
      <button
        type="button"
        className={`check ${t.done ? "checked" : ""}`}
        onClick={() => onToggle(t.id)}
        title="완료 토글"
      >
        {t.done ? "✓" : ""}
      </button>

      <div className="task-main">
        <div className="task-title">{t.title}</div>
        <div className="task-meta">
          <span>기한 {t.dueDate}</span>
          <span>담당 {t.assignee || "-"}</span>
        </div>
      </div>

      <button
        type="button"
        className="more"
        onClick={() => setMenuOpenId((cur) => (cur === t.id ? null : t.id))}
      >
        ⋯
      </button>

      {menuOpenId === t.id && (
        <div className="menu">
          <button
            onClick={() => {
              onEditOpen(t);
              setMenuOpenId(null);
            }}
          >
            수정
          </button>
          <button
            onClick={() => {
              onSetAssignee(t.id);
              setMenuOpenId(null);
            }}
          >
            담당자
          </button>
          <button
            onClick={() => {
              onDelete(t.id);
              setMenuOpenId(null);
            }}
          >
            삭제
          </button>

          {t.templateId && applyTemplateToAllCohorts && (
            <>
              <button
                onClick={() => {
                  const ok = window.confirm("이 템플릿을 모든 차수에 적용할까요?");
                  if (!ok) return;
                  applyTemplateToAllCohorts({
                    templateId: t.templateId,
                    title: t.title,
                    assignee: t.assignee || "",
                    offsetDays: 0,
                  });
                  setMenuOpenId(null);
                }}
              >
                템플릿 전체 적용
              </button>

              {bulkUpdateByTemplateId && (
                <button
                  onClick={() => {
                    const ok = window.confirm("이 템플릿의 제목/기한을 일괄 변경할까요?");
                    if (!ok) return;
                    const nt = window.prompt("새 제목(공백이면 유지)", t.title) ?? "";
                    const nd = window.prompt("새 기한(YYYY-MM-DD, 공백이면 유지)", t.dueDate) ?? "";
                    bulkUpdateByTemplateId(t.templateId, {
                      title: nt.trim() ? nt.trim() : undefined,
                      dueDate: nd.trim() ? nd.trim() : undefined,
                    });
                    setMenuOpenId(null);
                  }}
                >
                  템플릿 일괄 수정
                </button>
              )}

              {bulkDeleteByTemplateId && (
                <button
                  onClick={() => {
                    const ok = window.confirm("이 템플릿으로 생성된 업무를 모두 삭제할까요?");
                    if (!ok) return;
                    bulkDeleteByTemplateId(t.templateId);
                    setMenuOpenId(null);
                  }}
                >
                  템플릿 일괄 삭제
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );

  const Section = ({ phase, title, items }) => {
    const isCollapsed = collapsedDone[phase];

    return (
      <section className="tasks-section">
        <div className="tasks-section-header">
          <div className="tasks-section-title">
            <span className="badge">{title}</span>
            <span className="count">
              미완료 {items.undone.length} · 완료 {items.done.length}
            </span>
          </div>
        </div>

        <div className="tasks-list">
          {items.undone.map((t) => (
            <TaskCard key={t.id} t={t} />
          ))}
          {items.undone.length === 0 && <div className="empty">미완료 할 일이 없습니다.</div>}
        </div>

        <div className="done-wrap">
          <button
            type="button"
            className="done-toggle"
            onClick={() => setCollapsedDone((prev) => ({ ...prev, [phase]: !prev[phase] }))}
          >
            {isCollapsed ? "▶" : "▼"} 완료한 할 일 ({items.done.length})
          </button>

          {!isCollapsed && (
            <div className="tasks-list done">
              {items.done.map((t) => (
                <TaskCard key={t.id} t={t} />
              ))}
              {items.done.length === 0 && <div className="empty">완료한 할 일이 없습니다.</div>}
            </div>
          )}
        </div>
      </section>
    );
  };

  if (!ready) return <div style={{ padding: 16 }}>로딩중...</div>;

  return (
    <div className="page-wrap">
      <div className="tasks-top">
        <div className="tasks-top-left">
          <div className="title">할일</div>

          <select value={cohort ?? ""} onChange={(e) => setCohort(e.target.value)} className="select">
            <option value="" disabled>
              차수 선택
            </option>
            {cohorts.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>

          <button className="btn" onClick={onAdd}>
            + 추가
          </button>

          <button className="btn" onClick={onBulkSeed}>
            업무 일괄 등록
          </button>
        </div>

        <div className="tasks-top-right">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="검색(업무/담당자)"
            className="search"
          />
        </div>
      </div>

      <div className="summary">
        총 {total}개 / 완료 {doneCount}개
      </div>

      <div ref={listRef} className="sections">
        <Section phase="pre" title="사전" items={phaseBuckets.pre} />
        <Section phase="during" title="교육 중" items={phaseBuckets.during} />
        <Section phase="post" title="사후" items={phaseBuckets.post} />
      </div>

      {editing && (
        <div className="modal-backdrop" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">업무 수정</div>

            <div className="modal-body">
              <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="input" />
              <input value={editDate} onChange={(e) => setEditDate(e.target.value)} className="input" />
              <select value={editPhase} onChange={(e) => setEditPhase(e.target.value)} className="select">
                <option value="pre">사전</option>
                <option value="during">교육 중</option>
                <option value="post">사후</option>
              </select>

              <div className="modal-actions">
                <button className="btn ghost" onClick={() => setEditing(null)}>
                  취소
                </button>
                <button className="btn" onClick={onEditSave}>
                  저장
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .page-wrap{
          min-height:100vh;
          padding:16px;
          background:#f6f7fb;
        }
        .tasks-top{
          display:flex;
          gap:12px;
          flex-wrap:wrap;
          align-items:center;
          justify-content:space-between;
        }
        .tasks-top-left{
          display:flex;
          gap:10px;
          flex-wrap:wrap;
          align-items:center;
        }
        .tasks-top-right{ display:flex; align-items:center; gap:10px; }
        .title{ font-weight:900; font-size:20px; letter-spacing:-0.3px; }

        .select{
          padding:10px 12px;
          border-radius:12px;
          border:1px solid rgba(0,0,0,0.12);
          background:#fff;
          font-weight:800;
          outline:none;
        }
        .btn{
          padding:10px 12px;
          border-radius:12px;
          border:1px solid rgba(0,0,0,0.12);
          background:#fff;
          font-weight:900;
          cursor:pointer;
        }
        .btn.ghost{ background: rgba(0,0,0,0.03); }

        .search{
          padding:10px 12px;
          border-radius:12px;
          border:1px solid rgba(0,0,0,0.12);
          background:#fff;
          min-width:220px;
          outline:none;
          font-weight:700;
        }
        .summary{ margin-top:10px; opacity:0.8; font-weight:700; }
        .sections{ margin-top:14px; display:grid; gap:14px; }

        .tasks-section{
          background: rgba(255,255,255,0.78);
          border: 1px solid rgba(0,0,0,0.07);
          border-radius:18px;
          padding:14px;
          box-shadow: 0 8px 26px rgba(0,0,0,0.05);
          backdrop-filter: blur(10px);
        }
        .tasks-section-header{
          display:flex;
          justify-content:space-between;
          align-items:center;
          margin-bottom:10px;
        }
        .tasks-section-title{ display:flex; gap:10px; align-items:center; }

        .badge{
          font-weight:900;
          padding:6px 10px;
          border-radius:999px;
          background: linear-gradient(135deg, rgba(5,80,125,0.14), rgba(5,80,125,0.05));
          border:1px solid rgba(5,80,125,0.18);
        }
        .count{ opacity:0.7; font-size:13px; font-weight:800; }

        .tasks-list{ display:grid; gap:10px; }

        .task-card{
          position:relative;
          display:flex;
          gap:10px;
          align-items:center;
          padding:12px;
          border-radius:16px;
          background:#fff;
          border:1px solid rgba(0,0,0,0.07);
        }
        .task-card.is-done{ opacity:0.75; }

        .check{
          width:34px; height:34px;
          border-radius:999px;
          border:1px solid rgba(0,0,0,0.15);
          background:#fff;
          font-weight:900;
          cursor:pointer;
        }
        .check.checked{
          background: rgba(34,197,94,0.14);
          border-color: rgba(34,197,94,0.35);
        }
        .task-main{ flex:1; min-width:0; }
        .task-title{
          font-weight:900;
          letter-spacing:-0.2px;
          white-space:nowrap;
          overflow:hidden;
          text-overflow:ellipsis;
        }
        .task-meta{
          margin-top:4px;
          font-size:13px;
          opacity:0.75;
          display:flex;
          gap:10px;
          flex-wrap:wrap;
          font-weight:700;
        }
        .more{
          border:1px solid rgba(0,0,0,0.12);
          background:#fff;
          border-radius:12px;
          padding:8px 10px;
          font-weight:900;
          cursor:pointer;
        }

        .menu{
          width:100%;
          margin-top:10px;
          display:flex;
          gap:8px;
          flex-wrap:wrap;
        }
        .menu button{
          border:1px solid rgba(0,0,0,0.12);
          background:#fff;
          border-radius:12px;
          padding:8px 10px;
          font-weight:900;
          cursor:pointer;
        }

        .done-wrap{ margin-top:10px; }
        .done-toggle{
          width:100%;
          text-align:left;
          padding:10px 12px;
          border-radius:14px;
          border:1px dashed rgba(0,0,0,0.18);
          background: rgba(0,0,0,0.03);
          font-weight:900;
          cursor:pointer;
        }
        .tasks-list.done .task-card{ background: rgba(255,255,255,0.85); }

        .empty{
          padding:12px;
          border-radius:14px;
          background: rgba(0,0,0,0.03);
          border: 1px dashed rgba(0,0,0,0.12);
          opacity:0.75;
          font-weight:800;
        }

        .modal-backdrop{
          position:fixed;
          inset:0;
          background: rgba(0,0,0,0.35);
          display:grid;
          place-items:center;
          padding:16px;
          z-index:50;
        }
        .modal{
          width:min(520px,100%);
          background:#fff;
          border-radius:18px;
          border:1px solid rgba(0,0,0,0.10);
          box-shadow: 0 18px 60px rgba(0,0,0,0.18);
          padding:14px;
        }
        .modal-title{ font-weight:900; font-size:16px; margin-bottom:10px; }
        .modal-body{ display:grid; gap:10px; }
        .input{
          padding:10px 12px;
          border-radius:12px;
          border:1px solid rgba(0,0,0,0.12);
          outline:none;
          font-weight:800;
        }
        .modal-actions{
          display:flex;
          justify-content:flex-end;
          gap:10px;
          margin-top:6px;
        }

        @media (max-width: 420px){
          .search{ min-width: 160px; width: 100%; }
          .tasks-top-right{ width: 100%; }
        }
      `}</style>
    </div>
  );
}