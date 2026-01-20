import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import { TasksProvider } from "./store/TasksContext";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <TasksProvider>
        <App />
      </TasksProvider>
    </HashRouter>
  </React.StrictMode>
);










