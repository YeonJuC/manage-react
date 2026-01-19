import { Route, Routes } from "react-router-dom";
import RequireAuth from "./RequireAuth";

import Dashboard from "../pages/Dashboard";
import Tasks from "../pages/Tasks";
import CalendarPage from "../pages/CalendarPage";
import NotFound from "../pages/NotFound";

export default function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <RequireAuth>
            <Dashboard />
          </RequireAuth>
        }
      />
      <Route
        path="/tasks"
        element={
          <RequireAuth>
            <Tasks />
          </RequireAuth>
        }
      />
      <Route
        path="/calendar"
        element={
          <RequireAuth>
            <CalendarPage />
          </RequireAuth>
        }
      />

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

