import { cohortDates } from "../data/cohortDates";
const LS_CUSTOM_TPL = "pab_custom_templates_v1";
const LS_DISMISSED = "pab_custom_templates_dismissed_v1";
function loadDismissed() {
    try {
        return JSON.parse(localStorage.getItem(LS_DISMISSED) || "{}");
    }
    catch {
        return {};
    }
}
function saveDismissed(m) {
    localStorage.setItem(LS_DISMISSED, JSON.stringify(m));
}
export function dismissTemplateForCohort(cohortKey, templateId) {
    const m = loadDismissed();
    const set = new Set(m[cohortKey] ?? []);
    set.add(templateId);
    m[cohortKey] = [...set];
    saveDismissed(m);
}
export function isDismissed(cohortKey, templateId) {
    const m = loadDismissed();
    return (m[cohortKey] ?? []).includes(templateId);
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
export function loadCustomTemplates() {
    try {
        const raw = localStorage.getItem(LS_CUSTOM_TPL);
        if (!raw)
            return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed))
            return [];
        return parsed;
    }
    catch {
        return [];
    }
}
export function saveCustomTemplates(list) {
    localStorage.setItem(LS_CUSTOM_TPL, JSON.stringify(list));
}
export function upsertTemplateFromTask(task, baseCohort) {
    const base = cohortDates[baseCohort];
    if (!base)
        throw new Error("base cohortDates 없음");
    const offsetDays = diffDays(parseYmd(task.dueDate), parseYmd(base.start));
    const list = loadCustomTemplates();
    // ✅ 템플릿 ID는 task.templateId가 있으면 그걸 쓰고, 없으면 새로 생성
    const templateId = task.templateId && String(task.templateId).trim()
        ? String(task.templateId)
        : crypto.randomUUID();
    const tpl = {
        id: templateId, // ✅ 여기!
        title: task.title,
        phase: task.phase,
        assignee: task.assignee ?? "",
        baseCohort,
        offsetDays,
    };
    const idx = list.findIndex((x) => x.id === templateId);
    const next = idx >= 0 ? list.map((x) => (x.id === templateId ? tpl : x)) : [...list, tpl];
    saveCustomTemplates(next);
    return templateId; // ✅ 반환
}
export function materializeTemplatesForCohort(cohort) {
    const target = cohortDates[cohort];
    if (!target)
        return [];
    const start = parseYmd(target.start);
    return loadCustomTemplates()
        .filter((tpl) => !isDismissed(String(cohort), tpl.id))
        .map((tpl) => {
        const due = fmtYmd(addDays(start, tpl.offsetDays));
        return {
            cohort,
            title: tpl.title,
            dueDate: due,
            phase: tpl.phase,
            assignee: tpl.assignee ?? "",
            templateId: tpl.id,
            origin: "custom",
        };
    });
}
export function removeCustomTemplate(templateId) {
    const list = loadCustomTemplates();
    const next = list.filter((t) => t.id !== templateId);
    saveCustomTemplates(next);
}
