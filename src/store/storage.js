import { doc, getDoc, runTransaction, setDoc } from "firebase/firestore";
import { db } from "../firebase";
// ===== Local =====
export function loadJSONLocal(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw)
            return fallback;
        return JSON.parse(raw);
    }
    catch {
        return fallback;
    }
}
export function saveJSONLocal(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    }
    catch {
        // ignore
    }
}
export function clearLocal(key) {
    try {
        localStorage.removeItem(key);
    }
    catch {
        // ignore
    }
}
// ===== Remote (Firestore) =====
// 문서 경로: users/{uid}/data/{key}
// 문서 구조: { value: any, updatedAt: number }  // updatedAt은 "문서 기록용" (선택)
export async function loadJSONRemote(uid, key) {
    const ref = doc(db, "users", uid, "data", key);
    console.log("[FS] get start", ref.path);
    try {
        const snap = await getDoc(ref);
        console.log("[FS] get done", ref.path, "exists=", snap.exists());
        if (!snap.exists())
            return null;
        // value에 payload가 들어간다. (tasks는 {tasks, updatedAt:number} 형태로 저장)
        return (snap.data()?.value ?? null);
    }
    catch (e) {
        console.error("[FS] get failed", ref.path, e);
        // offline/timeout 등은 호출부에서 fallback 하면 됨
        return null;
    }
}
// value는 그대로 저장하되, 문서 레벨 updatedAt은 숫자로만(선택)
export async function saveJSONRemote(uid, key, value) {
    const ref = doc(db, "users", uid, "data", key);
    // 서버 timestamp 대신 number로 기록해도 충분 (디버깅/정렬용)
    // 동기화 비교는 value 내부 updatedAt(number)를 사용
    await setDoc(ref, { value, updatedAt: Date.now() }, { merge: true });
}

// ✅ tasks같이 여러 사용자가 동시에 수정 가능한 데이터는 스테일 덮어쓰기 방지
export async function saveJSONRemoteSafeTasks(uid, key, incoming) {
  const ref = doc(db, "users", uid, "data", key);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);

    if (!snap.exists()) {
      tx.set(ref, { value: incoming, updatedAt: Date.now() }, { merge: true });
      return;
    }

    const remoteValue = snap.data()?.value ?? null;
    const remoteUpdatedAt = typeof remoteValue?.updatedAt === "number" ? remoteValue.updatedAt : 0;

    if (incoming.updatedAt >= remoteUpdatedAt) {
      tx.set(ref, { value: incoming, updatedAt: Date.now() }, { merge: true });
      return;
    }

    const remoteTasks = Array.isArray(remoteValue?.tasks) ? remoteValue.tasks : [];
    const incomingTasks = Array.isArray(incoming.tasks) ? incoming.tasks : [];

    const byId = new Map();
    for (const t of remoteTasks) if (t && typeof t.id === "string") byId.set(t.id, t);
    for (const t of incomingTasks) if (t && typeof t.id === "string") byId.set(t.id, t);

    const merged = {
      tasks: Array.from(byId.values()),
      updatedAt: Math.max(remoteUpdatedAt, incoming.updatedAt),
    };

    tx.set(ref, { value: merged, updatedAt: Date.now() }, { merge: true });
  });
}
