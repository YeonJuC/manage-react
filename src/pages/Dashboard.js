import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { cohorts } from "../data/templates";
import { useTasksStore } from "../store/TasksContext";
import { useState } from "react";
import { addTask } from "../store/tasks";
function labelPhase(p) {
    if (p === "pre")
        return "사전";
    if (p === "during")
        return "교육중";
    return "사후";
}
function sortByDate(a, b) {
    if (a.dueDate < b.dueDate)
        return -1;
    if (a.dueDate > b.dueDate)
        return 1;
    return a.title.localeCompare(b.title);
}
function PdfModal({ open, onClose }) {
    if (!open)
        return null;
    const pdfSrc = `${import.meta.env.BASE_URL}docs/250115_ops.pdf`;
    return (_jsx("div", { className: "pdf-overlay", onClick: onClose, children: _jsxs("div", { className: "pdf-modal", onClick: (e) => e.stopPropagation(), children: [_jsxs("div", { className: "pdf-header", children: [_jsx("span", { children: "\uACFC\uC815\uC6B4\uC601 \uC5C5\uBB34\uC815\uB9AC PDF" }), _jsx("button", { className: "pdf-close", onClick: onClose, children: "\uB2EB\uAE30" })] }), _jsx("iframe", { title: "ops-pdf", src: pdfSrc, className: "pdf-iframe" })] }) }));
}
export default function Dashboard() {
    const { uid, ready, hydrated, cohort, setCohort, tasks, setTasksAndSave, viewMode, setViewMode, commonOwnerUid, setCommonOwnerUid } = useTasksStore();
    const nav = useNavigate();
    const cohortTasks = useMemo(() => {
        if (!cohort)
            return [];
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
    const goDate = (t) => nav(`/calendar?date=${t.dueDate}`);
    const [open, setOpen] = useState(false);
    const [newTitle, setNewTitle] = useState("");
    const [newDueDate, setNewDueDate] = useState(todayYmd);
    const [newPhase, setNewPhase] = useState("during");
    const onAddFromDash = () => {
        if (!uid)
            return;
        if (!cohort)
            return;
        if (!newTitle.trim())
            return;
        setTasksAndSave((prev) => addTask(prev, {
            cohort,
            title: newTitle.trim(),
            dueDate: newDueDate,
            phase: newPhase,
            assignee: "",
        }));
        setNewTitle("");
    };
    if (!ready)
        return _jsx("div", { className: "card", style: { padding: 16 }, children: "\uB85C\uB529 \uC911\u2026" });
    if (!uid)
        return _jsx("div", { className: "card", style: { padding: 16 }, children: "\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." });
    if (!hydrated)
        return _jsx("div", { className: "card", style: { padding: 16 }, children: "\uB370\uC774\uD130 \uBD88\uB7EC\uC624\uB294 \uC911\u2026" });
    return (_jsxs("div", { className: "dashPage", children: [_jsxs("div", { className: "dashTop", children: [_jsxs("div", { children: [_jsx("h1", { className: "dashH1", children: "\uB300\uC2DC\uBCF4\uB4DC" }), _jsxs("div", { className: "dashHint", children: [cohort ? (_jsxs(_Fragment, { children: ["\uC120\uD0DD \uCC28\uC218 ", _jsx("b", { children: cohort }), " \u00B7 \uC644\uB8CC ", _jsx("b", { children: done }), " / ", _jsx("b", { children: total }), " (", pct, "%)"] })) : (_jsx(_Fragment, { children: "\uCC28\uC218\uB97C \uC120\uD0DD\uD558\uBA74 \uC77C\uC815 \uC694\uC57D\uC774 \uD45C\uC2DC\uB429\uB2C8\uB2E4." })), _jsx("span", { style: { marginLeft: 10, fontWeight: 700 }, children: viewMode === "common" ? " · 🔵 공용 페이지" : " · 🟢 내 페이지" })] })] }), _jsxs("div", { style: { display: "flex", gap: 10, alignItems: "center" }, children: [_jsx("button", { type: "button", className: "pdf-btn", onClick: () => {
                                    // ✅ 공용 UID가 비어있으면 1회 입력받아 localStorage에 저장
                                    if (viewMode === "mine") {
                                        if (!commonOwnerUid) {
                                            const next = window.prompt("공용 할일 소유자 UID를 입력하세요(상대방 uid)");
                                            if (!next || !next.trim())
                                                return;
                                            setCommonOwnerUid(next.trim());
                                        }
                                        setViewMode("common");
                                        return;
                                    }
                                    setViewMode("mine");
                                }, style: {
                                    padding: "10px 12px",
                                    borderRadius: 12,
                                    border: "1px solid #ddd",
                                    fontWeight: 700,
                                    cursor: "pointer",
                                }, children: viewMode === "mine" ? "공용 할일 보러가기" : "내 할일로 돌아가기" }), _jsx("button", { type: "button", onClick: () => setOpen(true), className: "btn btn--ghost", style: { whiteSpace: "nowrap" }, children: "\uC5C5\uBB34\uC815\uB9AC PDF" })] }), _jsx(PdfModal, { open: open, onClose: () => setOpen(false) })] }), _jsxs("div", { className: "card", style: { marginTop: 12 }, children: [_jsxs("div", { className: "dashRow", children: [_jsx("strong", { children: "\uCC28\uC218 \uC120\uD0DD" }), _jsxs("select", { value: cohort, onChange: (e) => setCohort(e.target.value), className: "dashSelect", children: [_jsx("option", { value: "", children: "\uC120\uD0DD\uD558\uC138\uC694" }), cohorts.map((c) => (_jsx("option", { value: c.key, children: c.label }, c.key)))] }), cohort ? (_jsxs("span", { className: "dashMuted", children: ["\uC644\uB8CC ", done, " / ", total, " (", pct, "%)"] })) : (_jsx("span", { className: "dashMuted", children: "\uCC28\uC218\uB97C \uC120\uD0DD\uD574\uC8FC\uC138\uC694." }))] }), cohort && (_jsx("div", { style: { marginTop: 12 }, children: _jsx("div", { className: "progress", children: _jsx("div", { className: "progress__bar", style: { width: `${pct}%` } }) }) }))] }), _jsxs("div", { className: "dashStats", children: [_jsxs("div", { className: "card", children: [_jsx("div", { className: "dashStatLabel", children: "\uC804\uCCB4 \uD560 \uC77C" }), _jsx("div", { className: "dashStatValue", children: total })] }), _jsxs("div", { className: "card", children: [_jsx("div", { className: "dashStatLabel", children: "\uC644\uB8CC" }), _jsx("div", { className: "dashStatValue", children: done })] }), _jsxs("div", { className: "card", children: [_jsx("div", { className: "dashStatLabel", children: "\uC794\uC5EC" }), _jsx("div", { className: "dashStatValue", children: Math.max(0, total - done) })] })] }), _jsxs("div", { className: "dashTri", children: [_jsxs("section", { className: "card dashBox", children: [_jsxs("div", { className: "dashBoxHead", children: [_jsxs("div", { children: [_jsx("h3", { className: "dashBoxTitle", children: "\uC624\uB298 \uD560 \uC77C" }), _jsx("div", { className: "dashBoxSub", children: todayYmd })] }), _jsx("button", { className: "btn btn--ghost dashMiniBtn", onClick: () => nav(`/calendar?date=${todayYmd}`), children: "\uC624\uB298 \uBCF4\uAE30" })] }), !cohort && _jsx("div", { className: "dashEmpty", children: "\uCC28\uC218\uB97C \uC120\uD0DD\uD574\uC8FC\uC138\uC694." }), cohort && todayTasks.length === 0 && _jsx("div", { className: "dashEmpty", children: "\uC624\uB298 \uD560 \uC77C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." }), cohort && todayTasks.length > 0 && (_jsx("div", { className: "dashList", children: todayTasks.map((t) => (_jsxs("button", { className: "upcomingItem", onClick: () => goDate(t), children: [_jsx("span", { className: `upcomingPhase upcomingPhase--${t.phase}`, children: labelPhase(t.phase) }), _jsx("span", { className: "upcomingTitle", children: t.title }), _jsx("span", { className: "upcomingDate", children: t.dueDate })] }, t.id))) }))] }), _jsxs("section", { className: "card dashBox", children: [_jsxs("div", { className: "dashBoxHead", children: [_jsxs("div", { children: [_jsx("h3", { className: "dashBoxTitle", children: "\uB2E4\uAC00\uC624\uB294 \uD560 \uC77C" }), _jsx("div", { className: "dashBoxSub", children: "\uBBF8\uC644\uB8CC \uAE30\uC900" })] }), _jsx("button", { className: "btn btn--ghost dashMiniBtn", onClick: () => nav("/calendar"), children: "\uCE98\uB9B0\uB354" })] }), !cohort && _jsx("div", { className: "dashEmpty", children: "\uCC28\uC218\uB97C \uC120\uD0DD\uD574\uC8FC\uC138\uC694." }), cohort && upcomingTasks.length === 0 && _jsx("div", { className: "dashEmpty", children: "\uB2E4\uAC00\uC624\uB294 \uD560 \uC77C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." }), cohort && upcomingTasks.length > 0 && (_jsx("div", { className: "dashList", children: upcomingTasks.map((t) => (_jsxs("button", { className: "upcomingItem", onClick: () => goDate(t), children: [_jsx("span", { className: `upcomingPhase upcomingPhase--${t.phase}`, children: labelPhase(t.phase) }), _jsx("span", { className: "upcomingTitle", children: t.title }), _jsx("span", { className: "upcomingDate", children: t.dueDate })] }, t.id))) }))] }), _jsxs("section", { className: "card dashBox dashBox--danger", children: [_jsxs("div", { className: "dashBoxHead", children: [_jsxs("div", { children: [_jsx("h3", { className: "dashBoxTitle", children: "\uBC00\uB9B0 \uD560 \uC77C" }), _jsx("div", { className: "dashBoxSub", children: "\uC624\uB298 \uC774\uC804 \u00B7 \uBBF8\uC644\uB8CC" })] }), _jsx("button", { className: "btn btn--ghost dashMiniBtn", onClick: () => nav("/tasks"), children: "\uC815\uB9AC" })] }), !cohort && _jsx("div", { className: "dashEmpty", children: "\uCC28\uC218\uB97C \uC120\uD0DD\uD574\uC8FC\uC138\uC694." }), cohort && overdueTasks.length === 0 && _jsx("div", { className: "dashEmpty", children: "\uBC00\uB9B0 \uD560 \uC77C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4! GOOD!" }), cohort && overdueTasks.length > 0 && (_jsx("div", { className: "dashList", children: overdueTasks.map((t) => (_jsxs("button", { className: "upcomingItem", onClick: () => goDate(t), children: [_jsx("span", { className: `upcomingPhase upcomingPhase--${t.phase}`, children: labelPhase(t.phase) }), _jsx("span", { className: "upcomingTitle", children: t.title }), _jsx("span", { className: "upcomingDate", children: t.dueDate })] }, t.id))) }))] })] })] }));
}
