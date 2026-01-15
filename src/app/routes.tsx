import { Route, Routes } from "react-router-dom";
import Dashboard from "../pages/Dashboard";
import Tasks from "../pages/Tasks";
import Settings from "../pages/Settings";
import NotFound from "../pages/NotFound";

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/tasks" element={<Tasks />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
