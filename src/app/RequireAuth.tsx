import React, { useEffect, useState } from "react";
import {
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
} from "firebase/auth";
import { auth } from "../firebase";

function LoginModal() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "grid",
        placeItems: "center",
        zIndex: 9999,
        padding: 16,
      }}
    >
      <div
        style={{
          width: "min(420px, 100%)",
          background: "#fff",
          borderRadius: 16,
          border: "1px solid var(--border)",
          padding: 18,
        }}
      >
        <h2 style={{ margin: 0 }}>로그인</h2>
        <p style={{ marginTop: 8, color: "var(--muted)" }}>
          Google 계정으로 로그인해주시길 바랍니다.
        </p>

        <button
          className="btn"
          style={{ width: "100%", marginTop: 10, height: 42, borderRadius: 12 }}
          onClick={async () => {
            const provider = new GoogleAuthProvider();
            await signInWithPopup(auth, provider);
          }}
        >
          Google로 로그인
        </button>
      </div>
    </div>
  );
}

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setLoggedIn(!!u);
      setReady(true);
    });
    return () => unsub();
  }, []);

  if (!ready) return <div className="card" style={{ padding: 16 }}>로딩 중…</div>;

  // ✅ 로그인 안 됐으면 라우팅으로 튕기지 말고 모달로 로그인 유도
  if (!loggedIn) return <LoginModal />;

  return <>{children}</>;
}
