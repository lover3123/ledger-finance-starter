import type { Transaction } from "@ledger/shared";
import { Pencil, Trash2 } from "lucide-react";
import { categoryTone, dayLabel, money } from "../utils/format";

type Props = {
  transaction: Transaction;
  showActions?: boolean;
  deleting?: boolean;
  onEdit?: (transaction: Transaction) => void;
  onDelete?: (transaction: Transaction) => void;
  onOpen?: (transaction: Transaction) => void;
};

export function TransactionRow({ transaction, showActions, deleting, onEdit, onDelete, onOpen }: Props) {
  const interactive = Boolean(onOpen);
  return <div
    className={`tx-row transaction-row${interactive ? " clickable" : ""}`}
    onClick={onOpen ? () => onOpen(transaction) : undefined}
    role={interactive ? "button" : undefined}
    tabIndex={interactive ? 0 : undefined}
    onKeyDown={interactive ? (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen?.(transaction); } } : undefined}
  >
    <div className={`tx-icon ${transaction.type} tone-${categoryTone(transaction.category)}`}>
      <span>{transaction.type === "income" ? "+" : "−"}</span>
    </div>
    <div className="tx-main">
      <strong>{transaction.description || transaction.category}</strong>
      <span>{transaction.category} · {dayLabel(transaction.occurredAt)}</span>
    </div>
    <strong className={transaction.type === "income" ? "positive" : "negative"}>
      {transaction.type === "income" ? "+" : "−"}{money(transaction.amount)}
    </strong>
    {showActions && <div className="row-actions">
      <button className="icon-btn" onClick={(event) => { event.stopPropagation(); onEdit?.(transaction); }} title="Edit transaction" aria-label={`Edit ${transaction.description || transaction.category}`}><Pencil size={16} /></button>
      <button className="icon-btn danger" onClick={(event) => { event.stopPropagation(); onDelete?.(transaction); }} disabled={deleting} title="Delete transaction" aria-label={`Delete ${transaction.description || transaction.category}`}><Trash2 size={16} /></button>
    </div>}
  </div>;
}
