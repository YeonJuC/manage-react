import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Route, Routes } from "react-router-dom";
import RequireAuth from "./RequireAuth";
import AppShell from "./Appshell";
import Dashboard from "../pages/Dashboard";
import Tasks from "../pages/Tasks";
import CalendarPage from "../pages/CalendarPage";
import NotFound from "../pages/NotFound";
export default function AppRoutes() {
    return (_jsx(Routes, { children: _jsxs(Route, { element: _jsx(RequireAuth, { children: _jsx(AppShell, {}) }), children: [_jsx(Route, { path: "/", element: _jsx(Dashboard, {}) }), _jsx(Route, { path: "/tasks", element: _jsx(Tasks, {}) }), _jsx(Route, { path: "/calendar", element: _jsx(CalendarPage, {}) }), _jsx(Route, { path: "*", element: _jsx(NotFound, {}) })] }) }));
}
