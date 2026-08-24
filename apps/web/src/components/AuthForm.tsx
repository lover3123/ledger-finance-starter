import { useState } from "react";
import type { User } from "@ledger/shared";
import { api } from "../api";

type Props = { onAuth: (user: User) => void };

export function AuthForm({ onAuth }: Props) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("demo@ledger.local");
  const [password, setPassword] = useState("Demo@12345");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = mode === "login" ? await api.login({ email, password }) : await api.register({ name, email, password });
      localStorage.setItem("ledger_token", response.token);
      onAuth(response.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return <div className="auth-page"><div className="auth-panel">
    <div className="eyebrow">PERSONAL FINANCE / 2026</div><h1>Ledger</h1>
    <p className="muted">A calm place to understand where your money goes.</p>
    <form onSubmit={submit}>
      {mode === "register" && <label>Name<input value={name} onChange={(event) => setName(event.target.value)} required /></label>}
      <label>Email<input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required /></label>
      <label>Password<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required /></label>
      {error && <div className="error">{error}</div>}
      <button className="primary" disabled={loading}>{loading ? "Working..." : mode === "login" ? "Sign in" : "Create account"}</button>
    </form>
    <button className="link-btn" onClick={() => setMode(mode === "login" ? "register" : "login")}>{mode === "login" ? "Create an account" : "I already have an account"}</button>
    <div className="demo-note">Demo: demo@ledger.local / Demo@12345</div>
  </div></div>;
}
