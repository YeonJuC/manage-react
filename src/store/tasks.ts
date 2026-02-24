import {
  loadJSONLocal,
  saveJSONLocal,
  loadJSONRemote,
  saveJSONRemote,
  saveJSONRemoteSafeTasks,
} from "./storage";
import type { CohortKey } from "../data/templates";
import * as Templates from "../data/templates";
import { schedules } from "../data/schedule";
import type { CohortSchedule } from "../data/schedule";

const taskTemplates = ((Templates as any).taskTemplates ?? []) as any[];

export type Phase = "pre" | "during" | "post";

export type Task = {
  id: string;
  cohort: CohortKey;
  title: string;
  dueDate: string;
  phase: Phase;
  assignee: string;
  done: boolean;
  createdAt: number;
  templateId?: string;
  origin?: "seed" | "custom";
};

type TasksPayload = {
  tasks: Task[];
  updatedAt: number;
};

const LS_KEY_BASE = "manage-react:tasks";
const LS_COHORT_BASE = "manage-react:cohort";
const LS_TASKS_AT_BASE = "manage-react:tasksUpdatedAt";

function lsKey(base: string, ownerUid: string) {
  return `${base}:${ownerUid}`;
}

export async function loadCohort(uid: string): Promise<CohortKey | null> {
  const remote = await loadJSONRemote<CohortKey>(uid, LS_COHORT_BASE);

  if (!remote) {
    const local = loadJSONLocal<CohortKey | null>(lsKey(LS_COHORT_BASE, uid), null);
    if (local) {
      await saveJSONRemote(uid, LS_COHORT_BASE, local);
      return local;
    }
    return null;
  }
  return remote;
}

export async function saveCohort(uid: string, cohort: CohortKey) {
  if (!cohort) return;
  await saveJSONRemote(uid, LS_COHORT_BASE, cohort);
}

/**
 * ✅ 동기화 규칙(개선)
 * - Remote가 있으면 무조건 Remote가 아니라,
 *   (remoteUpdatedAt vs localUpdatedAt) 더 최신 쪽을 사용
 * - Remote 읽기 실패/없음 → Local 사용
 * - Remote가 비어있음 → Local 사용
 */
export async function loadTasks(uid: string): Promise<Task[]> {
  const localTasks = loadJSONLocal<Task[]>(lsKey(LS_KEY_BASE, uid), []);
  const localUpdatedAt = loadJSONLocal<number>(lsKey(LS_TASKS_AT_BASE, uid), 0);

  const remoteRaw = await loadJSONRemote<TasksPayload | Task[]>(uid, LS_KEY_BASE);

  // 🔒 Firestore 못 읽었으면 → 로컬만 사용
  if (!remoteRaw) {
    return localTasks;
  }

  // ✅ 과거 호환: remote가 배열(Task[])로 저장돼 있던 경우
  const remotePayload: TasksPayload = Array.isArray(remoteRaw)
    ? { tasks: remoteRaw, updatedAt: 0 }
    : {
        tasks: Array.isArray(remoteRaw.tasks) ? remoteRaw.tasks : [],
        updatedAt: typeof remoteRaw.updatedAt === "number" ? remoteRaw.updatedAt : 0,
      };

  const remoteTasks = remotePayload.tasks ?? [];
  const remoteUpdatedAt = remotePayload.updatedAt ?? 0;

  // ✅ Remote가 비어있으면 → Local 사용
  if (remoteTasks.length === 0) {
    return localTasks;
  }

  // ✅ 최신판정: local이 더 최신이면 local 사용
  // (예: 오프라인/권한 문제로 저장 실패했는데 화면은 바뀐 경우)
  if (localUpdatedAt > remoteUpdatedAt && localTasks.length > 0) {
    return localTasks;
  }

  // ✅ Remote가 최신이면 Remote를 기준으로 로컬 캐시 갱신
  saveJSONLocal(lsKey(LS_KEY_BASE, uid), remoteTasks);
  saveJSONLocal(lsKey(LS_TASKS_AT_BASE, uid), remoteUpdatedAt || Date.now());
  return remoteTasks;
}

export async function saveTasks(uid: string, tasks: Task[]) {
  const updatedAt = Date.now();

  saveJSONLocal(lsKey(LS_KEY_BASE, uid), tasks);
  saveJSONLocal(lsKey(LS_TASKS_AT_BASE, uid), updatedAt);

  // ✅ 안전 저장(스테일 덮어쓰기 방지)
  await saveJSONRemoteSafeTasks(uid, LS_KEY_BASE, { tasks, updatedAt } satisfies TasksPayload);
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
    .map((tpl: any) => {
      const anchor = tpl.anchor as keyof CohortSchedule;
      const base = (sched as any)[anchor] as string | undefined;
      if (!base) return null;

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
      } as Task;
    })
    .filter((t): t is Task => !!t)
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
  prev: Task[],
  input: Pick<Task, "cohort" | "title" | "dueDate" | "phase"> &
    Partial<Pick<Task, "assignee" | "templateId" | "origin">>
) {
  const task: Task = {
    id: "custom:" + crypto.randomUUID(),
    createdAt: Date.now(),
    done: false,
    assignee: "",
    ...input,
  };
  return [...prev, task];
}

export function updateTask(prev: Task[], id: string, patch: Partial<Task>) {
  return prev.map((t) => (t.id === id ? { ...t, ...patch } : t));
}

export function deleteTask(tasks: Task[], id: string): Task[] {
  return tasks.filter((t) => t.id !== id);
}