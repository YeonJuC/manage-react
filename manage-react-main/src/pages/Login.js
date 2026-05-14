import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth } from "../firebase";
export default function Login() {
    return (_jsxs("div", { children: [_jsx("h1", { children: "\uB85C\uADF8\uC778" }), _jsx("p", { style: { color: "var(--muted)" }, children: "Google \uACC4\uC815\uC73C\uB85C \uB85C\uADF8\uC778 \uD574\uC8FC\uC2DC\uAE38 \uBC14\uB78D\uB2C8\uB2E4." }), _jsx("button", { className: "btn", onClick: async () => {
                    const provider = new GoogleAuthProvider();
                    await signInWithPopup(auth, provider);
                }, children: "Google\uB85C \uB85C\uADF8\uC778" })] }));
}
