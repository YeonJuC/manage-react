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

export function TasksProvider({ children }: { children: React.ReactNode }) {
  const [uid, setUid] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const [hydrated, setHydrated] = useState(false);
  const [cohort, setCohort] = useState<CohortKey | "">("");
  const [tasks, setTasks] = useState<Task[]>([]);

  // TEST
  useEffect(() => {
    console.log("[TasksStore]", { uid, ready, hydrated, cohort, tasksLen: tasks.length });
  }, [uid, ready, hydrated, cohort, tasks]);

  useEffect(() => {
    const onOnline = () => {
      console.info("[TasksStore] back online -> reload");
      void reload();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
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
      // ✅ 로그아웃이면 로컬에서라도 보여주고 싶으면 아래 두 줄로 바꿔도 됨
      // setCohort(loadJSON<CohortKey | "">(LS_COHORT, ""));
      // setTasks(loadJSON<Task[]>(LS_KEY, []));
      setTasks([]);
      setCohort("");
      setHydrated(true);
      return;
    }

    setHydrated(false);

    const fallbackToLocal = (reason: unknown) => {
      if (reason === "timeout") {
        console.info("[TasksStore][reload] using local cache");
      } else {
        console.warn("[TasksStore][reload] fallback local", reason);
      }

      setCohort(loadJSON(LS_COHORT, ""));
      setTasks(loadJSON(LS_KEY, []));
    };

    // 5초만 기다리고 타임아웃이면 로컬
    const timeout = new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 8000));

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

      // ✅ Firestore에서 정상 로드했으면 로컬도 갱신(오프라인 대비)
      saveJSON(LS_COHORT, savedCohort ?? "");
      saveJSON(LS_KEY, savedTasks ?? []);
    } catch (e) {
      console.warn("[TasksStore][reload] failed -> fallback local", e);
      fallbackToLocal(e);
    } finally {
      setHydrated(true);
    }
  };

  useEffect(() => {
    if (!uid) return;

    const id = setTimeout(() => {
      void reload();
    }, 300); // 0.3초만 딜레이

    return () => clearTimeout(id);
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
        void saveTasks(uid, next);
        // ✅ 로컬에도 저장
        saveJSON(LS_KEY, next);
        return next;
      });

      // ✅ 로컬에도 저장
      saveJSON(LS_COHORT, cohort);
    })();
  }, [uid, hydrated, cohort]);

  // 4) 수정은 무조건 이 함수로만
  const setTasksAndSave = (updater: (prev: Task[]) => Task[]) => {
    setTasks((prev) => {
      const next = updater(prev);

      // ✅ 로컬에는 항상 저장
      saveJSON(LS_KEY, next);

      // ✅ Firestore는 uid+hydrated일 때만
      if (uid && hydrated) void saveTasks(uid, next);

      return next;
    });
  };

  const setCohortAndSave = (nextCohort: CohortKey | "") => {
    setCohort(nextCohort);

    // ✅ 로컬에는 항상 저장
    saveJSON(LS_COHORT, nextCohort);

    if (!uid || !hydrated) return;
    if (!nextCohort) return;

    void saveCohort(uid, nextCohort);
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

/** ✅ 로컬스토리지 유틸 (타입 안전) */
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
