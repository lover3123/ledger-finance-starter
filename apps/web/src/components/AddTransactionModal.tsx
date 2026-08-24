import { useState } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { TransactionInput } from "@ledger/shared";
import { CategoryField } from "./CategoryField";

type Props = { onClose: () => void; onAdd: (body: TransactionInput) => Promise<void> };

export function AddTransactionModal({ onClose, onAdd }: Props) {
  const [type, setType] = useState<"expense" | "income">("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Food");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    try { await onAdd({ type, amount: Number(amount), category, description, occurredAt: new Date().toISOString() }); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not save"); }
    finally { setSaving(false); }
  }

  return <div className="modal-backdrop"><div className="modal">
    <div className="modal-head"><div><div className="eyebrow">NEW RECORD</div><h3>Add transaction</h3></div><button className="icon-btn" onClick={onClose}>x</button></div>
    <form className="transaction-form" onSubmit={submit}>
      <div className="segmented"><button type="button" className={type === "expense" ? "active" : ""} onClick={() => setType("expense")}><ArrowDownRight size={16} /> Expense</button><button type="button" className={type === "income" ? "active" : ""} onClick={() => setType("income")}><ArrowUpRight size={16} /> Income</button></div>
      <label>Amount<input value={amount} onChange={(event) => setAmount(event.target.value)} type="number" min="0.01" step="0.01" required /></label>
      <CategoryField value={category} onChange={setCategory} />
      <label>Description<input value={description} onChange={(event) => setDescription(event.target.value)} /></label>
      {error && <div className="error">{error}</div>}
      <div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={saving}>{saving ? "Saving..." : "Save transaction"}</button></div>
    </form>
  </div></div>;
}
