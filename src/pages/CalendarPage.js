import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import { cohorts } from "../data/templates";
import { addTask, deleteTask, setAssignee, toggleTask } from "../store/tasks";
import { useTasksStore } from "../store/TasksContext";
import { cohortDates } from "../data/cohortDates";
import { getKoreanHolidays } from "../utils/holidays";
import { dismissTemplateForCohort } from "../store/customTemplates"; // ✅ 추가
/** 날짜 키: YYYY-MM-DD */
function ymd(date) {
    return date.toLocaleDateString("sv-SE");
}
function phaseOf(dueDate, start, end) {
    if (dueDate < start)
        return "pre";
    if (dueDate <= end)
        return "during";
    return "post";
}
export default function CalendarPage() {
    const { uid, ready, hydrated, cohort, setCohort, tasks, setTasksAndSave } = useTasksStore();
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [newTitle, setNewTitle] = useState("");
    const [activeStartDate, setActiveStartDate] = useState(new Date());
    // 수정 모달
    const [editing, setEditing] = useState(null);
    const [editTitle, setEditTitle] = useState("");
    const [editDate, setEditDate] = useState("");
    // 공휴일
    const [holidays, setHolidays] = useState([]);
    useEffect(() => {
        const y = activeStartDate.getFullYear();
        getKoreanHolidays(y)
            .then(setHolidays)
            .catch((e) => {
            console.error(e);
            setHolidays([]);
        });
    }, [activeStartDate]);
    const selectedYmd = useMemo(() => ymd(selectedDate), [selectedDate]);
    const holidayOf = (date) => holidays.find((h) => h.date === ymd(date));
    /** 선택 차수의 task만 */
    const cohortTasks = useMemo(() => {
        if (!cohort)
            return [];
        return tasks.filter((t) => t.cohort === cohort);
    }, [tasks, cohort]);
    /** dueDate -> tasks[] */
    const tasksByDate = useMemo(() => {
        const map = new Map();
        for (const t of cohortTasks) {
            const arr = map.get(t.dueDate) ?? [];
            arr.push(t);
            map.set(t.dueDate, arr);
        }
        return map;
    }, [cohortTasks]);
    const dayTasks = useMemo(() => tasksByDate.get(selectedYmd) ?? [], [tasksByDate, selectedYmd]);
    /** 날짜별 상태(점 표시용) */
    const getDayStatus = (date) => {
        const key = ymd(date);
        const list = tasksByDate.get(key) ?? [];
        if (list.length === 0)
            return "none";
        return list.every((t) => t.done) ? "done" : "todo";
    };
    /** 수정 모달 열기 */
    const openEdit = (task) => {
        setEditing(task);
        setEditTitle(task.title);
        setEditDate(task.dueDate);
    };
    /** 수정 저장 */
    const saveEdit = () => {
        if (!editing)
            return;
        const title = editTitle.trim();
        if (!title)
            return;
        if (!cohort)
            return;
        const range = cohortDates[cohort];
        const phase = range ? phaseOf(editDate, range.start, range.end) : editing.phase;
        setTasksAndSave((prev) => prev.map((x) => (x.id === editing.id ? { ...x, title, dueDate: editDate, phase } : x)));
        setEditing(null);
    };
    // ✅ 삭제(템플릿 업무는 dismiss까지 같이)
    const onDelete = (t) => {
        if (!cohort)
            return;
        const ok = window.confirm("이 할 일을 삭제할까요?");
        if (!ok)
            return;
        // 템플릿에서 생성된 업무면: 다시 생기지 않게 dismiss 처리
        if (t.templateId) {
            dismissTemplateForCohort(String(cohort), t.templateId);
        }
        setTasksAndSave((prev) => deleteTask(prev, t.id));
    };
    if (!ready)
        return _jsx("div", { className: "card", style: { padding: 16 }, children: "\uB85C\uB529 \uC911\u2026" });
    if (!uid)
        return _jsx("div", { className: "card", style: { padding: 16 }, children: "\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." });
    if (!hydrated)
        return _jsx("div", { className: "card", style: { padding: 16 }, children: "\uB370\uC774\uD130 \uBD88\uB7EC\uC624\uB294 \uC911\u2026" });
    return (_jsxs("div", { children: [_jsx("h1", { children: "\uCE98\uB9B0\uB354" }), _jsx("div", { className: "card", style: { marginTop: 12 }, children: _jsxs("div", { style: { display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }, children: [_jsx("strong", { children: "\uCC28\uC218 \uC120\uD0DD" }), _jsxs("select", { value: cohort, onChange: (e) => setCohort(e.target.value), style: { height: 36, padding: "0 10px", borderRadius: 10, border: "1px solid var(--border)" }, children: [_jsx("option", { value: "", children: "\uC120\uD0DD\uD558\uC138\uC694" }), cohorts.map((c) => (_jsx("option", { value: c.key, children: c.label }, c.key)))] }), _jsx("span", { style: { color: "var(--muted)" }, children: "\uB0A0\uC9DC \uD074\uB9AD \u2192 \uADF8\uB0A0 \uD574\uC57C \uD560 \uC77C / \uB2F4\uB2F9\uC790 / \uC644\uB8CC \uCCB4\uD06C (\uACF5\uD734\uC77C \uC790\uB3D9 \uD45C\uC2DC)" })] }) }), _jsxs("div", { className: "calendar-layout", children: [_jsx("div", { className: "card", children: !cohort ? (_jsx("div", { style: { color: "var(--muted)" }, children: "\uCC28\uC218\uB97C \uBA3C\uC800 \uC120\uD0DD\uD574\uC918." })) : (_jsx(Calendar, { onActiveStartDateChange: ({ activeStartDate }) => {
                                if (activeStartDate)
                                    setActiveStartDate(activeStartDate);
                            }, onChange: (v) => {
                                const d = Array.isArray(v) ? v[0] : v;
                                if (d instanceof Date)
                                    setSelectedDate(d);
                            }, value: selectedDate, tileClassName: ({ date, view }) => {
                                if (view !== "month")
                                    return "";
                                const classes = [];
                                if (holidayOf(date))
                                    classes.push("holiday");
                                const s = getDayStatus(date);
                                if (s === "done")
                                    classes.push("cal-day-done");
                                if (s === "todo")
                                    classes.push("cal-day-todo");
                                return classes.join(" ");
                            }, tileContent: ({ date, view }) => {
                                if (view !== "month")
                                    return null;
                                const h = holidayOf(date);
                                return (_jsx(_Fragment, { children: h && (_jsxs("span", { className: "holiday-dot", children: [h.name, h.substitute ? " (대체)" : ""] })) }));
                            } })) }), _jsxs("div", { className: "card", children: [_jsx("h3", { style: { marginTop: 0 }, children: selectedYmd }), cohort && (() => {
                                const h = holidayOf(selectedDate);
                                return h ? (_jsxs("div", { style: { marginTop: 6, color: "#e11d48", fontWeight: 700, fontSize: 13 }, children: ["\uACF5\uD734\uC77C: ", h.name] })) : null;
                            })(), cohort && (_jsxs("div", { style: { display: "flex", gap: 8, marginTop: 10, alignItems: "center" }, children: [_jsx("input", { value: newTitle, onChange: (e) => setNewTitle(e.target.value), placeholder: "\uC0C8 \uD560 \uC77C \uC785\uB825", style: { flex: 1, height: 36, padding: "0 12px", borderRadius: 10, border: "1px solid var(--border)" } }), _jsx("button", { className: "btn", onClick: () => {
                                            const title = newTitle.trim();
                                            if (!title)
                                                return;
                                            if (!cohort)
                                                return;
                                            const range = cohortDates[cohort];
                                            const phase = range ? phaseOf(selectedYmd, range.start, range.end) : "during";
                                            setTasksAndSave((prev) => addTask(prev, {
                                                cohort: cohort,
                                                title,
                                                dueDate: selectedYmd,
                                                phase,
                                            }));
                                            setNewTitle("");
                                        }, children: "\uCD94\uAC00" })] })), !cohort && _jsx("div", { style: { color: "var(--muted)" }, children: "\uCC28\uC218\uB97C \uC120\uD0DD\uD558\uBA74 \uC77C\uC815\uC5D0 \uD45C\uC2DC\uB429\uB2C8\uB2E4." }), cohort && dayTasks.length === 0 && (_jsx("div", { style: { color: "var(--muted)", marginLeft: 5, marginTop: 16 }, children: "\uC774 \uB0A0\uC9DC\uC5D0 \uB4F1\uB85D\uB41C \uD560 \uC77C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." })), cohort && dayTasks.length > 0 && (_jsx("div", { style: { display: "grid", gap: 10, marginTop: 10 }, children: dayTasks.map((t) => (_jsxs("div", { className: "card", style: { padding: 12 }, children: [_jsxs("div", { style: { display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }, children: [_jsxs("label", { style: { display: "flex", gap: 10, alignItems: "center", flex: 1 }, children: [_jsx("input", { type: "checkbox", checked: t.done, onChange: () => setTasksAndSave((prev) => toggleTask(prev, t.id)) }), _jsx("span", { style: { textDecoration: t.done ? "line-through" : "none" }, children: t.title })] }), _jsxs("div", { style: { display: "flex", gap: 8, alignItems: "center" }, className: "actions", children: [_jsxs("select", { value: t.assignee, onChange: (e) => setTasksAndSave((prev) => setAssignee(prev, t.id, e.target.value)), style: { height: 34, padding: "0 10px", borderRadius: 10, border: "1px solid var(--border)" }, children: [_jsx("option", { value: "", children: "\uB2F4\uB2F9\uC790" }), _jsx("option", { value: "\uCC28\uC5F0\uC8FC", children: "\uCC28\uC5F0\uC8FC\uC0AC\uC6D0" }), _jsx("option", { value: "\uD55C\uC6D0\uC11D", children: "\uD55C\uC6D0\uC11D\uAD50\uC218" }), _jsx("option", { value: "\uB300\uD55C\uC0C1\uACF5\uD68C\uC758\uC18C", children: "\uB300\uD55C\uC0C1\uACF5\uD68C\uC758\uC18C" }), _jsx("option", { value: "\uD3EC\uC2A4\uD14D", children: "\uD3EC\uC2A4\uD14D" })] }), _jsx("button", { className: "btn-edit", onClick: () => openEdit(t), children: "\uC218\uC815" }), _jsx("button", { className: "btn-del", onClick: () => onDelete(t), title: "\uD560 \uC77C \uC0AD\uC81C", children: "\uC0AD\uC81C" })] })] }), _jsxs("div", { style: { marginTop: 6, color: "var(--muted)", fontSize: 12 }, children: ["due: ", t.dueDate] })] }, `${t.id}|${t.cohort}|${t.dueDate}`))) }, `${cohort}|${selectedYmd}`)), editing && (_jsx("div", { onClick: () => setEditing(null), style: {
                                    position: "fixed",
                                    inset: 0,
                                    background: "rgba(0,0,0,0.35)",
                                    display: "grid",
                                    placeItems: "center",
                                    zIndex: 9999,
                                    padding: 16,
                                }, children: _jsxs("div", { onClick: (e) => e.stopPropagation(), style: {
                                        width: "min(520px, 100%)",
                                        background: "#fff",
                                        borderRadius: 14,
                                        border: "1px solid var(--border)",
                                        padding: 16,
                                    }, children: [_jsx("h3", { style: { margin: 0, marginBottom: 12 }, children: "\uD560 \uC77C \uC218\uC815" }), _jsxs("div", { style: { display: "grid", gap: 10 }, children: [_jsxs("div", { style: { display: "grid", gap: 6 }, children: [_jsx("div", { style: { fontSize: 12, color: "var(--muted)" }, children: "\uB0B4\uC6A9" }), _jsx("input", { value: editTitle, onChange: (e) => setEditTitle(e.target.value), style: {
                                                                height: 38,
                                                                padding: "0 12px",
                                                                borderRadius: 10,
                                                                border: "1px solid var(--border)",
                                                            } })] }), _jsxs("div", { style: { display: "grid", gap: 6 }, children: [_jsx("div", { style: { fontSize: 12, color: "var(--muted)" }, children: "\uB0A0\uC9DC" }), _jsx("input", { type: "date", value: editDate, onChange: (e) => setEditDate(e.target.value), style: {
                                                                height: 38,
                                                                padding: "0 12px",
                                                                borderRadius: 10,
                                                                border: "1px solid var(--border)",
                                                            } })] }), _jsxs("div", { style: { display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }, children: [_jsx("button", { className: "btn btn--ghost", onClick: () => setEditing(null), children: "\uCDE8\uC18C" }), _jsx("button", { className: "btn", onClick: saveEdit, children: "\uC800\uC7A5" })] })] })] }) }))] })] })] }));
}
