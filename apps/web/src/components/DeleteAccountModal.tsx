import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { api } from "../api";

type Props = { onClose: () => void; onDeleted: () => void };

export function DeleteAccountModal({ onClose, onDeleted }: Props) {
  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const canSubmit = confirmText === "DELETE" && password.length >= 8;

  async function handleDelete() {
    if (!canSubmit) return;
    setLoading(true);
    setError("");
    try {
      await api.deleteAccount(password);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete account. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="eyebrow" style={{ color: "#c05050" }}>DANGER ZONE</div>
            <h3>Delete your account?</h3>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>

        <p style={{ color: "#65748b", fontSize: "13px", margin: "0 0 16px", lineHeight: "1.6" }}>
          This action is permanent. Your account and associated Ledger data will be deleted and cannot be recovered.
        </p>

        <div style={{ background: "#fff5f5", border: "1px solid #ffd6d6", borderRadius: "12px", padding: "14px 16px", marginBottom: "16px", display: "flex", gap: "10px", alignItems: "start" }}>
          <AlertTriangle size={18} style={{ color: "#c05050", flexShrink: 0, marginTop: 2 }} />
          <p style={{ margin: 0, fontSize: "12px", color: "#8b4040", lineHeight: "1.5" }}>
            Permanently delete your Ledger account, transactions, budgets, profile, relationships, payment requests, notifications, and associated financial records.
          </p>
        </div>

        <div style={{ display: "grid", gap: "14px" }}>
          <label>
            Type <strong>DELETE</strong> to confirm
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder='Type "DELETE"'
              autoComplete="off"
              style={{ fontFamily: "monospace", letterSpacing: "2px" }}
            />
          </label>

          <label>
            Your password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              autoComplete="current-password"
            />
          </label>
        </div>

        {error && <div className="error" style={{ marginTop: "12px" }}>{error}</div>}

        <div className="modal-actions" style={{ marginTop: "16px" }}>
          <button className="secondary" onClick={onClose}>Cancel</button>
          <button
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "8px",
              border: "0", borderRadius: "12px", padding: "12px 16px",
              background: canSubmit ? "#d95b5b" : "#e2e7ee",
              color: canSubmit ? "#fff" : "#a0aab8",
              fontWeight: 800, cursor: canSubmit ? "pointer" : "not-allowed",
              boxShadow: canSubmit ? "0 8px 22px rgba(217,91,91,.22)" : "none"
            }}
            onClick={() => void handleDelete()}
            disabled={!canSubmit || loading}
          >
            {loading ? "Deleting…" : "Yes, permanently delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
