import {
  loadJSONLocal,
  saveJSONLocal,
  loadJSONRemote,
  saveJSONRemote,
} from "./storage";
import type { CohortKey } from "../data/templates";
import { taskTemplates } from "../data/templates";
import { schedules } from "../data/schedule";

export type Phase = "pre" | "during" | "post";

export type Task = {
  id: string; // `${cohort}:${tplKey}:${dueDate}` or `custom:${uuid}`
  cohort: CohortKey;
  title: string;
  dueDate: string; // YYYY-MM-DD
  phase: Phase;
  assignee: string;
  done: boolean;
  createdAt: number;
  templateId?: string;
  origin?: "seed" | "custom";
};

type TasksPayload = {
  tasks: Task[];
  updatedAt: number; // ms
};

const LS_KEY = "manage-react:tasks";
const LS_COHORT = "manage-react:cohort";
const LS_TASKS_AT = "manage-react:tasksUpdatedAt";

export async function loadCohort(uid: string): Promise<CohortKey | null> {
  const remote = await loadJSONRemote<CohortKey>(uid, LS_COHORT);

  if (!remote) {
    const local = loadJSONLocal<CohortKey | null>(LS_COHORT, null);
    if (local) {
      await saveJSONRemote(uid, LS_COHORT, local);
      return local;
    }
    return null;
  }

  return remote;
}

export async function saveCohort(uid: string, cohort: CohortKey) {
  if (!cohort) return;
  await saveJSONRemote(uid, LS_COHORT, cohort);
}

/**
 * ✅ 동기화 규칙
 * - Remote를 우선 시도
 * - Remote가 없으면 Local
 * - 둘 다 있으면 updatedAt 최신인 쪽 선택
 * - Local이 더 최신이면 Remote로 업로드(온라인 연동)
 */
export async function loadTasks(uid: string): Promise<Task[]> {
  const localTasks = loadJSONLocal<Task[]>(LS_KEY, []);
  const localUpdatedAt = loadJSONLocal<number>(LS_TASKS_AT, 0);

  const remoteRaw = await loadJSONRemote<TasksPayload | Task[]>(uid, LS_KEY);

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

  // ✅ Firestore가 비어있고, 로컬에만 있을 때만 이관
  if (remoteTasks.length === 0 && localTasks.length > 0) {
    const now = Date.now();
    const migratedAt = localUpdatedAt || now;
    await saveJSONRemote(uid, LS_KEY, { tasks: localTasks, updatedAt: migratedAt });
    saveJSONLocal(LS_TASKS_AT, migratedAt);
    return localTasks;
  }

  // ✅ Remote가 최신이면 → 로컬을 Remote로 덮어써서 기기 간 동일하게 만들기
  if (remoteUpdatedAt >= localUpdatedAt) {
    saveJSONLocal(LS_KEY, remoteTasks);
    saveJSONLocal(LS_TASKS_AT, remoteUpdatedAt || Date.now());
    return remoteTasks;
  }

  // ✅ Local이 더 최신이면 → Remote로 업로드해서 다른 기기랑 맞추기
  // (remote 읽기는 됐으니, 보통 online 상태. 실패해도 로컬은 반환)
  try {
    await saveJSONRemote(uid, LS_KEY, { tasks: localTasks, updatedAt: localUpdatedAt || Date.now() });
  } catch {
    // ignore (오프라인/권한 등)
  }
  return localTasks;
}

export async function saveTasks(uid: string, tasks: Task[]) {
  // ✅ 빈 배열도 저장 허용 (삭제 동기화 필요)
  const updatedAt = Date.now();

  // 로컬도 같이 갱신해서 "최신" 기준이 유지되게
  saveJSONLocal(LS_KEY, tasks);
  saveJSONLocal(LS_TASKS_AT, updatedAt);

  await saveJSONRemote(uid, LS_KEY, { tasks, updatedAt } satisfies TasksPayload);
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
  prev: Task[],
  input: Pick<Task, "cohort" | "title" | "dueDate" | "phase"> &
    Partial<Pick<Task, "assignee" | "templateId" | "origin">>
) {
  const task: Task = {
    id: "custom:" + crypto.randomUUID(),
    createdAt: Date.now(),
    done: false,
    assignee: "",
    ...input, // ✅ templateId/origin/assignee 들어오면 유지됨
  };
  return [...prev, task];
}


export function updateTask(prev: Task[], id: string, patch: Partial<Task>) {
  return prev.map((t) => (t.id === id ? { ...t, ...patch } : t));
}

export function deleteTask(tasks: Task[], id: string): Task[] {
  return tasks.filter((t) => t.id !== id);
}