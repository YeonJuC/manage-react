import { loadJSON, saveJSON } from "./storage";
import type { CohortKey} from "../data/templates";
import { taskTemplates } from "../data/templates";
import { schedules } from "../data/schedule";

export type Phase = "pre" | "during" | "post";

export type Task = {
  id: string; // `${cohort}:${tplKey}:${dueDate}`
  cohort: CohortKey;
  title: string;
  dueDate: string; // YYYY-MM-DD
  phase: Phase;
  assignee: string;
  done: boolean;
  createdAt: number;
};

const LS_KEY = "manage-react:tasks";
const LS_COHORT = "manage-react:cohort";

function loadLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function clearLocal(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {}
}

export async function loadCohort(uid: string): Promise<CohortKey | null> {
  const remote = await loadJSON<CohortKey | null>(uid, LS_COHORT, null);

  if (!remote) {
    const local = loadLocal<CohortKey | null>(LS_COHORT, null);
    if (local) {
      await saveJSON(uid, LS_COHORT, local);
      // clearLocal(LS_COHORT);
      return local;
    }
  }

  return remote;
}

export function saveCohort(uid: string, cohort: CohortKey) {
  return saveJSON(uid, LS_COHORT, cohort);
}

export async function loadTasks(uid: string): Promise<Task[]> {
  const remote = await loadJSON<Task[]>(uid, LS_KEY, []);

  // ✅ Firestore에 데이터가 없을 때만
  if (!remote || remote.length === 0) {
    const local = loadLocal<Task[]>(LS_KEY, []);

    if (local.length > 0) {
      // 🔥 여기
      await saveJSON(uid, LS_KEY, local); // Firestore로 이관
      clearLocal(LS_KEY);                 // ✅ ← 바로 이 줄
      return local;
    }
  }

  return remote;
}

export function saveTasks(uid: string, tasks: Task[]) {
  return saveJSON(uid, LS_KEY, tasks);
}

function formatYMD(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(baseYmd: string, offsetDays: number) {
  const [y, m, d] = baseYmd.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + offsetDays);
  return formatYMD(date);
}

function phaseFromDueDate(cohort: CohortKey, dueDate: string): Phase {
  const sched = schedules[cohort];
  if (!sched) return "during";

  // YYYY-MM-DD 문자열 비교는 날짜 비교로 그대로 써도 OK
  if (dueDate < sched.pythonStart) return "pre";
  if (dueDate > sched.aiEnd) return "post";
  return "during";
}

export function ensureTemplatesForCohort(tasks: Task[], cohort: CohortKey): Task[] {
  const sched = schedules[cohort];
  if (!sched) return tasks;

  const existingIds = new Set(tasks.filter((t) => t.cohort === cohort).map((t) => t.id));
  const now = Date.now();

  const toAdd: Task[] = taskTemplates
    .map((tpl) => {
      const base = sched[tpl.anchor];
      const dueDate = addDays(base, tpl.offsetDays);
      const id = `${cohort}:${tpl.key}:${dueDate}`;

      return {
        id,
        cohort,
        title: tpl.title,
        dueDate,
        phase: phaseFromDueDate(cohort, dueDate),
        assignee: tpl.defaultAssignee ?? "",
        done: false,
        createdAt: now,
      };
    })
    .filter((t) => !existingIds.has(t.id));

  return [...tasks, ...toAdd];
}

export function toggleTask(tasks: Task[], id: string): Task[] {
  return tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t));
}

export function setAssignee(tasks: Task[], id: string, assignee: string): Task[] {
  return tasks.map((t) => (t.id === id ? { ...t, assignee } : t));
}

export function addTask(
  tasks: Task[],
  input: { cohort: CohortKey; title: string; dueDate: string; phase: Phase; assignee?: string }
): Task[] {
  const now = Date.now();
  const uid =
    (globalThis.crypto as any)?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const id = `custom:${uid}`;

  return [
    ...tasks,
    {
      id,
      cohort: input.cohort,
      title: input.title,
      dueDate: input.dueDate,
      phase: input.phase,
      assignee: input.assignee ?? "",
      done: false,
      createdAt: now,
    },
  ];
}

export function deleteTask(tasks: Task[], id: string): Task[] {
  return tasks.filter((t) => t.id !== id);
}



