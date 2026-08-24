import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HandCoins, ArrowRight } from "lucide-react";
import type { User, PayTransactionDTO, SettlementDTO } from "@ledger/shared";
import { api } from "../api";
import { AppHeader } from "../components/AppHeader";
import { PageHeader } from "../components/PageHeader";
import { money } from "../utils/format";

type Props = { user: User; onLogout: () => void };

export function LendingPage({ user, onLogout }: Props) {
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState<PayTransactionDTO[]>([]);
  const [settlements, setSettlements] = useState<SettlementDTO[]>([]);
  const [tab, setTab] = useState<"you_owe" | "owed_to_you" | "outstanding" | "settlements">("outstanding");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      const [txns, settles] = await Promise.all([
        api.getPayTransactions(),
        api.getSettlements()
      ]);
      setTransactions(txns);
      setSettlements(settles);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load lending data");
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  const myId = user.id;

  const completed = transactions.filter((t) => t.status === "COMPLETED");

  const youOwe = completed.filter((t) =>
    t.debt && t.debt.kind === "CREATE" && t.debt.debtorId === myId && t.debt.status !== "SETTLED"
  );

  const owedToYou = completed.filter((t) =>
    t.debt && t.debt.kind === "CREATE" && t.debt.creditorId === myId && t.debt.status !== "SETTLED"
  );

  const outstanding = [...youOwe, ...owedToYou];

  const totalYouOwe = youOwe.reduce((sum, t) => sum + t.amount, 0);
  const totalOwedToYou = owedToYou.reduce((sum, t) => sum + t.amount, 0);

  const items = tab === "you_owe" ? youOwe : tab === "owed_to_you" ? owedToYou : tab === "settlements" ? [] : outstanding;

  return <div className="app-shell">
    <AppHeader user={user} onLogout={onLogout} />
    <main className="main">
      <PageHeader
        eyebrow="LENDING"
        title="Personal lending"
        subtitle="Track who owes whom and manage settlements."
      />

      {error && <div className="error banner">{error}</div>}

      {/* Summary cards */}
      <div className="lending-summary">
        <div className="lending-card you-owe">
          <span className="eyebrow">YOU OWE</span>
          <strong>{money(totalYouOwe)}</strong>
          <span>{youOwe.length} transaction{youOwe.length !== 1 ? "s" : ""}</span>
        </div>
        <div className="lending-card owed-to-you">
          <span className="eyebrow">OWED TO YOU</span>
          <strong>{money(totalOwedToYou)}</strong>
          <span>{owedToYou.length} transaction{owedToYou.length !== 1 ? "s" : ""}</span>
        </div>
        <div className={`lending-card net ${(totalOwedToYou - totalYouOwe) >= 0 ? "positive" : "negative"}`}>
          <span className="eyebrow">NET</span>
          <strong>{(totalOwedToYou - totalYouOwe) >= 0 ? "+" : ""}{money(totalOwedToYou - totalYouOwe)}</strong>
          <span>{(totalOwedToYou - totalYouOwe) >= 0 ? "In your favor" : "Outstanding"}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="tab-bar">
        <button className={`tab${tab === "outstanding" ? " active" : ""}`} onClick={() => setTab("outstanding")}>Outstanding</button>
        <button className={`tab${tab === "you_owe" ? " active" : ""}`} onClick={() => setTab("you_owe")}>You owe</button>
        <button className={`tab${tab === "owed_to_you" ? " active" : ""}`} onClick={() => setTab("owed_to_you")}>Owed to you</button>
        <button className={`tab${tab === "settlements" ? " active" : ""}`} onClick={() => setTab("settlements")}>Settlements</button>
      </div>

      {loading ? <div className="loading-card">Loading...</div> : tab === "settlements" ? (
        settlements.length === 0 ? (
          <div className="empty-state">
            <HandCoins size={40} style={{ opacity: 0.2, marginBottom: 12 }} />
            <h3>No settlements yet</h3>
            <p>Settlements appear after you settle a balance.</p>
          </div>
        ) : (
          <div className="settlement-list">
            {settlements.map((s) => (
              <div key={s.id} className="settlement-row">
                <div>
                  <strong>{s.payer.name} → {s.receiver.name}</strong>
                  <span className="muted">{new Date(s.createdAt).toLocaleDateString("en-IN")}</span>
                </div>
                <strong>{money(s.amount)}</strong>
              </div>
            ))}
          </div>
        )
      ) : items.length === 0 ? (
        <div className="empty-state">
          <HandCoins size={40} style={{ opacity: 0.2, marginBottom: 12 }} />
          <h3>No {tab.replace("_", " ")} transactions</h3>
          <p>{tab === "outstanding" ? "All balances are settled." : "No transactions in this category."}</p>
        </div>
      ) : (
        <div className="lending-list">
          {items.map((t) => (
            <div key={t.id} className="lending-row clickable" onClick={() => navigate(`/pay/${t.transactionId}`)}>
              <div className="lending-row-info">
                <strong>{t.merchantName}</strong>
                <span className="muted">
                  {t.debt?.debtorId === myId
                    ? `You owe ${t.counterparty.name}`
                    : `${t.counterparty.name} owes you`}
                </span>
              </div>
              <div className="lending-row-meta">
                <strong>{money(t.amount)}</strong>
                <ArrowRight size={14} className="chevron" />
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  </div>;
}
