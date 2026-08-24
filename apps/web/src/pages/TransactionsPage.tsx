import { useEffect, useMemo, useState } from "react";
import { Plus, Search, SlidersHorizontal, X, ArrowUpDown } from "lucide-react";
import type { Transaction, User } from "@ledger/shared";
import { api } from "../api";
import { AppHeader } from "../components/AppHeader";
import { CategoryField } from "../components/CategoryField";
import { PageHeader } from "../components/PageHeader";
import { TransactionRow } from "../components/TransactionRow";
import { currentMonth, fullDateLabel, money, monthLabel, recentMonths } from "../utils/format";

type FormState = { type: "income" | "expense"; amount: string; category: string; description: string; occurredAt: string };
type SortKey = "newest" | "oldest" | "amount-desc" | "amount-asc";
type Props = { user: User; onLogout: () => void };

const emptyForm: FormState = { type: "expense", amount: "", category: "Food", description: "", occurredAt: new Date().toISOString().slice(0, 16) };

const SORTERS: Record<SortKey, (a: Transaction, b: Transaction) => number> = {
  newest: (a, b) => b.occurredAt.localeCompare(a.occurredAt),
  oldest: (a, b) => a.occurredAt.localeCompare(b.occurredAt),
  "amount-desc": (a, b) => b.amount - a.amount,
  "amount-asc": (a, b) => a.amount - b.amount
};

const SORT_LABELS: Record<SortKey, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  "amount-desc": "Highest amount",
  "amount-asc": "Lowest amount"
};

function TransactionForm({ initial, saving, error, onCancel, onSubmit }: { initial: FormState; saving: boolean; error: string; onCancel: () => void; onSubmit: (form: FormState) => Promise<void> }) {
  const [form, setForm] = useState(initial);
  const update = (field: keyof FormState, value: string) => setForm((current) => ({ ...current, [field]: value }));
  return <form className="transaction-form" onSubmit={(event) => { event.preventDefault(); void onSubmit(form); }}>
    <div className="segmented"><button type="button" className={form.type === "expense" ? "active" : ""} onClick={() => update("type", "expense")}>Expense</button><button type="button" className={form.type === "income" ? "active" : ""} onClick={() => update("type", "income")}>Income</button></div>
    <label>Amount<input type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => update("amount", event.target.value)} required /></label>
    <CategoryField value={form.category} onChange={(value) => update("category", value)} />
    <label>Description<input value={form.description} onChange={(event) => update("description", event.target.value)} placeholder="What was this for?" /></label>
    <label>Date<input type="datetime-local" value={form.occurredAt} onChange={(event) => update("occurredAt", event.target.value)} required /></label>
    {error && <div className="error">{error}</div>}
    <div className="modal-actions"><button type="button" className="secondary" onClick={onCancel}>Cancel</button><button className="primary" disabled={saving}>{saving ? "Saving…" : "Save transaction"}</button></div>
  </form>;
}

export function TransactionsPage({ user, onLogout }: Props) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [type, setType] = useState("");
  const [category, setCategory] = useState("");
  const [month, setMonth] = useState(currentMonth());
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [details, setDetails] = useState<Transaction | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [mobileSortOpen, setMobileSortOpen] = useState(false);

  const categories = useMemo(() => [...new Set(transactions.map((item) => item.category))].sort(), [transactions]);
  const months = recentMonths();

  const load = async () => {
    setLoading(true); setError("");
    try { setTransactions(await api.transactions({ type, category, month: month || undefined })); }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to load transactions"); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [type, category, month]);

  const openCreate = () => { setEditing(null); setFormError(""); setShowForm(true); };
  const openEdit = (item: Transaction) => { setDetails(null); setEditing(item); setFormError(""); setShowForm(true); };
  const submit = async (form: FormState) => {
    setSaving(true); setFormError("");
    try {
      const body = { type: form.type, amount: Number(form.amount), category: form.category, description: form.description, occurredAt: new Date(form.occurredAt).toISOString() };
      if (editing) await api.updateTransaction(editing.id, body); else await api.addTransaction(body);
      setShowForm(false); await load();
    } catch (err) { setFormError(err instanceof Error ? err.message : "Could not save transaction"); }
    finally { setSaving(false); }
  };
  const remove = async (item: Transaction) => {
    if (!window.confirm("Delete this transaction?")) return;
    setDeleting(item.id); setError(""); setDetails(null);
    try { await api.deleteTransaction(item.id); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not delete transaction"); }
    finally { setDeleting(null); }
  };

  const visibleTransactions = useMemo(() => {
    const q = search.toLowerCase();
    return transactions
      .filter((item) => !q || `${item.description} ${item.category} ${item.type}`.toLowerCase().includes(q))
      .sort(SORTERS[sort]);
  }, [transactions, search, sort]);

  const clearFilters = () => { setType(""); setCategory(""); setSearch(""); setMonth(currentMonth()); setSort("newest"); };
  const clearApiFilters = () => { setType(""); setCategory(""); setMonth(currentMonth()); };
  const initial = editing
    ? { type: editing.type, amount: String(editing.amount), category: editing.category, description: editing.description, occurredAt: new Date(editing.occurredAt).toISOString().slice(0, 16) }
    : emptyForm;

  const apiFiltersActive = type !== "" || category !== "" || month !== currentMonth();

  const activeChips: { key: string; label: string; onRemove: () => void }[] = [];
  if (type) activeChips.push({ key: "type", label: type === "income" ? "Income" : "Expense", onRemove: () => setType("") });
  if (category) activeChips.push({ key: "category", label: category, onRemove: () => setCategory("") });
  if (month !== currentMonth()) activeChips.push({ key: "month", label: monthLabel(month), onRemove: () => setMonth(currentMonth()) });
  if (search) activeChips.push({ key: "search", label: `"${search}"`, onRemove: () => setSearch("") });

  return <div className="app-shell">
    <AppHeader user={user} onLogout={onLogout} />
    <main className="main">
      <PageHeader
        eyebrow="TRANSACTIONS"
        title="Follow every rupee."
        subtitle={month ? `Showing transactions for ${monthLabel(month)}.` : "Showing all transactions across every month."}
        aside={<button className="primary small" onClick={openCreate}><Plus size={17} /> Add transaction</button>}
      />

      {/* ── Control bar ── */}
      <div className="filter-toolbar">
        {/* Row 1: Search + Filters + Sort */}
        <div className="toolbar-row">
          <label className="search-field">
            <Search size={16} className="search-icon" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search transactions..."
              aria-label="Search transactions"
            />
          </label>

          {/* Desktop filters */}
          <div className="toolbar-filters-desktop">
            <div className="toolbar-field-wrap">
              <span className="toolbar-field-label">Type</span>
              <select className="toolbar-select" value={type} onChange={(event) => setType(event.target.value)}>
                <option value="">All</option>
                <option value="income">Income</option>
                <option value="expense">Expense</option>
              </select>
            </div>
            <div className="toolbar-field-wrap">
              <span className="toolbar-field-label">Category</span>
              <select className="toolbar-select" value={category} onChange={(event) => setCategory(event.target.value)}>
                <option value="">All</option>
                {categories.map((item) => <option key={item}>{item}</option>)}
              </select>
            </div>
            <div className="toolbar-field-wrap">
              <span className="toolbar-field-label">Month</span>
              <select className="toolbar-select" value={month} onChange={(event) => setMonth(event.target.value)}>
                {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          </div>

          <div className="toolbar-sort-desktop">
            <span className="toolbar-field-label">Sort</span>
            <select className="toolbar-select" value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="amount-desc">Highest amount</option>
              <option value="amount-asc">Lowest amount</option>
            </select>
          </div>

          {apiFiltersActive && <button className="text-button toolbar-clear" onClick={clearApiFilters}>Clear</button>}

          {/* Mobile buttons */}
          <div className="toolbar-mobile-actions">
            <button className="toolbar-pill" onClick={() => setMobileFiltersOpen(true)}>
              <SlidersHorizontal size={15} />
              Filters{apiFiltersActive ? ` (${[type, category, month !== currentMonth() ? 1 : 0].filter(Boolean).length + (category ? 1 : 0)})` : ""}
            </button>
            <button className="toolbar-pill" onClick={() => setMobileSortOpen(true)}>
              <ArrowUpDown size={15} />
              Sort
            </button>
          </div>
        </div>

        {/* Row 2: Active filter chips */}
        {activeChips.length > 0 && <div className="toolbar-chips">
          {activeChips.map((chip) => (
            <span key={chip.key} className="filter-chip">
              {chip.label}
              <button onClick={chip.onRemove} aria-label={`Remove ${chip.label} filter`}><X size={13} /></button>
            </span>
          ))}
          <button className="text-button toolbar-clear-mobile" onClick={clearFilters}>Clear all</button>
        </div>}
      </div>

      {/* ── Result context ── */}
      {!loading && !error && <div className="result-meta">
        {apiFiltersActive
          ? <>{visibleTransactions.length} transaction{visibleTransactions.length === 1 ? "" : "s"} · {monthLabel(month)}</>
          : <>{visibleTransactions.length} transaction{visibleTransactions.length === 1 ? "" : "s"}</>}
      </div>}

      {error && <div className="error banner">{error}<button onClick={() => void load()}>Retry</button></div>}
      {loading
        ? <div className="loading-card">Loading transactions...</div>
        : visibleTransactions.length === 0
          ? <div className="panel empty-state">
              <h3>No transactions found</h3>
              <p>{search || apiFiltersActive ? "Try a different search or remove a filter." : "Add your first transaction to get started."}</p>
              {(search || apiFiltersActive) && <button className="text-button" onClick={clearFilters}>Clear filters</button>}
              {!search && !apiFiltersActive && <button className="primary" onClick={openCreate}><Plus size={17} /> Add transaction</button>}
            </div>
          : <section className="panel transaction-list">{visibleTransactions.map((item) => (
            <TransactionRow key={item.id} transaction={item} showActions deleting={deleting === item.id} onEdit={openEdit} onDelete={(target) => void remove(target)} onOpen={setDetails} />
          ))}</section>}

      {/* ── Details modal ── */}
      {details && <div className="modal-backdrop" onClick={() => setDetails(null)}>
        <div className="modal transaction-details" onClick={(event) => event.stopPropagation()}>
          <div className="modal-head"><div><div className="eyebrow">{details.type === "income" ? "MONEY IN" : "MONEY OUT"}</div><h3>{details.description || details.category}</h3></div><button className="icon-btn" onClick={() => setDetails(null)} aria-label="Close details">×</button></div>
          <div className={`details-amount ${details.type === "income" ? "positive" : "negative"}`}>{details.type === "income" ? "+" : "−"}{money(details.amount)}</div>
          <dl className="details-grid">
            <div><dt>Category</dt><dd>{details.category}</dd></div>
            <div><dt>Date</dt><dd>{fullDateLabel(details.occurredAt)}</dd></div>
            {details.description && <div><dt>Description</dt><dd>{details.description}</dd></div>}
          </dl>
          <div className="modal-actions">
            <button className="secondary" onClick={() => openEdit(details)}>Edit</button>
            <button className="primary" onClick={() => void remove(details)}>Delete</button>
          </div>
        </div>
      </div>}

      {/* ── Create / Edit form modal ── */}
      {showForm && <div className="modal-backdrop"><div className="modal"><div className="modal-head"><div><div className="eyebrow">{editing ? "EDIT RECORD" : "NEW RECORD"}</div><h3>{editing ? "Edit transaction" : "Add transaction"}</h3></div><button className="icon-btn" onClick={() => setShowForm(false)}>×</button></div><TransactionForm initial={initial} saving={saving} error={formError} onCancel={() => setShowForm(false)} onSubmit={submit} /></div></div>}

      {/* ── Mobile filter bottom sheet ── */}
      {mobileFiltersOpen && <div className="modal-backdrop" onClick={() => setMobileFiltersOpen(false)}>
        <div className="mobile-sheet" onClick={(event) => event.stopPropagation()}>
          <div className="mobile-sheet-head"><h3>Filters</h3><button className="icon-btn" onClick={() => setMobileFiltersOpen(false)} aria-label="Close filters"><X size={18} /></button></div>
          <div className="mobile-sheet-body">
            <label className="mobile-sheet-field">
              <span>Type</span>
              <select value={type} onChange={(event) => setType(event.target.value)}>
                <option value="">All types</option>
                <option value="income">Income</option>
                <option value="expense">Expense</option>
              </select>
            </label>
            <label className="mobile-sheet-field">
              <span>Category</span>
              <select value={category} onChange={(event) => setCategory(event.target.value)}>
                <option value="">All categories</option>
                {categories.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label className="mobile-sheet-field">
              <span>Month</span>
              <select value={month} onChange={(event) => setMonth(event.target.value)}>
                {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </label>
          </div>
          <div className="mobile-sheet-foot">
            {apiFiltersActive && <button className="text-button" onClick={() => { clearApiFilters(); setMobileFiltersOpen(false); }}>Reset filters</button>}
            <button className="primary" style={{ marginLeft: "auto" }} onClick={() => setMobileFiltersOpen(false)}>Show results</button>
          </div>
        </div>
      </div>}

      {/* ── Mobile sort bottom sheet ── */}
      {mobileSortOpen && <div className="modal-backdrop" onClick={() => setMobileSortOpen(false)}>
        <div className="mobile-sheet mobile-sheet--short" onClick={(event) => event.stopPropagation()}>
          <div className="mobile-sheet-head"><h3>Sort by</h3><button className="icon-btn" onClick={() => setMobileSortOpen(false)} aria-label="Close sort"><X size={18} /></button></div>
          <div className="mobile-sheet-body">
            {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
              <button
                key={key}
                className={`mobile-sheet-option${sort === key ? " active" : ""}`}
                onClick={() => { setSort(key); setMobileSortOpen(false); }}
              >
                {SORT_LABELS[key]}
              </button>
            ))}
          </div>
        </div>
      </div>}
    </main>
  </div>;
}
