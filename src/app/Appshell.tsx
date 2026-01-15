import { NavLink } from "react-router-dom";
import AppRoutes from "./routes";

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
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">manage-react</div>

        <nav className="nav">
          <NavLink to="/" style={linkStyle} end>
            대시보드
          </NavLink>
          <NavLink to="/tasks" style={linkStyle}>
            할 일
          </NavLink>
          <NavLink to="/settings" style={linkStyle}>
            설정
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          <div className="hint">GitHub Pages 배포 OK</div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar-title">관리 시스템</div>
          <div className="topbar-actions">
            <button className="btn">새 항목</button>
          </div>
        </header>

        <main className="content">
          <AppRoutes />
        </main>
      </div>
    </div>
  );
}
