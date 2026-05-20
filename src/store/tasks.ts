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

type CohortPayload = {
  cohort: CohortKey;
  updatedAt: number;
};

const LS_KEY_BASE = "manage-react:tasks";
const LS_COHORT_BASE = "manage-react:cohort";
const LS_TASKS_AT_BASE = "manage-react:tasksUpdatedAt";
const LS_COHORT_AT_BASE = "manage-react:cohortUpdatedAt";
const LS_TASKS_PENDING_BASE = "manage-react:tasksPendingRemoteSave";

function lsKey(base: string, ownerUid: string) {
  return `${base}:${ownerUid}`;
}

/**
 * ✅ Cohort 동기화(개선)
 * - Local/Remote 모두 저장
 * - updatedAt 비교해서 최신값을 선택
 * - 과거 호환: remote가 string(CohortKey)로 저장돼 있던 경우도 처리
 */
export async function loadCohort(uid: string): Promise<CohortKey | null> {
  const local = loadJSONLocal<CohortKey | null>(lsKey(LS_COHORT_BASE, uid), null);
  const localAt = loadJSONLocal<number>(lsKey(LS_COHORT_AT_BASE, uid), 0);

  const remoteRaw = await loadJSONRemote<CohortPayload | CohortKey>(uid, LS_COHORT_BASE);

  // Remote 못 읽음/없음 → 로컬
  if (!remoteRaw) return local;

  // 과거 호환: remote가 문자열(=CohortKey)로 저장돼 있던 경우
  const remotePayload: CohortPayload =
    typeof remoteRaw === "string"
      ? { cohort: remoteRaw as CohortKey, updatedAt: 0 }
      : {
          cohort: (remoteRaw as any).cohort as CohortKey,
          updatedAt: typeof (remoteRaw as any).updatedAt === "number" ? (remoteRaw as any).updatedAt : 0,
        };

  const remoteCohort = remotePayload.cohort ?? null;
  const remoteAt = remotePayload.updatedAt ?? 0;

  // Remote가 비어있으면 로컬
  if (!remoteCohort) return local;

  // 로컬이 더 최신이면 로컬 사용
  if (local && localAt > remoteAt) return local;

  // Remote가 최신이면 로컬 캐시 갱신
  saveJSONLocal(lsKey(LS_COHORT_BASE, uid), remoteCohort);
  saveJSONLocal(lsKey(LS_COHORT_AT_BASE, uid), remoteAt || Date.now());
  return remoteCohort;
}

export async function saveCohort(uid: string, cohort: CohortKey) {
  if (!cohort) return;
  const updatedAt = Date.now();

  // ✅ 로컬 먼저 저장 (즉시 복구 가능)
  saveJSONLocal(lsKey(LS_COHORT_BASE, uid), cohort);
  saveJSONLocal(lsKey(LS_COHORT_AT_BASE, uid), updatedAt);

  // ✅ 원격도 payload로 저장 (최신판정 가능)
  await saveJSONRemote(uid, LS_COHORT_BASE, { cohort, updatedAt } satisfies CohortPayload);
}

/**
 * ✅ Tasks 동기화(개선)
 * - remote가 있으면 무조건 remote가 아니라
 *   (remoteUpdatedAt vs localUpdatedAt) 더 최신 쪽을 사용
 * - Remote 읽기 실패/없음 → Local 사용
 */
export async function loadTasks(uid: string): Promise<Task[]> {
  const localTasks = loadJSONLocal<Task[]>(lsKey(LS_KEY_BASE, uid), []);
  const localUpdatedAt = loadJSONLocal<number>(lsKey(LS_TASKS_AT_BASE, uid), 0);
  const hasPendingRemoteSave = loadJSONLocal<boolean>(lsKey(LS_TASKS_PENDING_BASE, uid), false);

  const remoteRaw = await loadJSONRemote<TasksPayload | Task[]>(uid, LS_KEY_BASE);

  // Remote 못 읽음/없음 → 로컬만
  if (!remoteRaw) {
    return localTasks;
  }

  // 과거 호환: remote가 배열(Task[])로 저장돼 있던 경우
  const remotePayload: TasksPayload = Array.isArray(remoteRaw)
    ? { tasks: remoteRaw, updatedAt: 0 }
    : {
        tasks: Array.isArray((remoteRaw as any).tasks) ? ((remoteRaw as any).tasks as Task[]) : [],
        updatedAt: typeof (remoteRaw as any).updatedAt === "number" ? ((remoteRaw as any).updatedAt as number) : 0,
      };

  const remoteTasks = remotePayload.tasks ?? [];
  const remoteUpdatedAt = remotePayload.updatedAt ?? 0;

  // ✅ 직전 수정사항이 원격 저장 전에 끊겼다면 로컬을 우선 사용
  // - 브라우저/앱을 바로 닫아도 다음 실행 때 사용자가 방금 수정한 일정이 사라지지 않게 함
  // - 원격 저장은 TasksProvider의 flushPendingTasks에서 재시도
  if (hasPendingRemoteSave && localTasks.length > 0) {
    return localTasks;
  }

  // Remote가 비어있으면 → Local 사용
  if (remoteTasks.length === 0) {
    return localTasks;
  }

  // 로컬이 더 최신이면 로컬 사용
  if (localUpdatedAt > remoteUpdatedAt && localTasks.length > 0) {
    return localTasks;
  }

  // Remote가 최신이면 로컬 캐시 갱신
  saveJSONLocal(lsKey(LS_KEY_BASE, uid), remoteTasks);
  saveJSONLocal(lsKey(LS_TASKS_AT_BASE, uid), remoteUpdatedAt || Date.now());
  return remoteTasks;
}

export async function saveTasks(uid: string, tasks: Task[]) {
  const updatedAt = Date.now();

  // ✅ Firestore 저장 전에 undefined 필드 제거
  const cleaned = tasks.map((t) => {
    const x: any = { ...t };

    Object.keys(x).forEach((k) => {
      if (x[k] === undefined) delete x[k];
    });

    if (x.assignee === undefined || x.assignee === null) x.assignee = "";

    return x as Task;
  });

  // ✅ 로컬 먼저 저장
  saveJSONLocal(lsKey(LS_KEY_BASE, uid), cleaned);
  saveJSONLocal(lsKey(LS_TASKS_AT_BASE, uid), updatedAt);

  // ✅ 원격 저장 전 pending 표시
  // 앱/브라우저를 바로 닫거나 네트워크가 끊겨도 다음 실행 때 재시도할 수 있게 함
  saveJSONLocal(lsKey(LS_TASKS_PENDING_BASE, uid), true);

  // ✅ 원격 저장 (payload)
  await saveJSONRemoteSafeTasks(uid, LS_KEY_BASE, {
    tasks: cleaned,
    updatedAt,
  } satisfies TasksPayload);

  // ✅ 성공했을 때만 pending 해제
  saveJSONLocal(lsKey(LS_TASKS_PENDING_BASE, uid), false);
}

export function hasPendingTasksSave(uid: string): boolean {
  return loadJSONLocal<boolean>(lsKey(LS_TASKS_PENDING_BASE, uid), false);
}

export async function flushPendingTasks(uid: string) {
  if (!hasPendingTasksSave(uid)) return;

  const localTasks = loadJSONLocal<Task[]>(lsKey(LS_KEY_BASE, uid), []);
  const localUpdatedAt = loadJSONLocal<number>(lsKey(LS_TASKS_AT_BASE, uid), 0);

  await saveJSONRemoteSafeTasks(uid, LS_KEY_BASE, {
    tasks: localTasks,
    updatedAt: localUpdatedAt || Date.now(),
  } satisfies TasksPayload);

  saveJSONLocal(lsKey(LS_TASKS_PENDING_BASE, uid), false);
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
