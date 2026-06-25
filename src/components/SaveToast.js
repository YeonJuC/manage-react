import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export default function SaveToast({ toast }) {
    if (!toast)
        return null;
    const icon = toast.type === "success" ? "✓" : toast.type === "warning" ? "!" : "×";
    return (_jsxs("div", { className: `saveToast saveToast--${toast.type}`, role: "status", "aria-live": "polite", children: [_jsx("span", { className: "saveToast__icon", children: icon }), _jsx("span", { className: "saveToast__text", children: toast.text })] }));
}
