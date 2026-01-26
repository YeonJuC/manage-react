import { useEffect, useMemo, useRef, useState } from "react";
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
import { upsertTemplateFromTask, loadCustomTemplates, dismissTemplateForCohort } from "../store/customTemplates";

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
function phaseOf(dueDate: string, start: string, end: string): Phase {
  if (dueDate < start) return "pre";
  if (dueDate <= end) return "during";
  return "post";
}

export default function Tasks() {
  const {
    uid, ready, hydrated, cohort, setCohort, tasks, setTasksAndSave,
    applyTemplateToAllCohorts,
    bulkUpdateByTemplateId,
    bulkDeleteByTemplateId
  } = useTasksStore();

  const [editing, setEditing] = useState<Task | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editPhase, setEditPhase] = useState<Task["phase"]>("during");

  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const [confirmUpload, setConfirmUpload] = useState<null | Task>(null);
  const [uploadDone, setUploadDone] = useState(false);

  const [hideDone, setHideDone] = useState<Record<Phase, boolean>>({
    pre: true,
    during: true,
    post: true,
  });

  const [bulkEdit, setBulkEdit] = useState<null | { templateId: string; title: string; assignee: string }>(null);
  const [bulkTitle, setBulkTitle] = useState("");
  const [bulkAssignee, setBulkAssignee] = useState("");
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState<null | {
    templateId: string;
    title: string;
  }>(null);
  const [bulkDelete, setBulkDelete] = useState<null | { templateId: string; title: string }>(null);


  useEffect(() => {
    if (!bulkEdit) return;
    setBulkTitle(bulkEdit.title);
    setBulkAssignee(bulkEdit.assignee);
  }, [bulkEdit]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 480px)");

    const apply = () => {
      if (mq.matches) {
        setHideDone({ pre: true, during: true, post: true }); // 📱 모바일이면 자동 접힘
      }
    };

    apply(); // 최초 1회
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);

  useEffect(() => {
    if (!uploadDone) return;
    const id = setTimeout(() => setUploadDone(false), 2200);
    return () => clearTimeout(id);
  }, [uploadDone]);


  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setMenuOpenId(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpenId(null);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const openEdit = (t: Task) => {
    setEditing(t);
    setEditTitle(t.title);
    setEditDate(t.dueDate);
    setEditPhase(t.phase);
  };
  
  const saveEdit = () => {
    if (!editing) return;

    setTasksAndSave((prev) =>
      prev.map((t) =>
        t.id === editing.id
          ? { ...t, title: editTitle, dueDate: editDate, phase: editPhase }
          : t
      )
    );

    setEditing(null);
  };

  // 추가 폼 상태
  const [newPhase, setNewPhase] = useState<Phase>("during");
  const [newTitle, setNewTitle] = useState("");
  const [newDueDate, setNewDueDate] = useState(ymdToday());
  const [newAssignee, setNewAssignee] = useState("");
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);

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

  const onAdd = () => {
    if (!uid) return;
    if (!cohort) return;
    if (!newTitle.trim()) return;

    const title = newTitle.trim();
    const dueDate = newDueDate;
    const phase = newPhase;
    const assignee = newAssignee;

    setTasksAndSave((prev) => {
      let next = addTask(prev, { cohort, title, dueDate, phase, assignee });

      if (saveAsTemplate) {
        const added = next[next.length - 1]; // addTask가 append면 OK

        const templateId = upsertTemplateFromTask(
          { ...added, templateId: added.templateId }, 
          cohort as CohortKey
        );

        // ✅ 방금 추가한 task에 templateId/origin 저장
        next = next.map((x) =>
          x.id === added.id ? { ...x, templateId, origin: "custom" as const } : x
        );
      }

      return next;
    });

    setNewTitle("");
  };

  const bulkImport = () => {
    if (!uid || !cohort) return;

    const baseKey = cohorts.find((c) => c.label === "32기(1차)")?.key;
    if (!baseKey) return alert('cohorts에 "32기(1차)" 라벨이 없어요.');

    const base = cohortDates[baseKey as CohortKey];
    const target = cohortDates[cohort as CohortKey];
    if (!target) return alert("선택한 차수에 대한 일정 정보가 없습니다.");

    const delta = diffDays(parseYmd(target.start), parseYmd(base.start));

    let added = 0, skipped = 0, updated = 0;

    setTasksAndSave((prev) => {
      let next = prev;

      const exists = new Map<string, number>();
      next.forEach((t, idx) => exists.set(`${t.cohort}|${t.dueDate}|${t.title}`, idx));

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

      // alert는 밖에서
      queueMicrotask(() => {
        alert(`일괄 등록 완료 ✅\n추가: ${added}개\n중복 스킵: ${skipped}개\n업데이트: ${updated}개`);
      });

      return next;
    });
  };

  const Section = ({ phase }: { phase: Phase }) => {
    const list = grouped[phase];
    const doneList = list.filter((t) => t.done);
    const todoList = list.filter((t) => !t.done);
    const visibleList = hideDone[phase] ? todoList : list;

    const phaseDone = list.length > 0 && list.every((t) => t.done);

    return (
      <section className="card" style={{ padding: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h3 style={{ margin: 0 }}>
              {phaseLabel[phase]}{" "}
              <span style={{ fontSize: 12, color: "var(--muted)", marginLeft: 8 }}>
                ({todoList.length}/{list.length})
              </span>
            </h3>

            {doneList.length > 0 && (
              <button
                className="btn btn--ghost"
                style={{ height: 28, padding: "0 10px", fontSize: 12, borderRadius: 999 }}
                onClick={() =>
                  setHideDone((prev) => ({ ...prev, [phase]: !prev[phase] }))
                }
              >
                {hideDone[phase] ? `완료된 할 일 펼치기` : "완료 접기"}
              </button>
            )}

          </div>

          {hideDone[phase] && doneList.length > 0 && (
            <div style={{ fontSize: 12, color: "var(--muted)" }}>
              완료된 할 일 {doneList.length}개 숨김
            </div>
          )}

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

          {visibleList.map((t) => (
            <div
              key={t.id}
              className="card"
              style={{ padding: 12}}
            >
              <div className="dashItem">
                  <label style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
                  <input
                    type="checkbox"
                    checked={t.done}
                    onChange={() => setTasksAndSave((prev) => toggleTask(prev, t.id))}
                  />
                  <div className="dashItemContent">
                    <div
                      className={`dashItemTitle ${t.done ? "is-done" : ""}`}
                    >
                      {t.title}
                    </div>
                    <div className="dashItemDate">{t.dueDate}</div>
                  </div>
                </label>

                <div className="actions">
                  <select
                    value={t.assignee}
                    onChange={(e) => setTasksAndSave((prev) => setAssignee(prev, t.id, e.target.value))}
                    className="assigneeSelect"
                  >
                    <option value="">담당자</option>
                    <option value="차연주">차연주사원</option>
                    <option value="한원석">한원석교수</option>
                    <option value="대한상공회의소">대한상공회의소</option>
                    <option value="포스텍">포스텍</option>
                  </select>

                  <button className="btn-edit" onClick={() => openEdit(t)}>수정</button>
                  <button
                    className="btn-del"
                    onClick={() =>
                      setTasksAndSave((prev) => {
                        if (cohort && t.templateId) {
                          dismissTemplateForCohort(String(cohort), t.templateId);
                        }
                        return deleteTask(prev, t.id);
                      })
                    }
                  >
                    삭제
                  </button>
                  {/* ⋯ 메뉴 */}
                  <div className="moreWrap" ref={menuOpenId === t.id ? menuRef : null}>
                    <button
                      type="button"
                      className="btn-more"
                      aria-label="더보기"
                      aria-expanded={menuOpenId === t.id}
                      onClick={() => setMenuOpenId((cur) => (cur === t.id ? null : t.id))}
                    >
                      ⋯
                    </button>

                    {menuOpenId === t.id && (
                      <div className="moreMenu" role="menu">
                        {[
                          {
                            key: "upload",
                            label: "전 기수 업로드",
                            icon: "⤴",
                            danger: false,
                            onClick: () => {
                              if (!cohort) return;
                              setMenuOpenId(null);
                              setConfirmUpload(t); // ✅ 모달만 열기
                            },
                          },
                          ...(t.templateId
                            ? [
                                {
                                  key: "bulkEdit",
                                  label: "전 기수 일괄 수정",
                                  icon: "✏️",
                                  danger: false,
                                  onClick: () => {
                                    setMenuOpenId(null);
                                    setBulkEdit({ templateId: t.templateId!, title: t.title, assignee: t.assignee ?? "" });
                                  },
                                },
                                {
                                  key: "bulkDelete",
                                  label: "전 기수 일괄 삭제",
                                  icon: "🗑",
                                  danger: true,
                                  onClick: () => {
                                    setMenuOpenId(null);
                                    setBulkDelete({ templateId: t.templateId!, title: t.title });
                                  },
                                },
                              ]
                            : []),
                        ].map((item) => (
                          <button
                            key={item.key}
                            type="button"
                            className={`moreItem ${item.danger ? "moreItem--danger" : ""}`}
                            role="menuitem"
                            onClick={item.onClick}
                          >
                            <span className="moreIcon" aria-hidden>
                              {item.icon}
                            </span>
                            <span className="moreLabel">{item.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </div>
          ))}
        </div>
      </section>
    );
  };

  if (!ready) return <div className="card" style={{ padding: 16 }}>로딩 중…</div>;
  if (!uid) return <div className="card" style={{ padding: 16 }}>로그인이 필요합니다.</div>;
  if (!hydrated) return <div className="card" style={{ padding: 16 }}>데이터 불러오는 중…</div>;

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
            <option value="차연주">차연주사원</option>
            <option value="한원석">한원석교수</option>
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

      {editing && (
        <div className="modalOverlay" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>할 일 수정</h3>

            <div className="modalField">
              <label>제목</label>
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
            </div>

            <div className="modalField">
              <label>날짜</label>
              <input
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
              />
            </div>

            <div className="modalField">
              <label>단계</label>
              <select
                value={editPhase}
                onChange={(e) => setEditPhase(e.target.value as Task["phase"])}
              >
                <option value="pre">사전</option>
                <option value="during">교육중</option>
                <option value="post">사후</option>
              </select>
            </div>

            <div className="modalActions">
              <button className="btn btn--ghost" onClick={() => setEditing(null)}>
                취소
              </button>
              <button className="btn" onClick={saveEdit}>
                저장
              </button>
            </div>
          </div>
        </div>
      )}
      {confirmUpload && (
        <div className="modalOverlay" onClick={() => setConfirmUpload(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>전 기수 업로드</h3>

            <p style={{ marginBottom: 16, lineHeight: 1.5 }}>
              <strong>「{confirmUpload.title}」</strong>
              <br />
              이 할 일을 <b>모든 기수(32~35)</b>에 업로드할까요?
            </p>

            <div className="modalActions">
              <button
                className="btn btn--ghost"
                onClick={() => setConfirmUpload(null)}
              >
                취소
              </button>

              <button
                className="btn"
                onClick={() => {
                  if (!cohort) return;

                  const t = confirmUpload;

                  // 1) 템플릿 저장
                  const templateId = upsertTemplateFromTask(
                    { ...t, templateId: t.templateId },
                    cohort as CohortKey
                  );

                  // 2) 현재 task에도 templateId 기록
                  setTasksAndSave((prev) =>
                    prev.map((x) =>
                      x.id === t.id ? { ...x, templateId, origin: "custom" as const } : x
                    )
                  );

                  // 3) 전 기수 즉시 반영
                  const list = loadCustomTemplates();
                  const tpl = list.find((x) => x.id === templateId);

                  if (tpl) {
                    applyTemplateToAllCohorts({
                      templateId,
                      title: tpl.title,
                      assignee: tpl.assignee ?? "",
                      offsetDays: tpl.offsetDays,
                    });
                  }

                  setConfirmUpload(null);
                  setUploadDone(true); // ✅ 완료 팝업
                }}
              >
                전 기수 업로드
              </button>
            </div>
          </div>
        </div>
      )}
      {uploadDone && (
        <div className="toast">
          🎉 전 기수 업로드가 완료되었습니다
        </div>
      )}
      {bulkEdit && (
        <div className="modalOverlay" onClick={() => setBulkEdit(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>전 기수 일괄 수정</h3>

            <div className="modalField">
              <label>제목</label>
              <input value={bulkTitle} onChange={(e) => setBulkTitle(e.target.value)} />
            </div>

            <div className="modalField">
              <label>담당자</label>
              <select value={bulkAssignee} onChange={(e) => setBulkAssignee(e.target.value)}>
                <option value="">담당자</option>
                <option value="차연주">차연주사원</option>
                <option value="한원석">한원석교수</option>
                <option value="대한상공회의소">대한상공회의소</option>
                <option value="포스텍">포스텍</option>
              </select>
            </div>

            <div className="modalActions">
              <button className="btn btn--ghost" onClick={() => setBulkEdit(null)}>취소</button>
              <button
                className="btn"
                onClick={() => {
                  const title = bulkTitle.trim();
                  if (!title) return;

                  bulkUpdateByTemplateId(bulkEdit.templateId, {
                    title,
                    assignee: bulkAssignee,
                  });

                  setBulkEdit(null);
                  alert("✅ 전 기수 일괄 수정 완료");
                }}
              >
                전 기수 수정
              </button>
            </div>
          </div>
        </div>
      )}
      {bulkDelete && (
        <div className="modalOverlay" onClick={() => setBulkDelete(null)}>
          <div className="modal modal--danger" onClick={(e) => e.stopPropagation()}>
            <div className="modalHead">
              <h3 className="modalTitle">전 기수 일괄 삭제</h3>
              <button className="modalX" onClick={() => setBulkDelete(null)} aria-label="닫기">
                ✕
              </button>
            </div>

            <div className="modalBody">
              <p className="modalMain">
                <b>「{bulkDelete.title}」</b>
                <br />
                이 할 일을 <b>모든 기수(32~35)</b>에서 완전히 삭제할까요?
              </p>

              <div className="modalWarn">
                <span className="modalWarnIcon" aria-hidden>⚠️</span>
                <span>이 작업은 되돌릴 수 없습니다.</span>
              </div>
            </div>

            <div className="modalActions modalActions--right">
              <button className="btn btn--ghost" onClick={() => setBulkDelete(null)}>
                취소
              </button>
              <button
                className="btn btn--danger"
                onClick={() => {
                  // ✅ 여기서 전 기수 일괄 삭제 실행
                  bulkDeleteByTemplateId(bulkDelete.templateId); // <- TasksContext에 만든 함수명 그대로 쓰기
                  setBulkDelete(null);
                  alert("✅ 전 기수 일괄 삭제 완료");
                }}
              >
                전 기수 삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
