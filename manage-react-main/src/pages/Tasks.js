import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from "react";
import { cohorts } from "../data/templates";
import { addTask, deleteTask, toggleTask, setAssignee, } from "../store/tasks";
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
    const [y, m, d] = ymd.split("-").map((n) => Number(n));
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
    if (due < start)
        return "pre";
    if (due > end)
        return "post";
    return "during";
}
export default function Tasks() {
    const { uid, ready, hydrated, cohort, setCohort, tasks, setTasksAndSave, applyTemplateToAllCohorts, bulkUpdateByTemplateId, bulkDeleteByTemplateId, } = useTasksStore();
    const ASSIGNEE_OPTIONS = [
        { value: "", label: "담당자" },
        { value: "차연주", label: "차연주사원" },
        { value: "한원석", label: "한원석교수" },
        { value: "포스텍", label: "포스텍" },
        { value: "대한상공회의소", label: "대한상공회의소" },
    ];
    // 완료 항목 접기/펼치기(기본: 접힘)
    const [doneOpen, setDoneOpen] = useState({
        pre: false,
        during: false,
        post: false,
    });
    const [editing, setEditing] = useState(null);
    const [editTitle, setEditTitle] = useState("");
    const [editDate, setEditDate] = useState("");
    const [editPhase, setEditPhase] = useState("during");
    const [menuOpenId, setMenuOpenId] = useState(null);
    const listRef = useRef(null);
    const [q, setQ] = useState("");
    const visible = useMemo(() => {
        let arr = tasks.filter((t) => t.cohort === cohort);
        const query = q.trim();
        if (query) {
            const lower = query.toLowerCase();
            arr = arr.filter((t) => t.title.toLowerCase().includes(lower) ||
                (t.assignee ?? "").toLowerCase().includes(lower));
        }
        return arr;
    }, [tasks, cohort, q]);
    const byPhase = useMemo(() => {
        const pre = visible.filter((t) => t.phase === "pre");
        const during = visible.filter((t) => t.phase === "during");
        const post = visible.filter((t) => t.phase === "post");
        return { pre, during, post };
    }, [visible]);
    const sortByDateAsc = (a, b) => a.dueDate.localeCompare(b.dueDate);
    const splitAndSort = (items) => {
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
        if (!cohort)
            return;
        const title = window.prompt("업무명을 입력하세요");
        if (!title || !title.trim())
            return;
        const dueDate = window.prompt("기한(YYYY-MM-DD) 입력", "");
        if (!dueDate || !dueDate.trim())
            return;
        const due = dueDate.trim();
        const target = cohortDates[cohort];
        const phase = target ? phaseOf(due, target.start, target.end) : "during";
        setTasksAndSave((prev) => addTask(prev, {
            cohort,
            title: title.trim(),
            dueDate: due,
            phase,
            assignee: "",
            origin: "custom",
        }));
    };
    const onEditOpen = (t) => {
        setEditing(t);
        setEditTitle(t.title);
        setEditDate(t.dueDate);
        setEditPhase(t.phase);
    };
    const onEditSave = () => {
        if (!editing)
            return;
        const title = editTitle.trim();
        const dueDate = editDate.trim();
        if (!title || !dueDate)
            return;
        const target = cohortDates[editing.cohort];
        const phase = target ? phaseOf(dueDate, target.start, target.end) : editPhase;
        setTasksAndSave((prev) => {
            const idx = prev.findIndex((x) => x.id === editing.id);
            if (idx < 0)
                return prev;
            const copy = [...prev];
            copy[idx] = { ...copy[idx], title, dueDate, phase };
            return copy;
        });
        setEditing(null);
    };
    const onDelete = (id) => {
        if (!window.confirm("삭제할까요?"))
            return;
        setTasksAndSave((prev) => deleteTask(prev, id));
    };
    const onToggle = (id) => {
        setTasksAndSave((prev) => toggleTask(prev, id));
    };
    const onSetAssignee = (id) => {
        const who = window.prompt("담당자 이름(또는 공백)", "");
        if (who === null)
            return;
        setTasksAndSave((prev) => setAssignee(prev, id, who.trim()));
    };
    const onBulkSeed = () => {
        if (!cohort)
            return;
        const target = cohortDates[cohort];
        if (!target)
            return alert("선택한 차수에 대한 일정 정보가 없습니다.");
        const cohortOrder = cohorts.map((c) => c.key);
        const idx = cohortOrder.indexOf(cohort);
        const prevCohort = idx > 0 ? cohortOrder[idx - 1] : null;
        const prevDates = prevCohort ? cohortDates[prevCohort] : null;
        let added = 0, skipped = 0, updated = 0;
        setTasksAndSave((prev) => {
            let next = prev;
            const exists = new Map();
            next.forEach((t, i) => exists.set(`${t.cohort}|${t.dueDate}|${t.title}`, i));
            const prevTasks = prevCohort ? prev.filter((t) => t.cohort === prevCohort) : [];
            const canCopyPrev = !!prevCohort && prevTasks.length > 0 && !!prevDates;
            if (canCopyPrev) {
                const delta = diffDays(parseYmd(target.start), parseYmd(prevDates.start));
                for (const src of prevTasks) {
                    const title = (src.title ?? "").trim();
                    if (!title || !src.dueDate)
                        continue;
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
                        origin: src.origin ?? "custom",
                        templateId: src.templateId,
                    });
                    exists.set(key, next.length - 1);
                    added++;
                }
            }
            else {
                const baseKey = cohorts.find((c) => c.label.includes("32기"))?.key;
                const base = baseKey ? cohortDates[baseKey] : null;
                const delta = base ? diffDays(parseYmd(target.start), parseYmd(base.start)) : 0;
                for (const item of seedTasks32) {
                    const title = (item.title ?? "").trim();
                    if (!title || !item.dueDate)
                        continue;
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
                const tplItems = materializeTemplatesForCohort(cohort);
                for (const t of tplItems) {
                    const title = (t.title ?? "").trim();
                    if (!title || !t.dueDate)
                        continue;
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
                        templateId: t.templateId,
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
                alert(`${baseMsg}\n\n일괄 등록 완료 ✅\n추가: ${added}개\n중복 스킵: ${skipped}개\n업데이트: ${updated}개`);
            });
            return next;
        });
    };
    useEffect(() => {
        if (!uid || !cohort)
            return;
        if (!hydrated)
            return;
        const alreadyKey = `seeded_${uid}_${cohort}`;
        if (localStorage.getItem(alreadyKey) === "1")
            return;
        const hasAny = tasks.some((t) => t.cohort === cohort);
        if (hasAny)
            return;
        localStorage.setItem(alreadyKey, "1");
        onBulkSeed();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [uid, cohort, hydrated]);
    const PhaseSection = ({ phase }) => {
        const title = phaseLabel[phase];
        const items = phaseBuckets[phase];
        const undone = items.undone;
        const done = items.done;
        const pillClass = phase === "pre"
            ? "dashPill dashPill--pre"
            : phase === "during"
                ? "dashPill dashPill--during"
                : "dashPill dashPill--post";
        const renderRow = (t) => (_jsxs("div", { className: "dashItem", children: [_jsxs("label", { children: [_jsx("input", { type: "checkbox", checked: !!t.done, onChange: () => onToggle(t.id), style: { width: 18, height: 18, accentColor: "#2563eb", cursor: "pointer" }, "aria-label": "\uC644\uB8CC \uD1A0\uAE00" }), _jsxs("div", { style: { minWidth: 0 }, children: [_jsx("div", { className: `dashItemTitle ${t.done ? "is-done" : ""}`, children: t.title }), _jsxs("div", { className: "dashItemDate", children: [t.dueDate, " \u00B7 \uB2F4\uB2F9 ", t.assignee?.trim() ? t.assignee : "-"] })] })] }), _jsxs("div", { className: "actions", children: [_jsx("select", { className: "assigneeSelect", value: t.assignee ?? "", onChange: (e) => setTasksAndSave((prev) => setAssignee(prev, t.id, e.target.value)), "aria-label": "\uB2F4\uB2F9\uC790 \uC120\uD0DD", children: ASSIGNEE_OPTIONS.map((o) => (_jsx("option", { value: o.value, children: o.label }, o.value))) }), _jsx("button", { type: "button", className: "btn-edit", onClick: () => onEditOpen(t), children: "\uC218\uC815" }), _jsx("button", { type: "button", className: "btn-del", onClick: () => onDelete(t.id), children: "\uC0AD\uC81C" }), t.templateId && (_jsx("button", { type: "button", className: "btn-more", onClick: () => setMenuOpenId((cur) => (cur === t.id ? null : t.id)), "aria-expanded": menuOpenId === t.id, title: "\uD15C\uD50C\uB9BF \uC635\uC158", children: "\u22EF" }))] }), t.templateId && menuOpenId === t.id && (_jsxs("div", { style: { gridColumn: "1 / -1", marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }, children: [_jsx("button", { type: "button", className: "btn btn--ghost", onClick: () => {
                                const ok = window.confirm("이 템플릿을 모든 차수에 적용할까요?");
                                if (!ok)
                                    return;
                                applyTemplateToAllCohorts({
                                    templateId: t.templateId,
                                    title: t.title,
                                    assignee: t.assignee ?? "",
                                    offsetDays: 0,
                                });
                                setMenuOpenId(null);
                            }, children: "\uD15C\uD50C\uB9BF \uC804\uCCB4 \uC801\uC6A9" }), _jsx("button", { type: "button", className: "btn btn--ghost", onClick: () => {
                                const ok = window.confirm("이 템플릿의 제목/기한을 일괄 변경할까요?");
                                if (!ok)
                                    return;
                                const nt = window.prompt("새 제목(공백이면 유지)", t.title) ?? "";
                                const nd = window.prompt("새 기한(YYYY-MM-DD, 공백이면 유지)", t.dueDate) ?? "";
                                bulkUpdateByTemplateId(t.templateId, {
                                    title: nt.trim() ? nt.trim() : undefined,
                                    dueDate: nd.trim() ? nd.trim() : undefined,
                                });
                                setMenuOpenId(null);
                            }, children: "\uD15C\uD50C\uB9BF \uC77C\uAD04 \uC218\uC815" }), _jsx("button", { type: "button", className: "btn btn--ghost", onClick: () => {
                                const ok = window.confirm("이 템플릿으로 생성된 업무를 모두 삭제할까요?");
                                if (!ok)
                                    return;
                                bulkDeleteByTemplateId(t.templateId);
                                setMenuOpenId(null);
                            }, children: "\uD15C\uD50C\uB9BF \uC77C\uAD04 \uC0AD\uC81C" })] }))] }, t.id));
        return (_jsxs("section", { className: "card", style: { marginTop: 14 }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 10 }, children: [_jsx("span", { className: pillClass, children: title }), _jsxs("div", { style: { color: "var(--muted)", fontSize: 12 }, children: ["\uBBF8\uC644\uB8CC ", undone.length, " \u00B7 \uC644\uB8CC ", done.length] })] }), done.length > 0 && (_jsx("button", { type: "button", className: "btn btn--ghost", style: { height: 34, borderRadius: 12 }, onClick: () => setDoneOpen((p) => ({ ...p, [phase]: !p[phase] })), children: doneOpen[phase] ? "완료 접기" : "완료 보기" }))] }), _jsx("div", { className: "dashList", style: { marginTop: 10 }, ref: listRef, children: undone.length === 0 && done.length === 0 ? (_jsx("div", { className: "dashEmpty", children: "\uB4F1\uB85D\uB41C \uC5C5\uBB34\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4." })) : (_jsxs(_Fragment, { children: [undone.map(renderRow), doneOpen[phase] && done.map(renderRow)] })) })] }));
    };
    if (!ready)
        return _jsx("div", { style: { padding: 16 }, children: "\uB85C\uB529\uC911..." });
    return (_jsxs("div", { children: [_jsxs("div", { style: { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }, children: [_jsx("h2", { style: { margin: 0 }, children: "\uD560 \uC77C" }), _jsxs("select", { value: cohort ?? "", onChange: (e) => setCohort(e.target.value), style: { height: 40, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)" }, children: [_jsx("option", { value: "", disabled: true, children: "\uCC28\uC218 \uC120\uD0DD" }), cohorts.map((c) => (_jsx("option", { value: c.key, children: c.label }, c.key)))] }), _jsx("button", { type: "button", className: "btn", onClick: onAdd, children: "+ \uCD94\uAC00" }), _jsx("button", { type: "button", className: "btn btn--ghost", onClick: onBulkSeed, children: "\uC5C5\uBB34 \uC77C\uAD04 \uB4F1\uB85D" }), _jsx("div", { style: { flex: 1 } }), _jsx("input", { value: q, onChange: (e) => setQ(e.target.value), placeholder: "\uAC80\uC0C9(\uC5C5\uBB34/\uB2F4\uB2F9\uC790)", style: { height: 40, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)" } })] }), _jsxs("div", { style: { marginTop: 10, color: "var(--muted)", fontSize: 13 }, children: ["\uCD1D ", total, "\uAC1C \u00B7 \uC644\uB8CC ", doneCount, "\uAC1C"] }), _jsxs("div", { style: { marginTop: 10 }, children: [_jsx(PhaseSection, { phase: "pre" }), _jsx(PhaseSection, { phase: "during" }), _jsx(PhaseSection, { phase: "post" })] }), editing && (_jsx("div", { className: "modalOverlay", onClick: () => setEditing(null), children: _jsxs("div", { className: "modal", onClick: (e) => e.stopPropagation(), children: [_jsx("h3", { style: { margin: 0 }, children: "\uC5C5\uBB34 \uC218\uC815" }), _jsxs("div", { className: "modalField", children: [_jsx("label", { children: "\uC5C5\uBB34\uBA85" }), _jsx("input", { value: editTitle, onChange: (e) => setEditTitle(e.target.value), placeholder: "\uC5C5\uBB34\uBA85" })] }), _jsxs("div", { className: "modalField", children: [_jsx("label", { children: "\uAE30\uD55C" }), _jsx("input", { value: editDate, onChange: (e) => setEditDate(e.target.value), placeholder: "YYYY-MM-DD" })] }), _jsxs("div", { className: "modalField", children: [_jsx("label", { children: "\uAD6C\uAC04" }), _jsxs("select", { value: editPhase, onChange: (e) => setEditPhase(e.target.value), children: [_jsx("option", { value: "pre", children: "\uC0AC\uC804" }), _jsx("option", { value: "during", children: "\uAD50\uC721 \uC911" }), _jsx("option", { value: "post", children: "\uC0AC\uD6C4" })] })] }), _jsxs("div", { className: "modalActions", children: [_jsx("button", { type: "button", className: "btn btn--ghost", onClick: () => setEditing(null), children: "\uCDE8\uC18C" }), _jsx("button", { type: "button", className: "btn", onClick: onEditSave, children: "\uC800\uC7A5" })] })] }) }))] }));
}
