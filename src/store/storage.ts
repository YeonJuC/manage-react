import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
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

export function loadLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveLocal<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function clearLocal(key: string) {
  localStorage.removeItem(key);
}

export function saveJSONLocal<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

// ===== Remote (Firestore) =====
export async function loadJSONRemote<T>(uid: string, key: string): Promise<T | null> {
  const ref = doc(db, "users", uid, "data", key);
  console.log("[FS] get start", ref.path);

  try {
    const snap = await getDoc(ref);
    console.log("[FS] get done", ref.path, "exists=", snap.exists());
    if (!snap.exists()) return null;
    return (snap.data()?.value ?? null) as T | null;
  } catch (e) {
    console.error("[FS] get failed", ref.path, e);
    return null;
  }
}

export async function saveJSONRemote<T>(uid: string, key: string, value: T): Promise<void> {
  const ref = doc(db, "users", uid, "data", key);
  await setDoc(ref, { value, updatedAt: serverTimestamp() }, { merge: true });
}


