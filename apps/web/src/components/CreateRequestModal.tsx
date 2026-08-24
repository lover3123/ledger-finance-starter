import { useState } from "react";
import { X } from "lucide-react";
import { api } from "../api";

type Props = {
  counterpartyId: string;
  counterpartyName: string;
  onClose: () => void;
  onCreated: () => void;
};

const PAYMENT_TYPES = [
  { value: "borrow", label: "Borrow", desc: "Ask someone to lend you money" },
  { value: "pay_on_behalf", label: "Pay on behalf", desc: "Ask someone to pay for you" },
  { value: "split_expense", label: "Split expense", desc: "Share an expense" },
  { value: "gift", label: "Gift", desc: "Send a gift" },
  { value: "other", label: "Other", desc: "Custom reason" },
] as const;

export function CreateRequestModal({ counterpartyId, counterpartyName, onClose, onCreated }: Props) {
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<string>("borrow");
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [merchantName, setMerchantName] = useState("");
  const [merchantUpiId, setMerchantUpiId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) { setError("Enter a valid amount."); return; }
    if (!reason.trim()) { setError("Enter a reason."); return; }
    setLoading(true); setError("");
    try {
      const body: Parameters<typeof api.createPaymentRequest>[0] = {
        counterpartyId,
        amount: parsedAmount,
        type,
        reason: reason.trim(),
        description: description.trim(),
      };
      if (dueDate) body.dueDate = new Date(dueDate).toISOString();
      if (merchantName.trim() && merchantUpiId.trim()) {
        body.upiIntent = { merchantName: merchantName.trim(), merchantUpiId: merchantUpiId.trim() };
      }
      const result = await api.createPaymentRequest(body);
      setSuccess(result.message || "Request created successfully.");
      setTimeout(onCreated, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create request");
    } finally { setLoading(false); }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="eyebrow">CREATE REQUEST</div>
            <h3>Request from {counterpartyName}</h3>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        {success ? (
          <div className="success-message">
            <div className="success-icon">✓</div>
            <p>{success}</p>
            <p className="muted">Waiting for {counterpartyName.split(" ")[0]} to respond.</p>
          </div>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)}>
            <label>
              Amount (₹)
              <input type="number" step="0.01" min="1" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </label>

            <label>
              Payment type
              <div className="type-selector">
                {PAYMENT_TYPES.map((pt) => (
                  <button
                    key={pt.value}
                    type="button"
                    className={`type-chip${type === pt.value ? " active" : ""}`}
                    onClick={() => setType(pt.value)}
                  >
                    {pt.label}
                  </button>
                ))}
              </div>
            </label>

            <label>
              Reason
              <input type="text" placeholder="e.g., Restaurant payment" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={80} required />
            </label>

            <label>
              Description (optional)
              <textarea placeholder="Additional details..." value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} rows={2} />
            </label>

            <label>
              Due date (optional)
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </label>

            {(type === "pay_on_behalf" || type === "split_expense") && (
              <div className="merchant-fields">
                <div className="eyebrow" style={{ marginBottom: 8 }}>MERCHANT DETAILS (OPTIONAL)</div>
                <label>
                  Merchant name
                  <input type="text" placeholder="e.g., ABC Restaurant" value={merchantName} onChange={(e) => setMerchantName(e.target.value)} />
                </label>
                <label>
                  Merchant UPI ID
                  <input type="text" placeholder="e.g., abc@upi" value={merchantUpiId} onChange={(e) => setMerchantUpiId(e.target.value)} />
                </label>
              </div>
            )}

            {error && <div className="error">{error}</div>}

            <div className="modal-actions">
              <button type="button" className="secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className="primary" disabled={loading}>
                {loading ? "Creating..." : "Create request"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
