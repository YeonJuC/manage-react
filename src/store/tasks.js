import { loadJSONLocal, saveJSONLocal, loadJSONRemote, saveJSONRemote, saveJSONRemoteSafeTasks, } from "./storage";
// ⚠️ Vite(ESM)에서 named export 불일치가 있으면 런타임에서 바로 SyntaxError가 납니다.
// ("... does not provide an export named ...")
// 그래서 templates는 namespace import로 받아 안전하게 사용합니다.
import * as Templates from "../data/templates";
import { schedules } from "../data/schedule";
// templates.ts의 export 형태가 달라도 런타임 에러 없이 동작하게 방어
const taskTemplates = (Templates.taskTemplates ?? []);
const LS_KEY_BASE = "manage-react:tasks";
const LS_COHORT_BASE = "manage-react:cohort";
const LS_TASKS_AT_BASE = "manage-react:tasksUpdatedAt";
function lsKey(base, ownerUid) {
    // 로컬 캐시는 ownerUid별로 분리(내/공용 섞임 방지)
    return `${base}:${ownerUid}`;
}
export async function loadCohort(uid) {
    const remote = await loadJSONRemote(uid, LS_COHORT_BASE);
    if (!remote) {
        const local = loadJSONLocal(lsKey(LS_COHORT_BASE, uid), null);
        if (local) {
            await saveJSONRemote(uid, LS_COHORT_BASE, local);
            return local;
        }
        return null;
    }
    return remote;
}
export async function saveCohort(uid, cohort) {
    if (!cohort)
        return;
    await saveJSONRemote(uid, LS_COHORT_BASE, cohort);
}
/**
 * ✅ 동기화 규칙
 * - Remote를 우선 시도
 * - Remote가 있으면 Remote를 "정답"으로 보고 Local 캐시를 갱신
 * - Remote가 없으면 Local 캐시만 사용
 *
 * ⚠️ 중요: load 단계에서 Local → Remote 자동 업로드는 하지 않는다.
 * (공용/내 전환, 권한/네트워크 순간 오류 시 로컬이 Remote를 덮어써서
 *  done 값이 풀리는 사고를 방지)
 */
export async function loadTasks(uid) {
    const localTasks = loadJSONLocal(lsKey(LS_KEY_BASE, uid), []);
    const localUpdatedAt = loadJSONLocal(lsKey(LS_TASKS_AT_BASE, uid), 0);
    const remoteRaw = await loadJSONRemote(uid, LS_KEY_BASE);
    // 🔒 Firestore 못 읽었으면 → 로컬만 사용
    if (!remoteRaw) {
        return localTasks;
    }
    // ✅ 과거 호환: remote가 배열(Task[])로 저장돼 있던 경우
    const remotePayload = Array.isArray(remoteRaw)
        ? { tasks: remoteRaw, updatedAt: 0 }
        : {
            tasks: Array.isArray(remoteRaw.tasks) ? remoteRaw.tasks : [],
            updatedAt: typeof remoteRaw.updatedAt === "number" ? remoteRaw.updatedAt : 0,
        };
    const remoteTasks = remotePayload.tasks ?? [];
    const remoteUpdatedAt = remotePayload.updatedAt ?? 0;
    // ✅ Remote가 비어있으면(아직 저장된 적 없거나 권한/초기 상태)
    // 로컬만 사용한다. (자동 업로드 금지)
    if (remoteTasks.length === 0) {
        return localTasks;
    }
    // ✅ Remote가 있으면 Remote를 기준으로 로컬 캐시 갱신
    saveJSONLocal(lsKey(LS_KEY_BASE, uid), remoteTasks);
    saveJSONLocal(lsKey(LS_TASKS_AT_BASE, uid), remoteUpdatedAt || Date.now());
    return remoteTasks;
}
export async function saveTasks(uid, tasks) {
    // ✅ 빈 배열도 저장 허용 (삭제 동기화 필요)
    const updatedAt = Date.now();
    // 로컬도 같이 갱신해서 "최신" 기준이 유지되게
    saveJSONLocal(lsKey(LS_KEY_BASE, uid), tasks);
    saveJSONLocal(lsKey(LS_TASKS_AT_BASE, uid), updatedAt);
    await saveJSONRemoteSafeTasks(uid, LS_KEY_BASE, { tasks, updatedAt });
}
function formatYMD(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}
function addDays(baseYmd, offsetDays) {
    const [y, m, d] = baseYmd.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    date.setDate(date.getDate() + offsetDays);
    return formatYMD(date);
}
function phaseFromDueDate(cohort, dueDate) {
    const sched = schedules[cohort];
    if (!sched)
        return "during";
    if (dueDate < sched.pythonStart)
        return "pre";
    if (dueDate > sched.aiEnd)
        return "post";
    return "during";
}
export function ensureTemplatesForCohort(tasks, cohort) {
    const sched = schedules[cohort];
    if (!sched)
        return tasks;
    const existingIds = new Set(tasks.filter((t) => t.cohort === cohort).map((t) => t.id));
    const now = Date.now();
    const toAdd = taskTemplates
        .map((tpl) => {
        const anchor = tpl.anchor;
        const base = sched[anchor];
        if (!base)
            return null;
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
        .filter((t) => !!t)
        .filter((t) => !existingIds.has(t.id));
    return [...tasks, ...toAdd];
}
export function toggleTask(tasks, id) {
    return tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t));
}
export function setAssignee(tasks, id, assignee) {
    return tasks.map((t) => (t.id === id ? { ...t, assignee } : t));
}
export function addTask(prev, input) {
    const task = {
        id: "custom:" + crypto.randomUUID(),
        createdAt: Date.now(),
        done: false,
        assignee: "",
        ...input, // ✅ templateId/origin/assignee 들어오면 유지됨
    };
    return [...prev, task];
}
export function updateTask(prev, id, patch) {
    return prev.map((t) => (t.id === id ? { ...t, ...patch } : t));
}
export function deleteTask(tasks, id) {
    return tasks.filter((t) => t.id !== id);
}
