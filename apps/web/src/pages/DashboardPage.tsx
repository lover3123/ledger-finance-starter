import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Users, ArrowRight } from "lucide-react";
import type { Budget, Dashboard, Transaction, TransactionInput, User, PaySummaryDTO } from "@ledger/shared";
import { api } from "../api";
import { AddTransactionModal } from "../components/AddTransactionModal";
import { AppHeader } from "../components/AppHeader";
import { FinancialHero } from "../components/FinancialHero";
import { MoneyFlowChart } from "../components/MoneyFlowChart";
import { MoneyPulse } from "../components/MoneyPulse";
import { MonthPicker } from "../components/MonthPicker";
import { PageHeader } from "../components/PageHeader";
import { SpendingBreakdown } from "../components/SpendingBreakdown";
import { StatCard } from "../components/StatCard";
import { TransactionRow } from "../components/TransactionRow";
import { currentMonth, money, monthLabel } from "../utils/format";

type Props = { user: User; onLogout: () => void };

export function DashboardPage({ user, onLogout }: Props) {
  const [data, setData] = useState<Dashboard | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [paySummary, setPaySummary] = useState<PaySummaryDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth());

  async function loadDashboard() {
    setLoading(true); setError("");
    try {
      const [dashboard, recent, budgetData, summary] = await Promise.all([
        api.dashboard(selectedMonth),
        api.transactions({ month: selectedMonth }),
        api.budgets(selectedMonth),
        api.getPaySummary().catch(() => null)
      ]);
      setData(dashboard); setTransactions(recent); setBudgets(budgetData); setPaySummary(summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally { setLoading(false); }
  }

  useEffect(() => { void loadDashboard(); }, [selectedMonth]);

  async function addTransaction(body: TransactionInput) {
    await api.addTransaction(body);
    setShowAdd(false);
    await loadDashboard();
  }

  return <div className="app-shell">
    <AppHeader user={user} onLogout={onLogout} />
    <main className="main">
      <PageHeader
        eyebrow="YOUR MONEY"
        title="Your money, at a glance."
        subtitle={`Here is where your money stands in ${monthLabel(selectedMonth)}, ${user.name.split(" ")[0]}.`}
        aside={<div style={{display:'flex',alignItems:'center',gap:12}}><MonthPicker value={selectedMonth} onChange={setSelectedMonth} /><button className="primary small" onClick={() => setShowAdd(true)}><Plus size={17} /> Add transaction</button></div>}
      />
      {error && <div className="error banner">{error}<button onClick={() => void loadDashboard()}>Retry</button></div>}
      {loading ? <div className="loading-card">Loading your financial snapshot...</div> : data && <>
        <section className="summary-grid">
          <FinancialHero balance={data.balance} income={data.income} expenses={data.expenses} startingBalance={data.startingBalance} adjustments={data.adjustments} month={selectedMonth} />
          <StatCard label="Income" value={`+${money(data.income)}`} hint="Recorded this month" tone="positive" />
          <StatCard label="Expenses" value={`−${money(data.expenses)}`} hint="Recorded this month" />
        </section>
        <section className="content-grid">
          <article className="panel">
            <div className="panel-head">
              <div><div className="eyebrow">ACTIVITY</div><h3>Recent transactions</h3></div>
              <Link className="panel-link" to="/transactions">View all &rarr;</Link>
            </div>
            {transactions.length === 0
              ? <div className="empty">No transactions yet. Add your first one.</div>
              : <div className="tx-list">{transactions.slice(0, 6).map((item) => <TransactionRow key={item.id} transaction={item} />)}</div>}
          </article>
          <article className="panel">
            <div className="panel-head">
              <div><div className="eyebrow">SPENDING</div><h3>By category</h3></div>
            </div>
            {data.spendingByCategory.length === 0
              ? <div className="empty">No expense data yet.</div>
              : <SpendingBreakdown spending={data.spendingByCategory} total={data.expenses} />}
          </article>
        </section>
        <section className="dashboard-analytics">
          <MoneyFlowChart transactions={transactions} month={selectedMonth} />
          <MoneyPulse data={data} budgets={budgets} />
        </section>

        {/* Money Between People */}
        {paySummary && (paySummary.owedToMe > 0 || paySummary.iOwe > 0 || paySummary.pendingRequests > 0 || paySummary.pendingConfirmations > 0) && (
          <section className="panel" style={{ marginTop: 20 }}>
            <div className="panel-head">
              <div><div className="eyebrow">LEDGER PAY</div><h3>Money between people</h3></div>
              <Link className="panel-link" to="/people">View all &rarr;</Link>
            </div>

            <div className="pay-summary-grid">
              <div className="pay-stat-card">
                <span className="eyebrow">NET OUTSTANDING</span>
                <strong className={paySummary.net >= 0 ? "positive" : "negative"}>
                  {paySummary.net >= 0 ? "+" : "−"}{money(Math.abs(paySummary.net))}
                </strong>
              </div>
              <div className="pay-stat-card">
                <span className="eyebrow">YOU OWE</span>
                <strong className="negative">{money(paySummary.iOwe)}</strong>
              </div>
              <div className="pay-stat-card">
                <span className="eyebrow">OWED TO YOU</span>
                <strong className="positive">{money(paySummary.owedToMe)}</strong>
              </div>
              <div className="pay-stat-card">
                <span className="eyebrow">PENDING</span>
                <strong>{paySummary.pendingRequests + paySummary.pendingConfirmations}</strong>
              </div>
            </div>

            {paySummary.recentActivity.length > 0 && (
              <div className="pay-activity" style={{ marginTop: 16 }}>
                <div className="eyebrow" style={{ marginBottom: 8 }}>RECENT ACTIVITY</div>
                {paySummary.recentActivity.map((item) => (
                  <Link key={item.transactionId} to={`/pay/${item.transactionId}`} className="pay-activity-row">
                    <div className="pay-activity-info">
                      <strong>{item.title}</strong>
                      <span className="muted">{item.direction === "owes_you" ? `${item.counterparty} owes you` : `You owe ${item.counterparty}`}</span>
                    </div>
                    <div className="pay-activity-meta">
                      <span className={`badge badge-${item.direction === "owes_you" ? "green" : "amber"}`}>
                        {money(item.amount)}
                      </span>
                      <ArrowRight size={14} className="chevron" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        )}
      </>}
      {showAdd && <AddTransactionModal onClose={() => setShowAdd(false)} onAdd={addTransaction} />}
    </main>
  </div>;
}
