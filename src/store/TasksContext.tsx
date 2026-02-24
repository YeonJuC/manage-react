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
import { materializeTemplatesForCohort, isDismissed, removeCustomTemplate, dismissTemplateForCohort } from "./customTemplates";
import { cohortDates } from "../data/cohortDates"; 

type Ctx = {
  uid: string | null;
  ready: boolean;
  hydrated: boolean;

  // 현재 보고 있는 데이터(내 데이터 / 공용 데이터)
  viewMode: "mine" | "common";
  setViewMode: (m: "mine" | "common") => void;
  // 실제 Firestore 경로에 쓰는 소유자 UID
  ownerUid: string | null;

  // 공용 데이터 소유자 UID(특정 1명)
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

function readInitialCommonOwnerUid(): string | null {
  const fromEnv = import.meta.env.VITE_COMMON_OWNER_UID as string | undefined;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  if (typeof window === "undefined") return null;
  const fromLS = localStorage.getItem("commonOwnerUid");
  return fromLS && fromLS.trim() ? fromLS.trim() : null;
}

function getOwnerUid(authUid: string | null, viewMode: "mine" | "common", commonOwnerUid: string | null) {
  if (!authUid) return null;
  if (viewMode === "mine") return authUid;
  return commonOwnerUid ?? null;
}

function lsKey(base: string, ownerUid: string | null) {
  return ownerUid ? `${base}:${ownerUid}` : base;
}

// ✅ 로컬스토리지 키 (ownerUid별로 분리해서 섞임 방지)
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

  // ✅ 공용 데이터(특정 상대 1명) UID
  // 우선순위: (.env) VITE_COMMON_OWNER_UID → localStorage(commonOwnerUid)
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
    } catch {
      // ignore
    }
  }, []);

  const LS_VIEWMODE = "manage-react:viewMode";
  const [viewMode, setViewModeState] = useState<"mine" | "common">(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(LS_VIEWMODE) : null;
      if (raw === "mine" || raw === "common") return raw;
    } catch {
      // ignore
    }
    return "mine";
  });

  const setViewMode = useCallback((m: "mine" | "common") => {
    setViewModeState(m);
    try {
      if (typeof window !== "undefined") localStorage.setItem(LS_VIEWMODE, m);
    } catch {
      // ignore
    }
  }, []);

  // ✅ 링크로 접속했을 때 기본 화면: 공용 UID가 설정되어 있고,
  //    '공용 소유자'가 아닌 사용자는 기본적으로 공용 화면을 먼저 보여줌.
  //    (단, 사용자가 이미 viewMode를 선택해 저장해둔 경우는 존중)
  const didAutoPickViewMode = useRef(false);
  useEffect(() => {
    if (didAutoPickViewMode.current) return;
    if (!ready) return;
    if (!uid) return;

    let hasPref = false;
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(LS_VIEWMODE) : null;
      hasPref = raw === "mine" || raw === "common";
    } catch {
      hasPref = false;
    }
    if (hasPref) {
      didAutoPickViewMode.current = true;
      return;
    }

    if (commonOwnerUid && uid !== commonOwnerUid) {
      setViewMode("common");
    } else {
      setViewMode("mine");
    }
    didAutoPickViewMode.current = true;
  }, [ready, uid, commonOwnerUid, setViewMode]);
  const ownerUid = useMemo(
    () => getOwnerUid(uid, viewMode, commonOwnerUid),
    [uid, viewMode, commonOwnerUid]
  );

  // ✅ 현재 화면 상태(tasks/cohort)가 어떤 ownerUid 기준인지 추적
  // (내/공용 토글 시, 이전 ownerUid의 state가 새 ownerUid에 저장되는 사고 방지)
  const [stateOwnerUid, setStateOwnerUid] = useState<string | null>(null);

  // ✅ reload 경쟁(race) 방지용 시퀀스
  const reloadSeq = useRef(0);

  const [hydrated, setHydrated] = useState(false);
  const [cohort, setCohort] = useState<CohortKey | "">("");
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    console.log("[TasksStore]", { uid, ownerUid, viewMode, ready, hydrated, cohort, tasksLen: tasks.length });
  }, [uid, ownerUid, viewMode, ready, hydrated, cohort, tasks]);

  // ✅ 온라인 복귀 시 자동 reload (다른 기기 변경사항 반영)
  useEffect(() => {
    if (!ownerUid) return;
    const onOnline = () => void reload();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerUid]);

  // 1) auth 상태
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUid(u?.uid ?? null);
      setReady(true);
    });
    return () => unsub();
  }, []);

  // 2) uid/ownerUid/viewMode 바뀌면 로드
  const reload = useCallback(async () => {
    console.log("[TasksStore][reload] start", { uid, ownerUid, viewMode });

    // ✅ 이 reload 호출의 고유 번호 (늦게 끝난 이전 호출이 state를 덮어쓰지 않게)
    const seq = ++reloadSeq.current;

    if (!uid || !ownerUid) {
      setTasks([]);
      setCohort("");
      setHydrated(true);
      return;
    }

    setHydrated(false);

    const fallbackToLocal = (reason: unknown) => {
      if (reason === "timeout") console.info("[TasksStore][reload] using local cache");
      else console.warn("[TasksStore][reload] fallback local", reason);

      setCohort(loadJSON<CohortKey | "">(lsKey(LS_COHORT_BASE, ownerUid), ""));
      setTasks(loadJSON<Task[]>(lsKey(LS_TASKS_BASE, ownerUid), []));
    };

    // 8초 타임아웃
    const timeout = new Promise<"timeout">((resolve) =>
      setTimeout(() => resolve("timeout"), 8000)
    );

    try {
      const job = Promise.all([loadCohort(ownerUid), loadTasks(ownerUid)]);
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

      // ✅ ownerUid가 바뀌었는데 늦게 도착한 결과면 무시
      if (seq !== reloadSeq.current) return;

      setCohort(savedCohort ?? "");
      setTasks(filteredTasks);


      // ✅ cohort는 로컬 갱신(owners별로 분리)
      saveJSON(lsKey(LS_COHORT_BASE, ownerUid), savedCohort ?? "");

      // ⚠️ tasks는 loadTasks()가 이미 "서버/로컬 최신판정 + 로컬 저장"까지 할 수 있으니
      // 여기서 굳이 saveJSON(LS_KEY, ...)로 다시 덮어쓰지 않는 게 안정적
      // (필요하면 남겨도 되지만 updatedAt을 같이 맞춰야 함)
    } catch (e) {
      console.warn("[TasksStore][reload] failed -> fallback local", e);
      fallbackToLocal(e);
    } finally {
      if (seq === reloadSeq.current) setHydrated(true);
    }
  }, [uid, ownerUid, viewMode]);

  // ✅ ownerUid가 바뀌는 순간: 화면 state를 즉시 "미로드" 상태로 돌려놓고
  // 이전 ownerUid의 tasks/cohort가 새 ownerUid에 저장되는 것을 원천 차단
  useEffect(() => {
    if (!uid || !ownerUid) return;
    if (stateOwnerUid === ownerUid) return;
    setStateOwnerUid(ownerUid);
    setHydrated(false);
    setTasks([]);
    setCohort("");
  }, [uid, ownerUid, stateOwnerUid]);

  // ✅ uid/ownerUid가 바뀌면 즉시 reload (내/공용 토글 포함)
  useEffect(() => {
    if (!uid || !ownerUid) return;
    void reload();
  }, [uid, ownerUid, reload]);

  // 3) cohort 바뀌면 저장 + 템플릿 보장
  useEffect(() => {
    if (!uid || !ownerUid) return;
    if (!hydrated) return;
    if (!cohort) return;

    // ✅ mine 모드에서는 ownerUid가 반드시 내 uid여야만 실행 (섞임 방지)
    if (viewMode === "mine" && ownerUid !== uid) return;

    const ck = cohort as CohortKey;

    // ✅ 공용 모드에서는 자동 시드/원격 cohort 저장을 하지 않음(실수로 공용 데이터 변형 방지)
    if (viewMode === "common") {
      saveJSON(lsKey(LS_COHORT_BASE, ownerUid), cohort);
      return;
    }

    (async () => {
      await saveCohort(ownerUid, ck);

      setTasks((prev) => {
        let next = prev;

        // ✅ 기본 템플릿은 "최초 1회만" 시드
        const seeded = loadSeeded(ownerUid);
        const seededKey = String(ck);

        if (!seeded[seededKey]) {
          next = ensureTemplatesForCohort(next, ck);

          seeded[seededKey] = true;
          saveSeeded(ownerUid, seeded);
        }

        // ✅ 커스텀 템플릿은 매번 반영(중복은 스킵)
        const toAdd = materializeTemplatesForCohort(ck);
        const existsTemplateIds = new Set(
          next.filter((t) => t.templateId).map((t) => t.templateId)
        );


        for (const it of toAdd) {
          if (!it.templateId) continue;

          // ⭐ 이미 있는 템플릿이면 스킵
          if (existsTemplateIds.has(it.templateId)) continue;

          // ⭐ 이 기수에서 삭제된 템플릿이면 스킵
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

        // 🔒 여기서는 절대 원격(saveTasks) 호출 금지.
        // (초기 reload 때 prev가 비어있으면 템플릿 1개로 서버를 덮어쓰는 사고가 발생)
        // 대신 로컬 캐시만 갱신하고, 실제 원격 저장은 사용자의 변경(setTasksAndSave)에서만 수행.
        saveJSON(lsKey(LS_TASKS_BASE, ownerUid), next);
        saveJSON(lsKey(LS_TASKS_AT_BASE, ownerUid), Date.now());

        return next;
      });

      saveJSON(lsKey(LS_COHORT_BASE, ownerUid), ck);
    })();
  }, [uid, ownerUid, viewMode, hydrated, cohort]);

  // 4) 수정은 무조건 이 함수로만
  const setTasksAndSave = (updater: (prev: Task[]) => Task[]) => {
    setTasks((prev) => {
      const next = updater(prev);

      // ✅ 오프라인/온라인 모두 로컬 최신화 (ownerUid별로 분리)
      if (ownerUid) {
        saveJSON(lsKey(LS_TASKS_BASE, ownerUid), next);
        saveJSON(lsKey(LS_TASKS_AT_BASE, ownerUid), Date.now());
      }

      // ✅ 온라인이면 서버에도 저장 (공용 모드도 멤버 권한(editor/owner) 있으면 가능)
      if (ownerUid && hydrated && navigator.onLine) {
        void saveTasks(ownerUid, next);
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
    if (ownerUid) saveJSON(lsKey(LS_COHORT_BASE, ownerUid), nextCohort);

    if (!uid || !ownerUid || !hydrated) return;
    if (!nextCohort) return;

    // 공용 모드에서는 원격 cohort 저장을 하지 않음
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