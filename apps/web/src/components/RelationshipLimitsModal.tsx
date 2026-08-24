import { useState } from "react";
import { X } from "lucide-react";
import { api } from "../api";

type Props = {
  relationshipId: string;
  current: { monthlyLimit: number; maxTransaction: number; maxOutstanding: number; friend: { name: string } };
  onClose: () => void;
  onUpdated: () => void;
};

export function RelationshipLimitsModal({ relationshipId, current, onClose, onUpdated }: Props) {
  const [monthlyLimit, setMonthlyLimit] = useState(String(current.monthlyLimit || ""));
  const [maxTransaction, setMaxTransaction] = useState(String(current.maxTransaction || ""));
  const [maxOutstanding, setMaxOutstanding] = useState(String(current.maxOutstanding || ""));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      await api.updateRelationshipLimits(relationshipId, {
        monthlyLimit: monthlyLimit ? parseFloat(monthlyLimit) : 0,
        maxTransaction: maxTransaction ? parseFloat(maxTransaction) : 0,
        maxOutstanding: maxOutstanding ? parseFloat(maxOutstanding) : 0,
      });
      setSuccess("Limits updated.");
      setTimeout(onUpdated, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update limits");
    } finally { setLoading(false); }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="eyebrow">RELATIONSHIP LIMITS</div>
            <h3>Limits with {current.friend.name}</h3>
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
              Monthly limit (₹)
              <input type="number" step="1" min="0" placeholder="0 = no limit" value={monthlyLimit} onChange={(e) => setMonthlyLimit(e.target.value)} />
            </label>
            <label>
              Max single transaction (₹)
              <input type="number" step="1" min="0" placeholder="0 = no limit" value={maxTransaction} onChange={(e) => setMaxTransaction(e.target.value)} />
            </label>
            <label>
              Max outstanding balance (₹)
              <input type="number" step="1" min="0" placeholder="0 = no limit" value={maxOutstanding} onChange={(e) => setMaxOutstanding(e.target.value)} />
            </label>
            {error && <div className="error">{error}</div>}
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className="primary" disabled={loading}>{loading ? "Saving..." : "Save limits"}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
