import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, ShieldCheck, TriangleAlert, Settings } from "lucide-react";
import type { Budget, Transaction, User } from "@ledger/shared";
import { api } from "../api";
import "./budgets.css";
import { AppHeader } from "../components/AppHeader";
import { CategoryField } from "../components/CategoryField";
import { MonthPicker } from "../components/MonthPicker";
import { PageHeader } from "../components/PageHeader";
import { currentMonth, money, monthLabel } from "../utils/format";

type Props = { user: User; onLogout: () => void };
type BudgetForm = { category: string; limit: string; month: string };
type BudgetStatus = "healthy" | "attention" | "over";

function statusOf(ratio: number): BudgetStatus {
  if (ratio > 1) return "over";
  if (ratio >= 0.8) return "attention";
  return "healthy";
}

function BudgetForm({ initial, saving, error, onCancel, onSubmit }: { initial: BudgetForm; saving: boolean; error: string; onCancel: () => void; onSubmit: (form: BudgetForm) => Promise<void> }) {
  const [form, setForm] = useState(initial);
  const update = (key: keyof BudgetForm, value: string) => setForm((current) => ({ ...current, [key]: value }));
  return <form className="transaction-form" onSubmit={(event) => { event.preventDefault(); void onSubmit(form); }}>
    <CategoryField value={form.category} onChange={(value) => update("category", value)} />
    <label>Monthly limit<input type="number" min="1" step="0.01" value={form.limit} onChange={(event) => update("limit", event.target.value)} placeholder="8000" required /></label>
    <label>Month<input type="month" value={form.month} onChange={(event) => update("month", event.target.value)} required /></label>
    {error && <div className="error">{error}</div>}
    <div className="modal-actions"><button type="button" className="secondary" onClick={onCancel}>Cancel</button><button className="primary" disabled={saving}>{saving ? "Saving…" : "Save budget"}</button></div>
  </form>;
}

export function BudgetsPage({ user, onLogout }: Props) {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Budget | null>(null);
  const [saving, setSaving] = useState(false);

  // Overall budget
  const [overallBudget, setOverallBudget] = useState<number | null>(null);
  const [showCustomize, setShowCustomize] = useState(false);
  const [overallInput, setOverallInput] = useState("");
  const [customizeSaving, setCustomizeSaving] = useState(false);
  const [customizeError, setCustomizeError] = useState("");
  const [customizeSaved, setCustomizeSaved] = useState(false);

  // Category budgets in customize mode
  const [catBudgetInputs, setCatBudgetInputs] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true); setError("");
    try {
      const [budgetData, transactionData] = await Promise.all([api.budgets(selectedMonth), api.transactions()]);
      setBudgets(budgetData); setTransactions(transactionData);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to load budgets"); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [selectedMonth]);

  // Load overall budget for current month
  useEffect(() => {
    api.getFinancialSetup(selectedMonth).then((data) => {
      setOverallBudget(data.monthlyBudget);
      setOverallInput(data.monthlyBudget != null ? String(data.monthlyBudget) : "");
    }).catch(() => {});
  }, [selectedMonth]);

  // Sync category budget inputs when budgets load
  useEffect(() => {
    const inputs: Record<string, string> = {};
    for (const b of budgets) {
      inputs[b.category] = String(b.limit);
    }
    setCatBudgetInputs(inputs);
  }, [budgets]);

  const spending = useMemo(() => {
    const totals = new Map<string, number>();
    for (const transaction of transactions) {
      if (transaction.type !== "expense" || !transaction.occurredAt.startsWith(selectedMonth)) continue;
      totals.set(transaction.category, (totals.get(transaction.category) ?? 0) + transaction.amount);
    }
    return totals;
  }, [transactions, selectedMonth]);

  const totalLimit = budgets.reduce((sum, budget) => sum + budget.limit, 0);
  const totalSpent = budgets.reduce((sum, budget) => sum + (spending.get(budget.category) ?? 0), 0);
  const remaining = totalLimit - totalSpent;
  const usedPercent = totalLimit ? Math.round((totalSpent / totalLimit) * 100) : 0;
  const overBudget = remaining < 0;

  const openCreate = () => { setEditing(null); setFormError(""); setShowForm(true); };
  const openEdit = (budget: Budget) => { setEditing(budget); setFormError(""); setShowForm(true); };
  const save = async (form: BudgetForm) => {
    setSaving(true); setFormError("");
    try {
      const body = { category: form.category, limit: Number(form.limit), month: form.month };
      if (editing) await api.updateBudget(editing.id, body); else await api.addBudget(body);
      setShowForm(false); await load();
    } catch (err) { setFormError(err instanceof Error ? err.message : "Could not save budget"); }
    finally { setSaving(false); }
  };
  const formInitial = editing ? { category: editing.category, limit: String(editing.limit), month: editing.month } : { category: "Food", limit: "", month: selectedMonth };

  async function saveCustomize() {
    setCustomizeSaving(true);
    setCustomizeError("");
    try {
      const overallVal = Number(overallInput);
      if (!isNaN(overallVal) && overallVal > 0) {
        await api.addBudget({ category: "__overall__", limit: overallVal, month: selectedMonth });
      }

      // Save category budgets
      for (const [category, limitStr] of Object.entries(catBudgetInputs)) {
        if (!category || !limitStr) continue;
        const limit = Number(limitStr);
        if (isNaN(limit) || limit <= 0) continue;
        await api.addBudget({ category, limit, month: selectedMonth });
      }

      setCustomizeSaved(true);
      window.setTimeout(() => setCustomizeSaved(false), 1800);
      await load();
    } catch (err) {
      setCustomizeError(err instanceof Error ? err.message : "Could not save budget");
    } finally { setCustomizeSaving(false); }
  }

  async function deleteBudgetCategory(budget: Budget) {
    try {
      await api.deleteBudget(budget.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete budget");
    }
  }

  return <div className="app-shell">
    <AppHeader user={user} onLogout={onLogout} />
    <main className="main budgets-page">
      <PageHeader
        eyebrow="BUDGETS"
        title="Give your spending a direction."
        subtitle={`Set limits for ${monthLabel(selectedMonth)} and see where your money is going.`}
        aside={<div style={{display:'flex',alignItems:'center',gap:12}}><MonthPicker value={selectedMonth} onChange={setSelectedMonth} /><button className="primary small" onClick={openCreate}><Plus size={17} /> Set a budget</button><button className="secondary small" onClick={() => setShowCustomize(true)}><Settings size={15} /> Customize budget</button></div>}
      />

      <section className={`overall-budget ${overBudget ? "is-over" : ""}`}>
        <div>
          <div className="eyebrow">{monthLabel(selectedMonth).toUpperCase()}</div>
          <strong>{money(totalSpent)} <span>of {overallBudget ? money(overallBudget) : money(totalLimit)} spent</span></strong>
          <p className={overBudget ? "negative" : "positive"}>
            {overallBudget
              ? overBudget
                ? `${money(Math.abs(overallBudget - totalSpent))} over budget`
                : `${money(overallBudget - totalSpent)} remaining`
              : totalLimit === 0
                ? "No budgets set for this month yet"
                : overBudget
                  ? `${money(Math.abs(remaining))} over budget`
                  : `${money(remaining)} remaining`
            }
          </p>
        </div>
        <div className="overall-progress">
          <div className="budget-track">
            <div className="budget-fill" style={{ width: `${Math.min(100, Math.max(3, (totalSpent / Math.max(overallBudget ?? totalLimit, 1)) * 100))}%` }} />
          </div>
          <span>{overallBudget ? Math.round((totalSpent / overallBudget) * 100) : usedPercent}% used across {budgets.length} categor{budgets.length === 1 ? "y" : "ies"}</span>
        </div>
      </section>

      {overallBudget == null && (
        <div style={{ marginBottom: "16px", padding: "14px 18px", borderRadius: "14px", background: "rgba(255,255,255,.78)", border: "1px solid var(--line, #e7ebf2)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <span style={{ fontSize: "12px", color: "#718092", fontWeight: 700 }}>No monthly budget set for {monthLabel(selectedMonth)}</span>
            <p style={{ margin: "2px 0 0", fontSize: "13px", color: "#4a5872", fontWeight: 700 }}>Set an overall monthly budget to track your spending.</p>
          </div>
          <button className="primary small" onClick={() => setShowCustomize(true)}><Settings size={15} /> Set a budget</button>
        </div>
      )}

      {error && <div className="error banner">{error}<button onClick={() => void load()}>Retry</button></div>}
      {loading
        ? <div className="loading-card">Reading your spending intentions...</div>
        : budgets.length === 0
          ? <div className="panel empty-state">
            <ShieldCheck size={30} />
            <h3>No budgets for this month</h3>
            <p>Choose one category where you want your money to support you.</p>
            <button className="primary" onClick={openCreate}><Plus size={17} /> Create your first budget</button>
          </div>
          : <>
            <div className="section-heading">
              <div>
                <div className="eyebrow">CATEGORY BUDGETS</div>
                <h3>Every limit, clearly tracked.</h3>
              </div>
            </div>
            <section className="budget-grid">
              {budgets.map((budget) => {
                const spent = spending.get(budget.category) ?? 0;
                const ratio = budget.limit ? spent / budget.limit : 0;
                const status = statusOf(ratio);
                const used = Math.round(ratio * 100);
                const delta = budget.limit - spent;
                return <article className={`budget-card ${status}`} key={budget.id}>
                  <div className="budget-card-head">
                    <div>
                      <div className="eyebrow">{budget.category}</div>
                      <h3>{status === "over" ? <><TriangleAlert size={15} /> Over budget</> : status === "attention" ? "Close to the limit" : "On track"}</h3>
                    </div>
                    <div style={{ display: "flex", gap: "4px" }}>
                      <button className="icon-btn" onClick={() => openEdit(budget)} title="Edit budget" aria-label={`Edit ${budget.category} budget`}><Pencil size={16} /></button>
                    </div>
                  </div>
                  <div className="budget-numbers">
                    <strong>{money(spent)}</strong>
                    <span>of {money(budget.limit)}</span>
                  </div>
                  <div className="budget-track"><div className="budget-fill" style={{ width: `${Math.min(100, Math.max(3, ratio * 100))}%` }} /></div>
                  <div className="budget-footer">
                    <span className={status === "over" ? "negative" : ""}>
                      {status === "over" ? `${money(Math.abs(delta))} over budget` : `${money(delta)} remaining`}
                    </span>
                    <span>{used}% used</span>
                  </div>
                </article>;
              })}
            </section>
          </>}
    </main>

    {showForm && <div className="modal-backdrop"><div className="modal"><div className="modal-head"><div><div className="eyebrow">MONEY INTENTION</div><h3>{editing ? "Adjust budget" : "Set a budget"}</h3></div><button className="icon-btn" onClick={() => setShowForm(false)} aria-label="Close budget form">×</button></div><BudgetForm initial={formInitial} saving={saving} error={formError} onCancel={() => setShowForm(false)} onSubmit={save} /></div></div>}

    {showCustomize && <div className="modal-backdrop" onClick={() => setShowCustomize(false)}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="eyebrow">CUSTOMIZE BUDGET</div>
            <h3>{monthLabel(selectedMonth)}</h3>
          </div>
          <button className="icon-btn" onClick={() => setShowCustomize(false)} aria-label="Close">×</button>
        </div>

        <div style={{ display: "grid", gap: "16px" }}>
          <label>
            Overall monthly budget
            <input
              type="number"
              min="0"
              step="0.01"
              value={overallInput}
              onChange={(e) => setOverallInput(e.target.value)}
              placeholder="15000"
            />
          </label>

          {budgets.length > 0 && (
            <div>
              <div className="eyebrow" style={{ marginBottom: "8px" }}>CATEGORY BUDGETS</div>
              <div style={{ display: "grid", gap: "10px" }}>
                {budgets.map((b) => (
                  <div key={b.id} style={{ display: "grid", gridTemplateColumns: "1fr 120px 60px", gap: "8px", alignItems: "center" }}>
                    <span style={{ fontSize: "13px", fontWeight: 700, color: "#253242" }}>{b.category}</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={catBudgetInputs[b.category] ?? ""}
                      onChange={(e) => setCatBudgetInputs((prev) => ({ ...prev, [b.category]: e.target.value }))}
                      placeholder={String(b.limit)}
                      style={{ fontSize: "13px" }}
                    />
                    <span style={{ fontSize: "11px", color: "#718092" }}>{spending.get(b.category) != null ? money(spending.get(b.category)!) : "—"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {customizeError && <div className="error">{customizeError}</div>}

          <div className="modal-actions">
            <button className="secondary" onClick={() => setShowCustomize(false)}>Cancel</button>
            <button className="primary" onClick={() => void saveCustomize()} disabled={customizeSaving}>
              {customizeSaved ? "Saved ✓" : customizeSaving ? "Saving…" : "Save budget"}
            </button>
          </div>
        </div>
      </div>
    </div>}
  </div>;
}
