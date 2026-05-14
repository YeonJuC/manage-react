import { NavLink, Outlet } from "react-router-dom";
import { onAuthStateChanged, signOut, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { useEffect, useState } from "react";
import { auth } from "../firebase";

const linkStyle = ({ isActive }: { isActive: boolean }) => ({
  display: "block",
  padding: "10px 12px",
  borderRadius: 10,
  textDecoration: "none",
  color: isActive ? "#111" : "#555",
  background: isActive ? "#eef2ff" : "transparent",
  fontWeight: isActive ? 700 : 600,
});

export default function AppShell() {
  const [userName, setUserName] = useState<string>("");
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setLoggedIn(!!u);
      setUserName(u?.displayName ?? u?.email ?? "");
    });
    return () => unsub();
  }, []);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">AI⋅BigData_Manage</div>

        <nav className="nav">
          <NavLink to="/" style={linkStyle} end>대시보드</NavLink>
          <NavLink to="/tasks" style={linkStyle}>할 일</NavLink>
          <NavLink to="/calendar" style={linkStyle}>캘린더</NavLink>
        </nav>

        <div className="sidebar-footer auth-float">
          {loggedIn ? (
            <div style={{ border: "1px solid var(--border)", background: "#fff", borderRadius: 14, padding: 12, display: "grid", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, lineHeight: 1.2 }}>{userName || "사용자"}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>로그인됨</div>
                </div>
                <span style={{ width: 10, height: 10, borderRadius: 999, background: "#22c55e", flex: "0 0 auto" }} />
              </div>

              <button className="btn" style={{ width: "100%", height: 40, borderRadius: 12, marginTop: 2 }} onClick={() => signOut(auth)}>
                로그아웃
              </button>
            </div>
          ) : (
            <div style={{ border: "1px solid var(--border)", background: "#fff", borderRadius: 14, padding: 12, display: "grid", gap: 10 }}>
              <div style={{ fontSize: 13, color: "var(--muted)" }}>로그인이 필요합니다</div>
              <button
                className="btn"
                style={{ width: "100%", height: 40, borderRadius: 12 }}
                onClick={async () => {
                  const provider = new GoogleAuthProvider();
                  await signInWithPopup(auth, provider);
                }}
              >
                로그인
              </button>
            </div>
          )}
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar-title">관리 시스템</div>
        </header>

        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}