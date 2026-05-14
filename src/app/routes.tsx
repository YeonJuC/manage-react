import { Route, Routes } from "react-router-dom";
import RequireAuth from "./RequireAuth";
import AppShell from "./Appshell";

import Dashboard from "../pages/Dashboard";
import Tasks from "../pages/Tasks";
import CalendarPage from "../pages/CalendarPage";
import NotFound from "../pages/NotFound";

export default function AppRoutes() {
  return (
    <Routes>
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}




