import { doc, getDoc, runTransaction, setDoc } from "firebase/firestore";
import { db } from "../firebase";

// ===== Local =====
export function loadJSONLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveJSONLocal<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

export function clearLocal(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

// ===== Remote (Firestore) =====
// 문서 경로: users/{uid}/data/{key}
// 문서 구조: { value: any, updatedAt: number }  // updatedAt은 "문서 기록용" (선택)
export async function loadJSONRemote<T>(uid: string, key: string): Promise<T | null> {
  const ref = doc(db, "users", uid, "data", key);
  console.log("[FS] get start", ref.path);

  try {
    const snap = await getDoc(ref);
    console.log("[FS] get done", ref.path, "exists=", snap.exists());
    if (!snap.exists()) return null;

    // value에 payload가 들어간다. (tasks는 {tasks, updatedAt:number} 형태로 저장)
    return (snap.data()?.value ?? null) as T | null;
  } catch (e) {
    console.error("[FS] get failed", ref.path, e);
    // offline/timeout 등은 호출부에서 fallback 하면 됨
    return null;
  }
}

// value는 그대로 저장하되, 문서 레벨 updatedAt은 숫자로만(선택)
export async function saveJSONRemote<T>(uid: string, key: string, value: T): Promise<void> {
  const ref = doc(db, "users", uid, "data", key);

  // 서버 timestamp 대신 number로 기록해도 충분 (디버깅/정렬용)
  // 동기화 비교는 value 내부 updatedAt(number)를 사용
  await setDoc(ref, { value, updatedAt: Date.now() }, { merge: true });
}

// ===== Remote Safe Write (Firestore) =====
// ✅ 데이터 "날아감"(stale overwrite) 방지용 안전 저장
// - Remote(updatedAt)가 더 최신이면: "덮어쓰기" 대신 "병합"하여 저장
// - Remote가 없거나 내가 더 최신이면: 내가 가진 값을 그대로 저장
//
// 사용처: tasks처럼 여러 사용자가 동시에 수정할 수 있는 payload
type TasksLike = { tasks: Array<{ id: string }>; updatedAt: number };

export async function saveJSONRemoteSafeTasks(
  uid: string,
  key: string,
  incoming: TasksLike
): Promise<void> {
  const ref = doc(db, "users", uid, "data", key);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);

    // 문서가 없으면 그대로 생성
    if (!snap.exists()) {
      tx.set(ref, { value: incoming, updatedAt: Date.now() }, { merge: true });
      return;
    }

    const remoteValue = (snap.data()?.value ?? null) as TasksLike | null;
    const remoteUpdatedAt = typeof remoteValue?.updatedAt === "number" ? remoteValue!.updatedAt : 0;

    // ✅ 내가 최신(또는 동일)이면: 그대로 저장 (삭제/대량수정 포함)
    if (incoming.updatedAt >= remoteUpdatedAt) {
      tx.set(ref, { value: incoming, updatedAt: Date.now() }, { merge: true });
      return;
    }

    // ✅ Remote가 더 최신이면: "덮어쓰기" 금지 → id 기준 병합
    // - Remote에만 있는 task는 유지(스테일 클라이언트의 실수 삭제 방지)
    // - Incoming에 있는 task는 Remote를 덮어씀(토글/담당자 변경 반영)
    const remoteTasks = Array.isArray(remoteValue?.tasks) ? remoteValue!.tasks : [];
    const incomingTasks = Array.isArray(incoming.tasks) ? incoming.tasks : [];

    const byId = new Map<string, any>();
    for (const t of remoteTasks) {
      if (t && typeof (t as any).id === "string") byId.set((t as any).id, t);
    }
    for (const t of incomingTasks) {
      if (t && typeof (t as any).id === "string") byId.set((t as any).id, t);
    }

    const mergedTasks = Array.from(byId.values());
    const merged: TasksLike = {
      tasks: mergedTasks as any,
      updatedAt: Math.max(remoteUpdatedAt, incoming.updatedAt),
    };

    tx.set(ref, { value: merged, updatedAt: Date.now() }, { merge: true });
  });
}
