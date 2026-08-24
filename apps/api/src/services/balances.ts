import { PayTransaction } from "../models/index.js";
import type { DebtKind } from "@ledger/shared";

export type PairBalance = { owedToMe: number; iOwe: number; net: number };

/**
 * Balances are always computed from confirmed relationship transactions —
 * never stored as the sole source of truth.
 */
export async function computePairBalance(relationshipId: string, userId: string): Promise<PairBalance> {
  const transactions = await PayTransaction.find({
    relationshipId,
    status: "COMPLETED",
    "debt.kind": { $in: ["CREATE", "SETTLE"] }
  }).lean();

  let owedToMe = 0;
  let iOwe = 0;
  for (const txn of transactions) {
    const debt = txn.debt;
    if (!debt) continue;
    const outstanding = debt.kind === "CREATE"
      ? txn.amount - (debt.settledAmount ?? 0)
      : txn.amount;
    if (outstanding <= 0) continue;
    if (debt.kind === "CREATE") {
      if (String(debt.creditorId) === userId) owedToMe += outstanding;
      if (String(debt.debtorId) === userId) iOwe += outstanding;
    } else {
      if (String(debt.debtorId) === userId) iOwe -= outstanding;
      if (String(debt.creditorId) === userId) owedToMe -= outstanding;
    }
  }

  owedToMe = Math.max(0, Math.round(owedToMe * 100) / 100);
  iOwe = Math.max(0, Math.round(iOwe * 100) / 100);
  return { owedToMe, iOwe, net: Math.round((owedToMe - iOwe) * 100) / 100 };
}

/** Who owes whom across the pair, expressed as a sentence direction. */
export function netDirection(balance: PairBalance, myName: string, theirName: string) {
  if (balance.net > 0) return `${theirName} owes ${myName} ${balance.net}`;
  if (balance.net < 0) return `${myName} owes ${theirName} ${Math.abs(balance.net)}`;
  return "Settled up";
}

/**
 * Split debts are created the moment a split request is accepted (a standalone
 * CREATE ledger entry); the reimbursement payment therefore SETTLES.
 */
export function debtEffectFor(type: string, payerId: string, beneficiaryId: string): { debtorId: string; creditorId: string; kind: DebtKind } | null {
  if (type === "gift") return null;
  if (type === "split_expense") return { debtorId: payerId, creditorId: beneficiaryId, kind: "SETTLE" };
  // borrow & pay_on_behalf: the person who receives money/benefit owes the payer.
  return { debtorId: beneficiaryId, creditorId: payerId, kind: "CREATE" };
}
