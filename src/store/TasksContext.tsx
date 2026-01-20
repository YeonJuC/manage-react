import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase";
import type { CohortKey } from "../data/templates";
import {
  ensureTemplatesForCohort,
  loadCohort,
  loadTasks,
  saveCohort,
  saveTasks,
  type Task,
} from "./tasks";

type Ctx = {
  uid: string | null;
  ready: boolean;
  hydrated: boolean;

  cohort: CohortKey | "";
  setCohort: (c: CohortKey | "") => void;

  tasks: Task[];
  setTasksAndSave: (updater: (prev: Task[]) => Task[]) => void;

  reload: () => Promise<void>;
};

const TasksCtx = createContext<Ctx | null>(null);

// ✅ 로컬스토리지 키
const LS_COHORT = "manage-react:cohort";
const LS_KEY = "manage-react:tasks";
const LS_TASKS_AT = "manage-react:tasksUpdatedAt";

export function TasksProvider({ children }: { children: React.ReactNode }) {
  const [uid, setUid] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const [hydrated, setHydrated] = useState(false);
  const [cohort, setCohort] = useState<CohortKey | "">("");
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    console.log("[TasksStore]", { uid, ready, hydrated, cohort, tasksLen: tasks.length });
  }, [uid, ready, hydrated, cohort, tasks]);

  // ✅ 온라인 복귀 시 자동 reload (다른 기기 변경사항 반영)
  useEffect(() => {
    if (!uid) return;
    const onOnline = () => void reload();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  // 1) auth 상태
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUid(u?.uid ?? null);
      setReady(true);
    });
    return () => unsub();
  }, []);

  // 2) uid 바뀌면 로드
  const reload = async () => {
    console.log("[TasksStore][reload] start", { uid });

    if (!uid) {
      setTasks([]);
      setCohort("");
      setHydrated(true);
      return;
    }

    setHydrated(false);

    const fallbackToLocal = (reason: unknown) => {
      if (reason === "timeout") console.info("[TasksStore][reload] using local cache");
      else console.warn("[TasksStore][reload] fallback local", reason);

      setCohort(loadJSON<CohortKey | "">(LS_COHORT, ""));
      setTasks(loadJSON<Task[]>(LS_KEY, []));
    };

    // 8초 타임아웃
    const timeout = new Promise<"timeout">((resolve) =>
      setTimeout(() => resolve("timeout"), 8000)
    );

    try {
      const job = Promise.all([loadCohort(uid), loadTasks(uid)]);
      const res = await Promise.race([job, timeout]);

      if (res === "timeout") {
        fallbackToLocal("timeout");
        return;
      }

      const [savedCohort, savedTasks] = res;

      setCohort(savedCohort ?? "");
      setTasks(savedTasks ?? []);

      // ✅ cohort는 여기서 로컬 갱신 OK
      saveJSON(LS_COHORT, savedCohort ?? "");

      // ⚠️ tasks는 loadTasks()가 이미 "서버/로컬 최신판정 + 로컬 저장"까지 할 수 있으니
      // 여기서 굳이 saveJSON(LS_KEY, ...)로 다시 덮어쓰지 않는 게 안정적
      // (필요하면 남겨도 되지만 updatedAt을 같이 맞춰야 함)
    } catch (e) {
      console.warn("[TasksStore][reload] failed -> fallback local", e);
      fallbackToLocal(e);
    } finally {
      setHydrated(true);
    }
  };

  // uid 바뀌면 약간 딜레이 후 reload
  useEffect(() => {
    if (!uid) return;
    const id = setTimeout(() => void reload(), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  // 3) cohort 바뀌면 저장 + 템플릿 보장
  useEffect(() => {
    if (!uid) return;
    if (!hydrated) return;
    if (!cohort) return;

    (async () => {
      await saveCohort(uid, cohort);

      setTasks((prev) => {
        const next = ensureTemplatesForCohort(prev, cohort);

        // ✅ 템플릿 보장으로 tasks가 바뀌었으면 동기화 저장
        // saveTasks 내부에서 로컬(tasks, tasksUpdatedAt)까지 같이 저장함
        if (navigator.onLine) void saveTasks(uid, next);
        else {
          // 오프라인이면 로컬만 갱신 (updatedAt도 같이)
          saveJSON(LS_KEY, next);
          saveJSON(LS_TASKS_AT, Date.now());
        }

        return next;
      });

      saveJSON(LS_COHORT, cohort);
    })();
  }, [uid, hydrated, cohort]);

  // 4) 수정은 무조건 이 함수로만
  const setTasksAndSave = (updater: (prev: Task[]) => Task[]) => {
    setTasks((prev) => {
      const next = updater(prev);

      // ✅ 오프라인/온라인 모두 로컬 최신화 (updatedAt 포함)
      saveJSON(LS_KEY, next);
      saveJSON(LS_TASKS_AT, Date.now());

      // ✅ 온라인이면 서버에도 저장 (다른 기기 연동 핵심)
      if (uid && hydrated && navigator.onLine) {
        void saveTasks(uid, next);
      }

      return next;
    });
  };

  const setCohortAndSave = (nextCohort: CohortKey | "") => {
    setCohort(nextCohort);
    saveJSON(LS_COHORT, nextCohort);

    if (!uid || !hydrated) return;
    if (!nextCohort) return;

    if (navigator.onLine) void saveCohort(uid, nextCohort);
  };

  const value = useMemo(
    () => ({ uid, ready, hydrated, cohort, setCohort: setCohortAndSave, tasks, setTasksAndSave, reload }),
    [uid, ready, hydrated, cohort, tasks]
  );

  return <TasksCtx.Provider value={value}>{children}</TasksCtx.Provider>;
}

export function useTasksStore() {
  const v = useContext(TasksCtx);
  if (!v) throw new Error("useTasksStore must be used within TasksProvider");
  return v;
}

function loadJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveJSON<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}
