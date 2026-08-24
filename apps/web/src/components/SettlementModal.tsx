import { useState } from "react";
import { X } from "lucide-react";
import { api } from "../api";
import { money } from "../utils/format";

type Props = {
  relationshipId: string;
  balance: { owedToMe: number; iOwe: number; net: number; friend: { name: string } };
  onClose: () => void;
  onSettled: () => void;
};

export function SettlementModal({ relationshipId, balance, onClose, onSettled }: Props) {
  const maxAmount = balance.iOwe > 0 ? balance.iOwe : balance.owedToMe;
  const [amount, setAmount] = useState(String(maxAmount));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) { setError("Enter a valid amount."); return; }
    if (parsed > maxAmount) { setError(`Maximum settlement is ${money(maxAmount)}.`); return; }
    setLoading(true); setError("");
    try {
      const result = await api.createSettlement(relationshipId, parsed);
      setSuccess(result.message || "Settlement recorded.");
      setTimeout(onSettled, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create settlement");
    } finally { setLoading(false); }
  }

  if (maxAmount <= 0) {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-head">
            <h3>Settle Balance</h3>
            <button className="icon-btn" onClick={onClose}><X size={18} /></button>
          </div>
          <div className="empty">You are settled up with {balance.friend.name}.</div>
          <div className="modal-actions">
            <button className="secondary" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="eyebrow">SETTLE BALANCE</div>
            <h3>You owe {balance.friend.name} {money(balance.iOwe > 0 ? balance.iOwe : balance.owedToMe)}</h3>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        {success ? (
          <div className="success-message">
            <div className="success-icon">✓</div>
            <p>{success}</p>
          </div>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)}>
            <label>
              Settlement amount (₹)
              <input type="number" step="0.01" min="0.01" max={maxAmount} value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </label>
            <div className="settle-quick-actions">
              <button type="button" className="secondary small" onClick={() => setAmount(String(maxAmount))}>Full: {money(maxAmount)}</button>
            </div>
            {error && <div className="error">{error}</div>}
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className="primary" disabled={loading}>
                {loading ? "Recording..." : `Settle ${money(parseFloat(amount) || 0)}`}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
