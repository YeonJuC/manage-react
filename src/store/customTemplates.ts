// src/store/customTemplates.ts
import type { CohortKey } from "../data/templates";
import type { Phase, Task } from "./tasks";
import { cohortDates } from "../data/cohortDates";

export type CustomTemplate = {
  id: string;
  title: string;
  phase: Phase;
  assignee?: string;

  baseCohort: CohortKey; // ✅ 저장 당시 기수
  offsetDays: number;    // ✅ baseCohort.start 기준 며칠
};


const LS_CUSTOM_TPL = "pab_custom_templates_v1";
const LS_DISMISSED = "pab_custom_templates_dismissed_v1";
type DismissedMap = Record<string, string[]>;

function loadDismissed(): DismissedMap {
  try {
    return JSON.parse(localStorage.getItem(LS_DISMISSED) || "{}");
  } catch {
    return {};
  }
}
function saveDismissed(m: DismissedMap) {
  localStorage.setItem(LS_DISMISSED, JSON.stringify(m));
}

export function dismissTemplateForCohort(cohortKey: string, templateId: string) {
  const m = loadDismissed();
  const set = new Set(m[cohortKey] ?? []);
  set.add(templateId);
  m[cohortKey] = [...set];
  saveDismissed(m);
}

export function isDismissed(cohortKey: string, templateId: string) {
  const m = loadDismissed();
  return (m[cohortKey] ?? []).includes(templateId);
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

export function loadCustomTemplates(): CustomTemplate[] {
  try {
    const raw = localStorage.getItem(LS_CUSTOM_TPL);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}
export function saveCustomTemplates(list: CustomTemplate[]) {
  localStorage.setItem(LS_CUSTOM_TPL, JSON.stringify(list));
}

export function upsertTemplateFromTask(task: Task, baseCohort: CohortKey) {
  const base = cohortDates[baseCohort];
  if (!base) throw new Error("base cohortDates 없음");

  const offsetDays = diffDays(parseYmd(task.dueDate), parseYmd(base.start));

  const list = loadCustomTemplates();

  // ✅ 템플릿 ID는 task.templateId가 있으면 그걸 쓰고, 없으면 새로 생성
  const templateId =
    (task as any).templateId && String((task as any).templateId).trim()
      ? String((task as any).templateId)
      : crypto.randomUUID();

  const tpl: CustomTemplate = {
    id: templateId,              // ✅ 여기!
    title: task.title,
    phase: task.phase,
    assignee: task.assignee ?? "",
    baseCohort,
    offsetDays,
  };

  const idx = list.findIndex((x) => x.id === templateId);
  const next = idx >= 0 ? list.map((x) => (x.id === templateId ? tpl : x)) : [...list, tpl];
  saveCustomTemplates(next);

  return templateId;             // ✅ 반환
}


export function materializeTemplatesForCohort(cohort: CohortKey): Omit<Task, "id" | "done">[] {
  const target = cohortDates[cohort];
  if (!target) return [];

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
    } as any;
  });
}

export function removeCustomTemplate(templateId: string) {
  const list = loadCustomTemplates();
  const next = list.filter((t) => t.id !== templateId);
  saveCustomTemplates(next);
}

