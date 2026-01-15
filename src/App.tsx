import { Link, Route, Routes } from "react-router-dom";
import Home from "./pages/Home";
import About from "./pages/About";
import NotFound from "./pages/NotFound";

export default function App() {
  return (
    <div style={{ padding: 20, fontFamily: "system-ui, sans-serif" }}>
      <header style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <Link to="/">Home</Link>
        <Link to="/about">About</Link>
      </header>

      <main style={{ border: "1px solid #eee", padding: 16, borderRadius: 12 }}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </div>
  );
}

