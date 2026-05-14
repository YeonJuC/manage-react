import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { onAuthStateChanged, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth } from "../firebase";
function LoginModal() {
    const [signingIn, setSigningIn] = useState(false);
    return (_jsx("div", { style: {
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "grid",
            placeItems: "center",
            zIndex: 9999,
            padding: 16,
        }, children: _jsxs("div", { style: {
                width: "min(420px, 100%)",
                background: "#fff",
                borderRadius: 16,
                border: "1px solid var(--border)",
                padding: 18,
            }, children: [_jsx("h2", { style: { margin: 0 }, children: "\uB85C\uADF8\uC778" }), _jsx("p", { style: { marginTop: 8, color: "var(--muted)" }, children: "Google \uACC4\uC815\uC73C\uB85C \uB85C\uADF8\uC778\uD574\uC8FC\uC2DC\uAE38 \uBC14\uB78D\uB2C8\uB2E4." }), _jsx("button", { className: "btn", style: { width: "100%", marginTop: 10, height: 42, borderRadius: 12 }, disabled: signingIn, onClick: async () => {
                        if (signingIn)
                            return;
                        setSigningIn(true);
                        try {
                            const provider = new GoogleAuthProvider();
                            await signInWithPopup(auth, provider);
                        }
                        catch (e) {
                            if (e?.code === "auth/popup-closed-by-user")
                                return;
                            if (e?.code === "auth/cancelled-popup-request")
                                return;
                            console.error(e);
                            alert(e?.message ?? "로그인 실패");
                        }
                        finally {
                            setSigningIn(false);
                        }
                    }, children: signingIn ? "로그인 중..." : "Google로 로그인" })] }) }));
}
export default function RequireAuth({ children }) {
    const [ready, setReady] = useState(false);
    const [loggedIn, setLoggedIn] = useState(false);
    useEffect(() => {
        const unsub = onAuthStateChanged(auth, (u) => {
            setLoggedIn(!!u);
            setReady(true);
        });
        return () => unsub();
    }, []);
    if (!ready)
        return _jsx("div", { className: "card", style: { padding: 16 }, children: "\uB85C\uB529 \uC911\u2026" });
    if (!loggedIn)
        return _jsx(LoginModal, {});
    return _jsx(_Fragment, { children: children });
}
