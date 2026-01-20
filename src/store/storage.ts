import { doc, getDoc, setDoc } from "firebase/firestore";
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
