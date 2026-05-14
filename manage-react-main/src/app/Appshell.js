import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { NavLink, Outlet } from "react-router-dom";
import { onAuthStateChanged, signOut, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { useEffect, useState } from "react";
import { auth } from "../firebase";
const linkStyle = ({ isActive }) => ({
    display: "block",
    padding: "10px 12px",
    borderRadius: 10,
    textDecoration: "none",
    color: isActive ? "#111" : "#555",
    background: isActive ? "#eef2ff" : "transparent",
    fontWeight: isActive ? 700 : 600,
});
export default function AppShell() {
    const [userName, setUserName] = useState("");
    const [loggedIn, setLoggedIn] = useState(false);
    useEffect(() => {
        const unsub = onAuthStateChanged(auth, (u) => {
            setLoggedIn(!!u);
            setUserName(u?.displayName ?? u?.email ?? "");
        });
        return () => unsub();
    }, []);
    return (_jsxs("div", { className: "app", children: [_jsxs("aside", { className: "sidebar", children: [_jsx("div", { className: "brand", children: "AI\u22C5BigData_Manage" }), _jsxs("nav", { className: "nav", children: [_jsx(NavLink, { to: "/", style: linkStyle, end: true, children: "\uB300\uC2DC\uBCF4\uB4DC" }), _jsx(NavLink, { to: "/tasks", style: linkStyle, children: "\uD560 \uC77C" }), _jsx(NavLink, { to: "/calendar", style: linkStyle, children: "\uCE98\uB9B0\uB354" }), _jsx("div", { className: "nav-divider" }), _jsx("div", { className: "nav-section-title", children: "\uBC14\uB85C\uAC00\uAE30" }), _jsx("a", { className: "nav-external", href: "https://youth.posco.com/posco/edu/index.php?mod=academy&pag=aca01#khwhat", target: "_blank", rel: "noreferrer", children: "AI \u22C5 BigData \uC544\uCE74\uB370\uBBF8 \uD648\uD398\uC774\uC9C0" }), _jsx("a", { className: "nav-external", href: "https://notice-app-f3aa0.web.app/", target: "_blank", rel: "noreferrer", children: "\uAD50\uC721\uC0DD \uACF5\uC9C0 \uB300\uC2DC\uBCF4\uB4DC" }), _jsx("a", { className: "nav-external", href: "https://posco.atosoft.kr/worknet/Course/CourseList.asp", target: "_blank", rel: "noreferrer", children: "\uB300\uD55C\uC0C1\uC758 LMS(\uCD9C\uACB0)" }), _jsx("a", { className: "nav-external", href: "https://attendance-checkin-d1a9b.web.app/admin", target: "_blank", rel: "noreferrer", children: "\uC790\uCCB4 \uCD9C\uC11D\uCCB4\uD06C" })] }), _jsx("div", { className: "sidebar-footer auth-float", children: loggedIn ? (_jsxs("div", { style: { border: "1px solid var(--border)", background: "#fff", borderRadius: 14, padding: 12, display: "grid", gap: 10 }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }, children: [_jsxs("div", { style: { minWidth: 0 }, children: [_jsx("div", { style: { fontSize: 14, fontWeight: 800, lineHeight: 1.2 }, children: userName || "사용자" }), _jsx("div", { style: { fontSize: 12, color: "var(--muted)", marginTop: 4 }, children: "\uB85C\uADF8\uC778\uB428" })] }), _jsx("span", { style: { width: 10, height: 10, borderRadius: 999, background: "#22c55e", flex: "0 0 auto" } })] }), _jsx("button", { className: "btn", style: { width: "100%", height: 40, borderRadius: 12, marginTop: 2 }, onClick: () => signOut(auth), children: "\uB85C\uADF8\uC544\uC6C3" })] })) : (_jsxs("div", { style: { border: "1px solid var(--border)", background: "#fff", borderRadius: 14, padding: 12, display: "grid", gap: 10 }, children: [_jsx("div", { style: { fontSize: 13, color: "var(--muted)" }, children: "\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4" }), _jsx("button", { className: "btn", style: { width: "100%", height: 40, borderRadius: 12 }, onClick: async () => {
                                        const provider = new GoogleAuthProvider();
                                        await signInWithPopup(auth, provider);
                                    }, children: "\uB85C\uADF8\uC778" })] })) })] }), _jsxs("div", { className: "main", children: [_jsx("header", { className: "topbar", children: _jsx("div", { className: "topbar-title", children: "\uAD00\uB9AC \uC2DC\uC2A4\uD15C" }) }), _jsx("main", { className: "content", children: _jsx(Outlet, {}) })] })] }));
}
