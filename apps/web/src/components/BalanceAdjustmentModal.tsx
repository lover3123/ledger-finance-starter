import { useState } from "react";
import { Plus, Minus } from "lucide-react";
import { api } from "../api";
import { money } from "../utils/format";

type Props = { currentBalance: number; onClose: () => void; onSaved: () => void };

export function BalanceAdjustmentModal({ currentBalance, onClose, onSaved }: Props) {
  const [sign, setSign] = useState<"+1" | "-1">("+1");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const numericAmount = Number(amount);
  const canSubmit = numericAmount > 0 && reason.trim().length > 0;

  async function handleSave() {
    if (!canSubmit) return;
    setSaving(true);
    setError("");
    try {
      await api.addBalanceAdjustment({
        amount: numericAmount * Number(sign),
        reason: reason.trim()
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save adjustment");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="eyebrow">BALANCE ADJUSTMENT</div>
            <h3>Adjust balance</h3>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div style={{ marginBottom: "16px" }}>
          <span style={{ fontSize: "12px", color: "#718096", fontWeight: 700 }}>Current calculated balance</span>
          <div style={{ fontSize: "28px", fontWeight: 800, letterSpacing: "-1px", marginTop: "4px", fontVariantNumeric: "tabular-nums" }}>
            {money(currentBalance)}
          </div>
        </div>

        <div style={{ display: "grid", gap: "14px" }}>
          <div>
            <label style={{ fontSize: "12px", fontWeight: 700, color: "#5f6d80", display: "block", marginBottom: "7px" }}>Adjustment</label>
            <div style={{ display: "flex", gap: "6px" }}>
              <button
                type="button"
                onClick={() => setSign("+1")}
                style={{
                  flex: 1, padding: "10px", border: `2px solid ${sign === "+1" ? "#20835b" : "#e2e7ee"}`,
                  borderRadius: "10px", background: sign === "+1" ? "#ecfaf4" : "#fff",
                  color: sign === "+1" ? "#20835b" : "#7a8492", fontWeight: 700, display: "flex",
                  alignItems: "center", justifyContent: "center", gap: "6px", cursor: "pointer"
                }}
              >
                <Plus size={16} /> Increase
              </button>
              <button
                type="button"
                onClick={() => setSign("-1")}
                style={{
                  flex: 1, padding: "10px", border: `2px solid ${sign === "-1" ? "#c05050" : "#e2e7ee"}`,
                  borderRadius: "10px", background: sign === "-1" ? "#fdecec" : "#fff",
                  color: sign === "-1" ? "#c05050" : "#7a8492", fontWeight: 700, display: "flex",
                  alignItems: "center", justifyContent: "center", gap: "6px", cursor: "pointer"
                }}
              >
                <Minus size={16} /> Decrease
              </button>
            </div>
          </div>

          <label>
            Amount
            <input
              type="number"
              min="1"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="500"
              required
            />
          </label>

          <label>
            Reason
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Cash balance correction"
              maxLength={200}
              required
            />
          </label>
        </div>

        {error && <div className="error" style={{ marginTop: "12px" }}>{error}</div>}

        <div className="modal-actions" style={{ marginTop: "16px" }}>
          <button className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary" onClick={() => void handleSave()} disabled={!canSubmit || saving}>
            {saving ? "Saving…" : "Save adjustment"}
          </button>
        </div>
      </div>
    </div>
  );
}
