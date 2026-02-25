import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase";
import type { CohortKey } from "../data/templates";
import {
  addTask,
  ensureTemplatesForCohort,
  loadCohort,
  loadTasks,
  saveCohort,
  saveTasks,
  type Task,
} from "./tasks";
import {
  materializeTemplatesForCohort,
  isDismissed,
  removeCustomTemplate,
  dismissTemplateForCohort,
} from "./customTemplates";
import { cohortDates } from "../data/cohortDates";
import { loadJSONLocal, saveJSONLocal } from "./storage";

type Ctx = {
  uid: string | null;
  ready: boolean;
  hydrated: boolean;

  viewMode: "mine" | "common";
  setViewMode: (m: "mine" | "common") => void;
  ownerUid: string | null;

  commonOwnerUid: string | null;
  setCommonOwnerUid: (uid: string | null) => void;

  cohort: CohortKey | "";
  setCohort: (c: CohortKey | "") => void;

  tasks: Task[];
  setTasksAndSave: (updater: (prev: Task[]) => Task[]) => void;

  reload: () => Promise<void>;

  applyTemplateToAllCohorts: (tpl: {
    templateId: string;
    title: string;
    assignee?: string;
    offsetDays: number;
  }) => void;

  bulkUpdateByTemplateId: (
    templateId: string,
    patch: Partial<Pick<Task, "title" | "assignee" | "dueDate" | "phase">>
  ) => void;

  bulkDeleteByTemplateId: (templateId: string) => void;
};

const TasksCtx = createContext<Ctx | null>(null);

function getOwnerUid(authUid: string | null, viewMode: "mine" | "common", commonOwnerUid: string | null) {
  if (!authUid) return null;
  if (viewMode === "mine") return authUid;
  return commonOwnerUid ?? null;
}

function lsKey(base: string, ownerUid: string | null) {
  return ownerUid ? `${base}:${ownerUid}` : base;
}

const LS_SEEDED_BASE = "manage-react:seededCohorts";
function loadSeeded(ownerUid: string | null): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(lsKey(LS_SEEDED_BASE, ownerUid)) || "{}");
  } catch {
    return {};
  }
}
function saveSeeded(ownerUid: string | null, m: Record<string, boolean>) {
  localStorage.setItem(lsKey(LS_SEEDED_BASE, ownerUid), JSON.stringify(m));
}

const LS_COHORT_BASE = "manage-react:cohort";
const LS_COHORT_AT_BASE = "manage-react:cohortUpdatedAt";
const LS_TASKS_BASE = "manage-react:tasks";
const LS_TASKS_AT_BASE = "manage-react:tasksUpdatedAt";

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
function phaseOf(dueDate: string, start: string, end: string) {
  if (dueDate < start) return "pre";
  if (dueDate <= end) return "during";
  return "post";
}

export function TasksProvider({ children }: { children: React.ReactNode }) {
  const [uid, setUid] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const [commonOwnerUid, setCommonOwnerUidState] = useState<string | null>(() => {
    const fromEnv = (import.meta.env.VITE_COMMON_OWNER_UID as string | undefined) ?? undefined;
    const fromLS = typeof window !== "undefined" ? localStorage.getItem("commonOwnerUid") ?? undefined : undefined;
    return (fromEnv ?? fromLS ?? null) as string | null;
  });

  const setCommonOwnerUid = useCallback((next: string | null) => {
    setCommonOwnerUidState(next);
    try {
      if (typeof window !== "undefined") {
        if (!next) localStorage.removeItem("commonOwnerUid");
        else localStorage.setItem("commonOwnerUid", next);
      }
    } catch {}
  }, []);

  const LS_VIEWMODE = "manage-react:viewMode";
  const [viewMode, setViewModeState] = useState<"mine" | "common">(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(LS_VIEWMODE) : null;
      if (raw === "mine" || raw === "common") return raw;
    } catch {}
    return "mine";
  });

  const setViewMode = useCallback((m: "mine" | "common") => {
    setViewModeState(m);
    try {
      if (typeof window !== "undefined") localStorage.setItem(LS_VIEWMODE, m);
    } catch {}
  }, []);

  /**
   * ✅ 중요: 자동으로 common으로 바꾸지 않음
   * - 연주님 케이스(32기 쓰다 껐다 켜면 33기 뜸)는 이 자동 전환이 원인인 경우가 많음
   * - 공용은 버튼/토글로 들어가게만 두자
   */
  useEffect(() => {
    if (!ready) return;
    if (!uid) return;
    // "처음 실행"이라도 기본 mine 고정
    setViewModeState((prev) => prev ?? "mine");
  }, [ready, uid]);

  const ownerUid = useMemo(() => getOwnerUid(uid, viewMode, commonOwnerUid), [uid, viewMode, commonOwnerUid]);

  const [stateOwnerUid, setStateOwnerUid] = useState<string | null>(null);
  const reloadSeq = useRef(0);

  const [hydrated, setHydrated] = useState(false);
  const [cohort, setCohort] = useState<CohortKey | "">("");
  const [tasks, setTasks] = useState<Task[]>([]);

  const reload = useCallback(async () => {
    const seq = ++reloadSeq.current;

    if (!uid || !ownerUid) {
      setTasks([]);
      setCohort("");
      setHydrated(true);
      return;
    }

    setHydrated(false);

    const fallbackToLocal = () => {
      setCohort(loadJSONLocal<CohortKey | "">(lsKey(LS_COHORT_BASE, ownerUid), ""));
      setTasks(loadJSONLocal<Task[]>(lsKey(LS_TASKS_BASE, ownerUid), []));
    };

    const timeout = new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 8000));

    try {
      const job = Promise.all([loadCohort(ownerUid), loadTasks(ownerUid)]);
      const res = await Promise.race([job, timeout]);

      if (res === "timeout") {
        fallbackToLocal();
        return;
      }

      const [savedCohort, savedTasks] = res;

      const filteredTasks = (savedTasks ?? []).filter((t) => {
        if (t.origin === "custom" && t.templateId) {
          return !isDismissed(String(savedCohort), t.templateId);
        }
        return true;
      });

      if (seq !== reloadSeq.current) return;

      setCohort(savedCohort ?? "");
      setTasks(filteredTasks);

      // ✅ 로컬 캐시 갱신(차수 + 타임스탬프)
      saveJSONLocal(lsKey(LS_COHORT_BASE, ownerUid), savedCohort ?? "");
      saveJSONLocal(lsKey(LS_COHORT_AT_BASE, ownerUid), Date.now());
    } catch {
      fallbackToLocal();
    } finally {
      if (seq === reloadSeq.current) setHydrated(true);
    }
  }, [uid, ownerUid]);

  useEffect(() => {
    if (!ownerUid) return;
    const onOnline = () => void reload();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [ownerUid, reload]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUid(u?.uid ?? null);
      setReady(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!uid || !ownerUid) return;
    if (stateOwnerUid === ownerUid) return;
    setStateOwnerUid(ownerUid);
    setHydrated(false);
    setTasks([]);
    setCohort("");
  }, [uid, ownerUid, stateOwnerUid]);

  useEffect(() => {
    if (!uid || !ownerUid) return;
    void reload();
  }, [uid, ownerUid, reload]);

  /**
   * ✅ cohort가 정해졌을 때:
   * - mine 모드면 cohort를 원격에 저장 + (필요 시) 템플릿 시딩/커스텀 템플릿 materialize
   * - common 모드면 로컬에만 저장(공용이 갑자기 내 데이터 덮어쓰는 사고 예방)
   */
  useEffect(() => {
    if (!uid || !ownerUid) return;
    if (!hydrated) return;
    if (!cohort) return;

    if (viewMode === "mine" && ownerUid !== uid) return;

    const ck = cohort as CohortKey;

    if (viewMode === "common") {
      saveJSONLocal(lsKey(LS_COHORT_BASE, ownerUid), cohort);
      saveJSONLocal(lsKey(LS_COHORT_AT_BASE, ownerUid), Date.now());
      return;
    }

    (async () => {
      await saveCohort(ownerUid, ck);

      setTasks((prev) => {
        let next = prev;

        const seeded = loadSeeded(ownerUid);
        const seededKey = String(ck);

        if (!seeded[seededKey]) {
          next = ensureTemplatesForCohort(next, ck);
          seeded[seededKey] = true;
          saveSeeded(ownerUid, seeded);
        }

        const toAdd = materializeTemplatesForCohort(ck);
        const existsTemplateIds = new Set(next.filter((t) => t.templateId).map((t) => t.templateId));

        for (const it of toAdd) {
          if (!it.templateId) continue;
          if (existsTemplateIds.has(it.templateId)) continue;
          if (isDismissed(String(ck), it.templateId)) continue;

          next = addTask(next, {
            cohort: it.cohort,
            title: it.title,
            dueDate: it.dueDate,
            phase: it.phase,
            assignee: it.assignee ?? "",
            templateId: it.templateId,
            origin: "custom",
          });

          existsTemplateIds.add(it.templateId);
        }

        // ✅ 로컬 캐시도 항상 갱신
        saveJSONLocal(lsKey(LS_TASKS_BASE, ownerUid), next);
        saveJSONLocal(lsKey(LS_TASKS_AT_BASE, ownerUid), Date.now());
        return next;
      });

      saveJSONLocal(lsKey(LS_COHORT_BASE, ownerUid), ck);
      saveJSONLocal(lsKey(LS_COHORT_AT_BASE, ownerUid), Date.now());
    })();
  }, [uid, ownerUid, viewMode, hydrated, cohort]);

  // ✅ 수정/추가는 무조건 이 함수로만
  const setTasksAndSave = (updater: (prev: Task[]) => Task[]) => {
    setTasks((prev) => {
      const next = updater(prev);

      if (ownerUid) {
        saveJSONLocal(lsKey(LS_TASKS_BASE, ownerUid), next);
        saveJSONLocal(lsKey(LS_TASKS_AT_BASE, ownerUid), Date.now());
      }

      if (ownerUid && hydrated && navigator.onLine) {
        void saveTasks(ownerUid, next).catch((e) => {
          console.error("[saveTasks failed]", e);
          alert(
            "⚠️ 저장에 실패했습니다. (권한/네트워크 문제)\n새로고침하면 이전 데이터로 돌아갈 수 있어요.\n콘솔 에러를 확인해 주세요."
          );
        });
      }

      return next;
    });
  };

  const bulkUpdateByTemplateId = (
    templateId: string,
    patch: Partial<Pick<Task, "title" | "assignee" | "dueDate" | "phase">>
  ) => {
    setTasksAndSave((prev) => prev.map((t) => (t.templateId === templateId ? { ...t, ...patch } : t)));
  };

  const bulkDeleteByTemplateId = (templateId: string) => {
    removeCustomTemplate(templateId);
    (Object.keys(cohortDates) as CohortKey[]).forEach((ck) => {
      dismissTemplateForCohort(String(ck), templateId);
    });
    setTasksAndSave((prev) => prev.filter((t) => t.templateId !== templateId));
  };

  const applyTemplateToAllCohorts = (tpl: {
    templateId: string;
    title: string;
    assignee?: string;
    offsetDays: number;
  }) => {
    setTasksAndSave((prev) => {
      let next = prev;
      const cohortKeys = Object.keys(cohortDates) as CohortKey[];
      const exists = new Set(next.filter((t) => t.templateId).map((t) => `${t.cohort}|${t.templateId}`));

      for (const ck of cohortKeys) {
        const target = cohortDates[ck];
        if (!target) continue;

        const due = fmtYmd(addDays(parseYmd(target.start), tpl.offsetDays));
        const phase = phaseOf(due, target.start, target.end);

        const k = `${ck}|${tpl.templateId}`;
        if (exists.has(k)) continue;

        next = addTask(next, {
          cohort: ck,
          title: tpl.title,
          dueDate: due,
          phase,
          assignee: tpl.assignee ?? "",
          templateId: tpl.templateId,
          origin: "custom",
        });

        exists.add(k);
      }

      return next;
    });
  };

  /**
   * ✅ cohort 변경 시:
   * - 로컬에 즉시 저장(마지막 접속 차수 복구)
   * - mine 모드 + 온라인이면 원격에도 저장
   */
  const setCohortAndSave = (nextCohort: CohortKey | "") => {
    setCohort(nextCohort);

    if (ownerUid) {
      saveJSONLocal(lsKey(LS_COHORT_BASE, ownerUid), nextCohort);
      saveJSONLocal(lsKey(LS_COHORT_AT_BASE, ownerUid), Date.now());
    }

    if (!uid || !ownerUid || !hydrated) return;
    if (!nextCohort) return;
    if (viewMode === "common") return;

    if (navigator.onLine) void saveCohort(ownerUid, nextCohort);
  };

  const value = useMemo(
    () => ({
      uid,
      ready,
      hydrated,
      viewMode,
      setViewMode,
      ownerUid,

      commonOwnerUid,
      setCommonOwnerUid,

      cohort,
      setCohort: setCohortAndSave,

      tasks,
      setTasksAndSave,
      reload,
      applyTemplateToAllCohorts,
      bulkUpdateByTemplateId,
      bulkDeleteByTemplateId,
    }),
    [uid, ready, hydrated, viewMode, ownerUid, commonOwnerUid, setCommonOwnerUid, cohort, tasks]
  );

  return <TasksCtx.Provider value={value}>{children}</TasksCtx.Provider>;
}

export function useTasksStore() {
  const v = useContext(TasksCtx);
  if (!v) throw new Error("useTasksStore must be used within TasksProvider");
  return v;
}
