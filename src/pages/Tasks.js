import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from "react";
import { cohorts } from "../data/templates";
import { addTask, deleteTask, toggleTask, setAssignee, } from "../store/tasks";
import { seedTasks32 } from "../data/seedTasks32";
import { cohortDates } from "../data/cohortDates";
import { useTasksStore } from "../store/TasksContext";
import { upsertTemplateFromTask, loadCustomTemplates, dismissTemplateForCohort, materializeTemplatesForCohort, } from "../store/customTemplates";
const phaseLabel = {
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
function parseYmd(s) {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
}
function fmtYmd(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}
function addDays(date, n) {
    const copy = new Date(date);
    copy.setDate(copy.getDate() + n);
    return copy;
}
function diffDays(a, b) {
    const ms = a.getTime() - b.getTime();
    return Math.round(ms / (1000 * 60 * 60 * 24));
}
function phaseOf(dueDate, start, end) {
    if (dueDate < start)
        return "pre";
    if (dueDate <= end)
        return "during";
    return "post";
}
export default function Tasks() {
    const scrollYRef = useRef(0);
    const saveScroll = () => {
        scrollYRef.current = window.scrollY || 0;
    };
    const restoreScroll = () => {
        const y = scrollYRef.current;
        requestAnimationFrame(() => {
            requestAnimationFrame(() => window.scrollTo({ top: y }));
        });
    };
    const { uid, ready, hydrated, cohort, setCohort, tasks, setTasksAndSave, applyTemplateToAllCohorts, bulkUpdateByTemplateId, bulkDeleteByTemplateId } = useTasksStore();
    const [editing, setEditing] = useState(null);
    const [editTitle, setEditTitle] = useState("");
    const [editDate, setEditDate] = useState("");
    const [editPhase, setEditPhase] = useState("during");
    const [menuOpenId, setMenuOpenId] = useState(null);
    const menuRef = useRef(null);
    const [confirmUpload, setConfirmUpload] = useState(null);
    const [uploadDone, setUploadDone] = useState(false);
    const [hideDone, setHideDone] = useState({
        pre: true,
        during: true,
        post: true,
    });
    const [bulkEdit, setBulkEdit] = useState(null);
    const [bulkTitle, setBulkTitle] = useState("");
    const [bulkAssignee, setBulkAssignee] = useState("");
    const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(null);
    const [bulkDelete, setBulkDelete] = useState(null);
    useEffect(() => {
        if (!bulkEdit)
            return;
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
        if (!uploadDone)
            return;
        const id = setTimeout(() => setUploadDone(false), 2200);
        return () => clearTimeout(id);
    }, [uploadDone]);
    useEffect(() => {
        const onDown = (e) => {
            if (!menuRef.current)
                return;
            if (!menuRef.current.contains(e.target))
                setMenuOpenId(null);
        };
        const onKey = (e) => {
            if (e.key === "Escape")
                setMenuOpenId(null);
        };
        window.addEventListener("mousedown", onDown);
        window.addEventListener("keydown", onKey);
        return () => {
            window.removeEventListener("mousedown", onDown);
            window.removeEventListener("keydown", onKey);
        };
    }, []);
    const openEdit = (t) => {
        setEditing(t);
        setEditTitle(t.title);
        setEditDate(t.dueDate);
        setEditPhase(t.phase);
    };
    const saveEdit = () => {
        if (!editing)
            return;
        setTasksAndSave((prev) => prev.map((t) => t.id === editing.id
            ? { ...t, title: editTitle, dueDate: editDate, phase: editPhase }
            : t));
        setEditing(null);
    };
    // 추가 폼 상태
    const [newPhase, setNewPhase] = useState("during");
    const [newTitle, setNewTitle] = useState("");
    const [newDueDate, setNewDueDate] = useState(ymdToday());
    const [newAssignee, setNewAssignee] = useState("");
    const [saveAsTemplate, setSaveAsTemplate] = useState(false);
    const filtered = useMemo(() => {
        if (!cohort)
            return [];
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
        if (!uid)
            return;
        if (!cohort)
            return;
        if (!newTitle.trim())
            return;
        const title = newTitle.trim();
        const dueDate = newDueDate;
        const phase = newPhase;
        const assignee = newAssignee;
        setTasksAndSave((prev) => {
            let next = addTask(prev, { cohort, title, dueDate, phase, assignee });
            if (saveAsTemplate) {
                const added = next[next.length - 1]; // addTask가 append면 OK
                const templateId = upsertTemplateFromTask({ ...added, templateId: added.templateId }, cohort);
                // ✅ 방금 추가한 task에 templateId/origin 저장
                next = next.map((x) => x.id === added.id ? { ...x, templateId, origin: "custom" } : x);
            }
            return next;
        });
        setNewTitle("");
    };
    const bulkImport = () => {
        if (!uid || !cohort)
            return;
        const baseKey = cohorts.find((c) => c.label === "32기(1차)")?.key;
        if (!baseKey)
            return alert('cohorts에 "32기(1차)" 라벨이 없어요.');
        const base = cohortDates[baseKey];
        const target = cohortDates[cohort];
        if (!target)
            return alert("선택한 차수에 대한 일정 정보가 없습니다.");
        const delta = diffDays(parseYmd(target.start), parseYmd(base.start));
        let added = 0, skipped = 0, updated = 0;
        setTasksAndSave((prev) => {
            let next = prev;
            const exists = new Map();
            next.forEach((t, idx) => exists.set(`${t.cohort}|${t.dueDate}|${t.title}`, idx));
            // 1) ✅ 32기 기본 업무일지(seed) → 차수 시작일 기준으로 날짜 shift
            for (const item of seedTasks32) {
                const title = item.title?.trim();
                if (!title || !item.dueDate)
                    continue;
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
            // 2) ✅ 사용자가 32기에서 '템플릿으로 저장'해둔 커스텀 업무도 같이 적용
            //    - 템플릿은 offsetDays 기반이어서 목표 차수 start만 알면 자동 계산됨
            //    - phase는 목표 차수 기간 기준으로 다시 계산(기간 밖으로 나가면 pre/post로 보정)
            const tplItems = materializeTemplatesForCohort(cohort);
            for (const t of tplItems) {
                const title = t.title?.trim();
                if (!title || !t.dueDate)
                    continue;
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
                    templateId: t.templateId,
                    origin: "custom",
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
    // ✅ 차수 선택 후, 해당 차수에 할 일이 비어있다면 1회 자동으로 "일괄 등록" 실행
    //    (반복 실행 방지: ownerUid+cohort 기준으로 로컬에 기록)
    useEffect(() => {
        if (!uid || !cohort)
            return;
        if (!hydrated)
            return;
        const already = (() => {
            try {
                const key = `manage-react:bulkImported:${uid}:${cohort}`;
                return localStorage.getItem(key) === "1";
            }
            catch {
                return false;
            }
        })();
        if (already)
            return;
        const hasAny = tasks.some((t) => t.cohort === cohort);
        if (hasAny) {
            try {
                localStorage.setItem(`manage-react:bulkImported:${uid}:${cohort}`, "1");
            }
            catch {
                // ignore
            }
            return;
        }
        // 비어있으면 자동 등록
        bulkImport();
        try {
            localStorage.setItem(`manage-react:bulkImported:${uid}:${cohort}`, "1");
        }
        catch {
            // ignore
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [uid, cohort, hydrated]);
    const Section = ({ phase }) => {
        const list = grouped[phase];
        const doneList = list.filter((t) => t.done);
        const todoList = list.filter((t) => !t.done);
        const visibleList = hideDone[phase] ? todoList : list;
        const phaseDone = list.length > 0 && list.every((t) => t.done);
        return (_jsxs("section", { className: "card", style: { padding: 14 }, children: [_jsxs("div", { className: "doneHeader", style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 10 }, children: [_jsxs("h3", { style: { margin: 0 }, children: [phaseLabel[phase], " ", _jsxs("span", { style: { fontSize: 12, color: "var(--muted)", marginLeft: 8 }, children: ["(", todoList.length, "/", list.length, ")"] })] }), doneList.length > 0 && (_jsx("button", { className: "btn btn--ghost doneToggleBtn", style: { borderRadius: 999 }, onClick: () => {
                                        saveScroll(); // ⭐ 현재 위치 저장
                                        setHideDone((prev) => ({ ...prev, [phase]: !prev[phase] }));
                                        restoreScroll(); // ⭐ 다시 원위치
                                    }, children: hideDone[phase] ? `완료된 할 일 펼치기` : "완료 접기" }))] }), hideDone[phase] && doneList.length > 0 && (_jsxs("div", { className: "doneHiddenText", style: { fontSize: 12, color: "var(--muted)" }, children: ["\uC644\uB8CC\uB41C \uD560 \uC77C ", doneList.length, "\uAC1C \uC228\uAE40"] })), _jsx("span", { className: "phaseBadge", style: {
                                borderRadius: 999,
                                border: "1px solid var(--border)",
                                background: phaseDone ? "rgba(34,197,94,0.12)" : "rgba(59,130,246,0.08)",
                            }, children: list.length === 0 ? "없음" : phaseDone ? "완료" : "진행 중" })] }), _jsxs("div", { style: { display: "grid", gap: 8, marginTop: 12 }, children: [list.length === 0 && _jsx("div", { style: { color: "var(--muted)" }, children: "\uB4F1\uB85D\uB41C \uD560 \uC77C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." }), visibleList.map((t) => (_jsx("div", { className: "card", style: { padding: 12 }, children: _jsxs("div", { className: "dashItem", children: [_jsxs("label", { style: { display: "flex", gap: 10, alignItems: "center", minWidth: 0 }, children: [_jsx("input", { type: "checkbox", checked: t.done, onChange: () => {
                                                    saveScroll();
                                                    setTasksAndSave((prev) => toggleTask(prev, t.id));
                                                    restoreScroll();
                                                } }), _jsxs("div", { className: "dashItemContent", children: [_jsx("div", { className: `dashItemTitle ${t.done ? "is-done" : ""}`, children: t.title }), _jsx("div", { className: "dashItemDate", children: t.dueDate })] })] }), _jsxs("div", { className: "actions", children: [_jsxs("select", { value: t.assignee, onChange: (e) => {
                                                    saveScroll();
                                                    const v = e.target.value;
                                                    setTasksAndSave((prev) => setAssignee(prev, t.id, v));
                                                    restoreScroll();
                                                }, className: "assigneeSelect", children: [_jsx("option", { value: "", children: "\uB2F4\uB2F9\uC790" }), _jsx("option", { value: "\uCC28\uC5F0\uC8FC", children: "\uCC28\uC5F0\uC8FC\uC0AC\uC6D0" }), _jsx("option", { value: "\uD55C\uC6D0\uC11D", children: "\uD55C\uC6D0\uC11D\uAD50\uC218" }), _jsx("option", { value: "\uB300\uD55C\uC0C1\uACF5\uD68C\uC758\uC18C", children: "\uB300\uD55C\uC0C1\uACF5\uD68C\uC758\uC18C" }), _jsx("option", { value: "\uD3EC\uC2A4\uD14D", children: "\uD3EC\uC2A4\uD14D" })] }), _jsx("button", { className: "btn-edit", onClick: () => openEdit(t), children: "\uC218\uC815" }), _jsx("button", { className: "btn-del", onClick: () => setTasksAndSave((prev) => {
                                                    if (cohort && t.templateId) {
                                                        dismissTemplateForCohort(String(cohort), t.templateId);
                                                    }
                                                    return deleteTask(prev, t.id);
                                                }), children: "\uC0AD\uC81C" }), _jsxs("div", { className: "moreWrap", ref: menuOpenId === t.id ? menuRef : null, children: [_jsx("button", { type: "button", className: "btn-more", "aria-label": "\uB354\uBCF4\uAE30", "aria-expanded": menuOpenId === t.id, onClick: () => setMenuOpenId((cur) => (cur === t.id ? null : t.id)), children: "\u22EF" }), menuOpenId === t.id && (_jsx("div", { className: "moreMenu", role: "menu", children: [
                                                            {
                                                                key: "upload",
                                                                label: "전 기수 업로드",
                                                                icon: "⤴",
                                                                danger: false,
                                                                onClick: () => {
                                                                    if (!cohort)
                                                                        return;
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
                                                                            setBulkEdit({ templateId: t.templateId, title: t.title, assignee: t.assignee ?? "" });
                                                                        },
                                                                    },
                                                                    {
                                                                        key: "bulkDelete",
                                                                        label: "전 기수 일괄 삭제",
                                                                        icon: "🗑",
                                                                        danger: true,
                                                                        onClick: () => {
                                                                            setMenuOpenId(null);
                                                                            setBulkDelete({ templateId: t.templateId, title: t.title });
                                                                        },
                                                                    },
                                                                ]
                                                                : []),
                                                        ].map((item) => (_jsxs("button", { type: "button", className: `moreItem ${item.danger ? "moreItem--danger" : ""}`, role: "menuitem", onClick: item.onClick, children: [_jsx("span", { className: "moreIcon", "aria-hidden": true, children: item.icon }), _jsx("span", { className: "moreLabel", children: item.label })] }, item.key))) }))] })] })] }) }, t.id)))] })] }));
    };
    if (!ready)
        return _jsx("div", { className: "card", style: { padding: 16 }, children: "\uB85C\uB529 \uC911\u2026" });
    if (!uid)
        return _jsx("div", { className: "card", style: { padding: 16 }, children: "\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." });
    if (!hydrated)
        return _jsx("div", { className: "card", style: { padding: 16 }, children: "\uB370\uC774\uD130 \uBD88\uB7EC\uC624\uB294 \uC911\u2026" });
    return (_jsxs("div", { children: [_jsx("h1", { children: "\uD560 \uC77C" }), _jsx("div", { className: "card", style: { marginTop: 12 }, children: _jsxs("div", { style: { display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }, children: [_jsx("strong", { children: "\uCC28\uC218 \uC120\uD0DD" }), _jsxs("select", { value: cohort, onChange: (e) => setCohort(e.target.value), style: { height: 36, padding: "0 10px", borderRadius: 10, border: "1px solid var(--border)" }, children: [_jsx("option", { value: "", children: "\uC120\uD0DD\uD558\uC138\uC694" }), cohorts.map((c) => (_jsx("option", { value: c.key, children: c.label }, c.key)))] }), cohort && (_jsxs("span", { className: "progressText", style: { color: "var(--muted)" }, children: ["\uC804\uCCB4 \uC644\uB8CC ", doneCount, " / ", totalCount, totalCount > 0 && ` (${Math.round((doneCount / totalCount) * 100)}%)`] }))] }) }), _jsx("div", { className: "card", style: { marginTop: 12, padding: 14 }, children: _jsxs("div", { style: { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }, children: [_jsx("strong", { children: "\uD560 \uC77C \uCD94\uAC00" }), _jsxs("select", { value: newPhase, onChange: (e) => setNewPhase(e.target.value), style: { height: 36, padding: "0 10px", borderRadius: 10, border: "1px solid var(--border)" }, children: [_jsx("option", { value: "pre", children: "\uC0AC\uC804" }), _jsx("option", { value: "during", children: "\uAD50\uC721 \uC911" }), _jsx("option", { value: "post", children: "\uC0AC\uD6C4" })] }), _jsx("input", { value: newTitle, onChange: (e) => setNewTitle(e.target.value), placeholder: "\uD560 \uC77C \uC81C\uBAA9", style: { height: 36, padding: "0 10px", borderRadius: 10, border: "1px solid var(--border)", width: 260 } }), _jsx("input", { type: "date", value: newDueDate, onChange: (e) => setNewDueDate(e.target.value), style: { height: 36, padding: "0 10px", borderRadius: 10, border: "1px solid var(--border)" } }), _jsxs("select", { value: newAssignee, onChange: (e) => setNewAssignee(e.target.value), style: { height: 36, padding: "0 10px", borderRadius: 10, border: "1px solid var(--border)" }, children: [_jsx("option", { value: "", children: "\uB2F4\uB2F9\uC790" }), _jsx("option", { value: "\uCC28\uC5F0\uC8FC", children: "\uCC28\uC5F0\uC8FC\uC0AC\uC6D0" }), _jsx("option", { value: "\uD55C\uC6D0\uC11D", children: "\uD55C\uC6D0\uC11D\uAD50\uC218" }), _jsx("option", { value: "\uB300\uD55C\uC0C1\uACF5\uD68C\uC758\uC18C", children: "\uB300\uD55C\uC0C1\uACF5\uD68C\uC758\uC18C" }), _jsx("option", { value: "\uD3EC\uC2A4\uD14D", children: "\uD3EC\uC2A4\uD14D" })] }), _jsx("button", { className: "btn", style: { height: 36, borderRadius: 10 }, disabled: !cohort, onClick: onAdd, children: "\uCD94\uAC00" }), cohort && (_jsx("button", { className: "btn btn--ghost", onClick: bulkImport, style: { marginLeft: "auto", fontWeight: 800 }, children: "\uC77C\uAD04 \uB4F1\uB85D(\uC5C5\uBB34\uC77C\uC9C0)" })), !cohort && _jsx("span", { style: { color: "var(--muted)" }, children: "\uCC28\uC218\uB97C \uBA3C\uC800 \uC120\uD0DD\uD574\uC918." })] }) }), _jsxs("div", { style: { marginTop: 12, display: "grid", gap: 12 }, children: [_jsx(Section, { phase: "pre" }), _jsx(Section, { phase: "during" }), _jsx(Section, { phase: "post" })] }), editing && (_jsx("div", { className: "modalOverlay", onClick: () => setEditing(null), children: _jsxs("div", { className: "modal", onClick: (e) => e.stopPropagation(), children: [_jsx("h3", { style: { marginTop: 0 }, children: "\uD560 \uC77C \uC218\uC815" }), _jsxs("div", { className: "modalField", children: [_jsx("label", { children: "\uC81C\uBAA9" }), _jsx("input", { value: editTitle, onChange: (e) => setEditTitle(e.target.value) })] }), _jsxs("div", { className: "modalField", children: [_jsx("label", { children: "\uB0A0\uC9DC" }), _jsx("input", { type: "date", value: editDate, onChange: (e) => setEditDate(e.target.value) })] }), _jsxs("div", { className: "modalField", children: [_jsx("label", { children: "\uB2E8\uACC4" }), _jsxs("select", { value: editPhase, onChange: (e) => setEditPhase(e.target.value), children: [_jsx("option", { value: "pre", children: "\uC0AC\uC804" }), _jsx("option", { value: "during", children: "\uAD50\uC721\uC911" }), _jsx("option", { value: "post", children: "\uC0AC\uD6C4" })] })] }), _jsxs("div", { className: "modalActions", children: [_jsx("button", { className: "btn btn--ghost", onClick: () => setEditing(null), children: "\uCDE8\uC18C" }), _jsx("button", { className: "btn", onClick: saveEdit, children: "\uC800\uC7A5" })] })] }) })), confirmUpload && (_jsx("div", { className: "modalOverlay", onClick: () => setConfirmUpload(null), children: _jsxs("div", { className: "modal", onClick: (e) => e.stopPropagation(), children: [_jsx("h3", { style: { marginTop: 0 }, children: "\uC804 \uAE30\uC218 \uC5C5\uB85C\uB4DC" }), _jsxs("p", { style: { marginBottom: 16, lineHeight: 1.5 }, children: [_jsxs("strong", { children: ["\u300C", confirmUpload.title, "\u300D"] }), _jsx("br", {}), "\uC774 \uD560 \uC77C\uC744 ", _jsx("b", { children: "\uBAA8\uB4E0 \uAE30\uC218(32~35)" }), "\uC5D0 \uC5C5\uB85C\uB4DC\uD560\uAE4C\uC694?"] }), _jsxs("div", { className: "modalActions", children: [_jsx("button", { className: "btn btn--ghost", onClick: () => setConfirmUpload(null), children: "\uCDE8\uC18C" }), _jsx("button", { className: "btn", onClick: () => {
                                        if (!cohort)
                                            return;
                                        const t = confirmUpload;
                                        // 1) 템플릿 저장
                                        const templateId = upsertTemplateFromTask({ ...t, templateId: t.templateId }, cohort);
                                        // 2) 현재 task에도 templateId 기록
                                        setTasksAndSave((prev) => prev.map((x) => x.id === t.id ? { ...x, templateId, origin: "custom" } : x));
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
                                    }, children: "\uC804 \uAE30\uC218 \uC5C5\uB85C\uB4DC" })] })] }) })), uploadDone && (_jsx("div", { className: "toast", children: "\uD83C\uDF89 \uC804 \uAE30\uC218 \uC5C5\uB85C\uB4DC\uAC00 \uC644\uB8CC\uB418\uC5C8\uC2B5\uB2C8\uB2E4" })), bulkEdit && (_jsx("div", { className: "modalOverlay", onClick: () => setBulkEdit(null), children: _jsxs("div", { className: "modal", onClick: (e) => e.stopPropagation(), children: [_jsx("h3", { style: { marginTop: 0 }, children: "\uC804 \uAE30\uC218 \uC77C\uAD04 \uC218\uC815" }), _jsxs("div", { className: "modalField", children: [_jsx("label", { children: "\uC81C\uBAA9" }), _jsx("input", { value: bulkTitle, onChange: (e) => setBulkTitle(e.target.value) })] }), _jsxs("div", { className: "modalField", children: [_jsx("label", { children: "\uB2F4\uB2F9\uC790" }), _jsxs("select", { value: bulkAssignee, onChange: (e) => setBulkAssignee(e.target.value), children: [_jsx("option", { value: "", children: "\uB2F4\uB2F9\uC790" }), _jsx("option", { value: "\uCC28\uC5F0\uC8FC", children: "\uCC28\uC5F0\uC8FC\uC0AC\uC6D0" }), _jsx("option", { value: "\uD55C\uC6D0\uC11D", children: "\uD55C\uC6D0\uC11D\uAD50\uC218" }), _jsx("option", { value: "\uB300\uD55C\uC0C1\uACF5\uD68C\uC758\uC18C", children: "\uB300\uD55C\uC0C1\uACF5\uD68C\uC758\uC18C" }), _jsx("option", { value: "\uD3EC\uC2A4\uD14D", children: "\uD3EC\uC2A4\uD14D" })] })] }), _jsxs("div", { className: "modalActions", children: [_jsx("button", { className: "btn btn--ghost", onClick: () => setBulkEdit(null), children: "\uCDE8\uC18C" }), _jsx("button", { className: "btn", onClick: () => {
                                        const title = bulkTitle.trim();
                                        if (!title)
                                            return;
                                        bulkUpdateByTemplateId(bulkEdit.templateId, {
                                            title,
                                            assignee: bulkAssignee,
                                        });
                                        setBulkEdit(null);
                                        alert("✅ 전 기수 일괄 수정 완료");
                                    }, children: "\uC804 \uAE30\uC218 \uC218\uC815" })] })] }) })), bulkDelete && (_jsx("div", { className: "modalOverlay", onClick: () => setBulkDelete(null), children: _jsxs("div", { className: "modal modal--danger", onClick: (e) => e.stopPropagation(), children: [_jsxs("div", { className: "modalHead", children: [_jsx("h3", { className: "modalTitle", children: "\uC804 \uAE30\uC218 \uC77C\uAD04 \uC0AD\uC81C" }), _jsx("button", { className: "modalX", onClick: () => setBulkDelete(null), "aria-label": "\uB2EB\uAE30", children: "\u2715" })] }), _jsxs("div", { className: "modalBody", children: [_jsxs("p", { className: "modalMain", children: [_jsxs("b", { children: ["\u300C", bulkDelete.title, "\u300D"] }), _jsx("br", {}), "\uC774 \uD560 \uC77C\uC744 ", _jsx("b", { children: "\uBAA8\uB4E0 \uAE30\uC218(32~35)" }), "\uC5D0\uC11C \uC644\uC804\uD788 \uC0AD\uC81C\uD560\uAE4C\uC694?"] }), _jsxs("div", { className: "modalWarn", children: [_jsx("span", { className: "modalWarnIcon", "aria-hidden": true, children: "\u26A0\uFE0F" }), _jsx("span", { children: "\uC774 \uC791\uC5C5\uC740 \uB418\uB3CC\uB9B4 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." })] })] }), _jsxs("div", { className: "modalActions modalActions--right", children: [_jsx("button", { className: "btn btn--ghost", onClick: () => setBulkDelete(null), children: "\uCDE8\uC18C" }), _jsx("button", { className: "btn btn--danger", onClick: () => {
                                        // ✅ 여기서 전 기수 일괄 삭제 실행
                                        bulkDeleteByTemplateId(bulkDelete.templateId); // <- TasksContext에 만든 함수명 그대로 쓰기
                                        setBulkDelete(null);
                                        alert("✅ 전 기수 일괄 삭제 완료");
                                    }, children: "\uC804 \uAE30\uC218 \uC0AD\uC81C" })] })] }) }))] }));
}
