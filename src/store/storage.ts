import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase";

// ✅ 1) loadJSON 오버로드
export function loadJSON<T>(key: string, fallback: T): T;
export async function loadJSON<T>(uid: string, key: string, fallback: T): Promise<T>;
export function loadJSON<T>(a: string, b: any, c?: any) {
  // (key, fallback) => localStorage
  if (typeof c === "undefined") {
    const key = a;
    const fallback = b as T;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  // (uid, key, fallback) => Firestore
  const uid = a;
  const key = b as string;
  const fallback = c as T;

  return (async () => {
    try {
      const ref = doc(db, "users", uid, "data", key);
      const snap = await getDoc(ref);
      if (!snap.exists()) return fallback;
      return snap.data().value as T;
    } catch {
      return fallback;
    }
  })();
}

// ✅ 2) saveJSON 오버로드
export function saveJSON<T>(key: string, value: T): void;
export async function saveJSON<T>(uid: string, key: string, value: T): Promise<void>;
export function saveJSON<T>(a: string, b: any, c?: any) {
  // (key, value) => localStorage
  if (typeof c === "undefined") {
    const key = a;
    const value = b as T;
    localStorage.setItem(key, JSON.stringify(value));
    return;
  }

  // (uid, key, value) => Firestore
  const uid = a;
  const key = b as string;
  const value = c as T;

  return (async () => {
    const ref = doc(db, "users", uid, "data", key);
    await setDoc(ref, { value }, { merge: true });
  })();
}


