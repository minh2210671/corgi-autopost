"use client";

import { useState } from "react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setLoading(false);
    if (res.ok) window.location.href = "/";
    else setError((await res.json()).error || "Đăng nhập thất bại");
  }

  return (
    <main className="login">
      <form className="card login-card" onSubmit={submit}>
        <div className="logo">🐶</div>
        <h1>Corgi Auto Post</h1>
        <p className="muted">Nhập mật khẩu để tiếp tục</p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Mật khẩu"
          autoFocus
        />
        {error && <p className="error">{error}</p>}
        <button className="btn primary" disabled={loading || !password}>
          {loading ? "Đang kiểm tra…" : "Đăng nhập"}
        </button>
      </form>
    </main>
  );
}
