import { useEffect, useState, type ReactNode } from "react";
import { onAuthStateChanged, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth } from "../firebase";

function LoginModal() {
  const [signingIn, setSigningIn] = useState(false);

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
        <p style={{ marginTop: 8, color: "var(--muted)" }}>Google 계정으로 로그인해주시길 바랍니다.</p>

        <button
          className="btn"
          style={{ width: "100%", marginTop: 10, height: 42, borderRadius: 12 }}
          disabled={signingIn}
          onClick={async () => {
            if (signingIn) return;
            setSigningIn(true);
            try {
              const provider = new GoogleAuthProvider();
              await signInWithPopup(auth, provider);
            } catch (e: any) {
              if (e?.code === "auth/popup-closed-by-user") return;
              if (e?.code === "auth/cancelled-popup-request") return;
              console.error(e);
              alert(e?.message ?? "로그인 실패");
            } finally {
              setSigningIn(false);
            }
          }}
        >
          {signingIn ? "로그인 중..." : "Google로 로그인"}
        </button>
      </div>
    </div>
  );
}

export default function RequireAuth({ children }: { children: ReactNode }) {
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
  if (!loggedIn) return <LoginModal />;

  return <>{children}</>;
}

