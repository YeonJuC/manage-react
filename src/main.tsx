import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

/**
 * GitHub Pages 배포 시 repo명이 base 경로가 됨.
 * 예) https://username.github.io/manage  -> base = "/manage/"
 * 로컬에서는 "/"로 동작.
 *
 * 아래처럼 import.meta.env.BASE_URL 쓰면
 * vite.config.ts의 base 값과 자동으로 맞춰짐.
 */
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

