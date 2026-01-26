import { createContext, useContext, useEffect, useMemo, useState } from "react";
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
import { materializeTemplatesForCohort, isDismissed, removeCustomTemplate, dismissTemplateForCohort } from "./customTemplates";
import { cohortDates } from "../data/cohortDates"; 

type Ctx = {
  uid: string | null;
  ready: boolean;
  hydrated: boolean;

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

// ✅ 로컬스토리지 키
const LS_SEEDED = "manage-react:seededCohorts";
function loadSeeded(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(LS_SEEDED) || "{}"); } catch { return {}; }
}
function saveSeeded(m: Record<string, boolean>) {
  localStorage.setItem(LS_SEEDED, JSON.stringify(m));
}

const LS_COHORT = "manage-react:cohort";
const LS_KEY = "manage-react:tasks";
const LS_TASKS_AT = "manage-react:tasksUpdatedAt";


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

      const filteredTasks = (savedTasks ?? []).filter((t) => {
        // 커스텀 템플릿에서 생성된 task이고
        if (t.origin === "custom" && t.templateId) {
          // 이 기수에서 dismiss된 템플릿이면 제외
          return !isDismissed(String(savedCohort), t.templateId);
        }
        return true;
      });

      setCohort(savedCohort ?? "");
      setTasks(filteredTasks);


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
        let next = prev;

        // ✅ 기본 템플릿은 "최초 1회만" 시드
        const seeded = loadSeeded();
        const seededKey = String(cohort);

        if (!seeded[seededKey]) {
          next = ensureTemplatesForCohort(next, cohort);

          seeded[seededKey] = true;
          saveSeeded(seeded);
        }

        // ✅ 커스텀 템플릿은 매번 반영(중복은 스킵)
        const toAdd = materializeTemplatesForCohort(cohort as CohortKey);
        const existsTemplateIds = new Set(
          next.filter((t) => t.templateId).map((t) => t.templateId)
        );


        for (const it of toAdd) {
          if (!it.templateId) continue;

          // ⭐ 이미 있는 템플릿이면 스킵
          if (existsTemplateIds.has(it.templateId)) continue;

          // ⭐ 이 기수에서 삭제된 템플릿이면 스킵
          if (isDismissed(String(cohort), it.templateId)) continue;

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

        // 저장은 기존 로직대로
        if (navigator.onLine) void saveTasks(uid, next);
        else {
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

  const bulkUpdateByTemplateId = (
    templateId: string,
    patch: Partial<Pick<Task, "title" | "assignee" | "dueDate" | "phase">>
  ) => {
    setTasksAndSave((prev) =>
      prev.map((t) => (t.templateId === templateId ? { ...t, ...patch } : t))
    );
  };

  // ✅ 전 기수 일괄 삭제
  const bulkDeleteByTemplateId = (templateId: string) => {
    // ✅ 1) 템플릿 자체 삭제(재생성 원천 차단)
    removeCustomTemplate(templateId);

    // ✅ 2) 32~35 모두 dismiss 기록(혹시 로컬 꼬임/캐시 남아도 재추가 방지)
    (Object.keys(cohortDates) as CohortKey[]).forEach((ck) => {
      dismissTemplateForCohort(String(ck), templateId);
    });

    // ✅ 3) 현재 tasks에서도 전부 제거
    setTasksAndSave((prev) => prev.filter((t) => t.templateId !== templateId));
  };

  // ✅ 전 기수(32~35)에 템플릿 1개를 즉시 생성 반영
  const applyTemplateToAllCohorts = (tpl: {
    templateId: string;
    title: string;
    assignee?: string;
    offsetDays: number;
  }) => {
    setTasksAndSave((prev) => {
      let next = prev;

      // 32~35만 대상: cohortDates에 있는 것만
      const cohortKeys = Object.keys(cohortDates) as CohortKey[];

      // 중복 방지: cohort|templateId
      const exists = new Set(
        next
          .filter((t) => t.templateId)
          .map((t) => `${t.cohort}|${t.templateId}`)
      );

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

  const setCohortAndSave = (nextCohort: CohortKey | "") => {
    setCohort(nextCohort);
    saveJSON(LS_COHORT, nextCohort);

    if (!uid || !hydrated) return;
    if (!nextCohort) return;

    if (navigator.onLine) void saveCohort(uid, nextCohort);
  };

  const value = useMemo(
    () => ({ uid, ready, hydrated, cohort, setCohort: setCohortAndSave, 
      tasks, setTasksAndSave, reload, applyTemplateToAllCohorts, 
      bulkUpdateByTemplateId, bulkDeleteByTemplateId }),
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