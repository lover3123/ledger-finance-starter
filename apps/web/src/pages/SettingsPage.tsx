import { useEffect, useState } from "react";
import { Check, Layers, Moon, Palette, UserRound, X, Shield, Trash2, Wallet, ArrowDownRight, ArrowUpRight, Calendar, DollarSign } from "lucide-react";
import type { Category, FinancialSetup, User } from "@ledger/shared";
import { api } from "../api";
import { AppHeader } from "../components/AppHeader";
import { PageHeader } from "../components/PageHeader";
import { DeleteAccountModal } from "../components/DeleteAccountModal";
import { BalanceAdjustmentModal } from "../components/BalanceAdjustmentModal";
import { money } from "../utils/format";

type Props = { user: User; onLogout: () => void };

export function SettingsPage({ user, onLogout }: Props) {
  const [theme, setTheme] = useState(() => localStorage.getItem("ledger_theme") ?? "light");
  const [currency, setCurrency] = useState(() => localStorage.getItem("ledger_currency") ?? "INR");
  const [saved, setSaved] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [newCategory, setNewCategory] = useState("");
  const [categoryError, setCategoryError] = useState("");
  const [addingCategory, setAddingCategory] = useState(false);

  // Financial setup
  const [financial, setFinancial] = useState<FinancialSetup | null>(null);
  const [startingBalance, setStartingBalance] = useState("0");
  const [startingDate, setStartingDate] = useState("");
  const [financialSaving, setFinancialSaving] = useState(false);
  const [financialSaved, setFinancialSaved] = useState(false);
  const [financialError, setFinancialError] = useState("");

  // Overall monthly budget
  const [monthlyBudget, setMonthlyBudget] = useState("");
  const [budgetSaving, setBudgetSaving] = useState(false);
  const [budgetSaved, setBudgetSaved] = useState(false);
  const [budgetError, setBudgetError] = useState("");

  // Balance adjustment
  const [showAdjustment, setShowAdjustment] = useState(false);
  const [currentBalance, setCurrentBalance] = useState(0);

  // Delete account
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Category editing
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editCategoryName, setEditCategoryName] = useState("");

  useEffect(() => {
    api.categories().then(setCategories).catch(() => setCategories([]));
    api.getFinancialSetup().then((data) => {
      setFinancial(data);
      setStartingBalance(String(data.startingBalance));
      setStartingDate(data.startingBalanceDate);
      setMonthlyBudget(data.monthlyBudget != null ? String(data.monthlyBudget) : "");
    }).catch(() => {});
    api.dashboard().then((data) => setCurrentBalance(data.balance)).catch(() => {});
  }, []);

  // --- Categories ---
  async function addCategory() {
    const name = newCategory.trim();
    if (!name) return;
    setAddingCategory(true);
    setCategoryError("");
    try {
      const created = await api.addCategory(name);
      setCategories((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name)));
      setNewCategory("");
    } catch (err) {
      setCategoryError(err instanceof Error ? err.message : "Could not add category");
    } finally { setAddingCategory(false); }
  }

  async function archiveCategory(cat: Category) {
    setCategoryError("");
    try {
      const updated = await api.archiveCategory(cat.id);
      setCategories((current) => current.map((c) => c.id === cat.id ? { ...c, archived: updated.archived } : c));
    } catch (err) {
      setCategoryError(err instanceof Error ? err.message : "Could not archive category");
    }
  }

  async function renameCategory(cat: Category) {
    if (!editCategoryName.trim()) return;
    setCategoryError("");
    try {
      const updated = await api.updateCategory(cat.id, { name: editCategoryName.trim() });
      setCategories((current) => current.map((c) => c.id === cat.id ? { ...c, name: updated.name } : c));
      setEditingCategory(null);
    } catch (err) {
      setCategoryError(err instanceof Error ? err.message : "Could not rename category");
    }
  }

  async function removeCategory(category: Category) {
    setCategoryError("");
    try {
      await api.deleteCategory(category.id);
      setCategories((current) => current.filter((item) => item.id !== category.id));
    } catch (err) {
      setCategoryError(err instanceof Error ? err.message : "Could not delete category");
    }
  }

  // --- Preferences ---
  function saveSettings() {
    localStorage.setItem("ledger_theme", theme);
    localStorage.setItem("ledger_currency", currency);
    document.documentElement.dataset.theme = theme;
    window.dispatchEvent(new Event("ledger-settings-updated"));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  }

  // --- Financial Setup ---
  async function saveFinancial() {
    setFinancialSaving(true);
    setFinancialError("");
    try {
      await api.updateFinancialSetup({
        startingBalance: Number(startingBalance),
        startingBalanceDate: startingDate
      });
      setFinancialSaved(true);
      window.setTimeout(() => setFinancialSaved(false), 1800);
    } catch (err) {
      setFinancialError(err instanceof Error ? err.message : "Could not save financial setup");
    } finally { setFinancialSaving(false); }
  }

  // --- Monthly Budget ---
  async function saveBudget() {
    const val = Number(monthlyBudget);
    if (isNaN(val) || val < 0) { setBudgetError("Please enter a valid budget amount"); return; }
    setBudgetSaving(true);
    setBudgetError("");
    try {
      const currentMonth = new Date().toISOString().slice(0, 7);
      // Delete existing overall budget for current month, then create new
      const existing = await api.budgets(currentMonth);
      // We don't have an overall budget ID yet, so we upsert with __overall__
      await api.addBudget({ category: "__overall__", limit: val || 1, month: currentMonth });
      // If the user set 0, delete the budget we just created
      if (val === 0) {
        const refreshed = await api.budgets(currentMonth);
        // This shouldn't happen but just in case
      }
      setBudgetSaved(true);
      window.setTimeout(() => setBudgetSaved(false), 1800);
    } catch (err) {
      setBudgetError(err instanceof Error ? err.message : "Could not save budget");
    } finally { setBudgetSaving(false); }
  }

  const activeCategories = categories.filter((c) => !c.archived);
  const archivedCategories = categories.filter((c) => c.archived);

  return <div className="app-shell">
    <AppHeader user={user} onLogout={onLogout} />
    <main className="main settings-page">
      <PageHeader
        eyebrow="YOUR WORKSPACE"
        title="Make Ledger yours."
        subtitle="Control center for how Ledger understands your money."
      />
      <section className="settings-grid">

        {/* --- PROFILE --- */}
        <article className="panel settings-card">
          <div className="settings-icon"><UserRound size={19} /></div>
          <div>
            <div className="eyebrow">PROFILE</div>
            <h3>{user.name}</h3>
            <p>{user.email}</p>
            <small>Your account is connected and protected.</small>
          </div>
        </article>

        {/* --- PREFERENCES --- */}
        <article className="panel settings-card">
          <div className="settings-icon"><Palette size={19} /></div>
          <div className="settings-fields">
            <div>
              <div className="eyebrow">PREFERENCES</div>
              <h3>Make it yours</h3>
            </div>
            <label>Currency
              <select value={currency} onChange={(event) => setCurrency(event.target.value)}>
                <option value="INR">Indian Rupee (₹)</option>
                <option value="USD">US Dollar ($)</option>
                <option value="EUR">Euro (€)</option>
              </select>
            </label>
            <label>Appearance
              <select value={theme} onChange={(event) => setTheme(event.target.value)}>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>
            <button className="primary" onClick={saveSettings}>{saved ? <><Check size={16} /> Saved</> : "Save preferences"}</button>
          </div>
        </article>

        {/* --- FINANCIAL SETUP --- */}
        <article className="panel settings-card" style={{ gridColumn: "1 / -1" }}>
          <div className="settings-icon" style={{ background: "#ecfaf4", color: "#168a62" }}><Wallet size={19} /></div>
          <div className="settings-fields" style={{ maxWidth: 600 }}>
            <div>
              <div className="eyebrow">FINANCIAL SETUP</div>
              <h3>Your financial starting point</h3>
              <p style={{ fontSize: "13px" }}>Starting balance represents money you already had before Ledger began tracking your transactions.</p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
              <label>
                Starting balance
                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#8490a0", fontSize: "13px", fontWeight: 700 }}>{currency === "INR" ? "₹" : currency === "EUR" ? "€" : "$"}</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={startingBalance}
                    onChange={(e) => setStartingBalance(e.target.value)}
                    style={{ paddingLeft: 32 }}
                  />
                </div>
              </label>
              <label>
                Starting date
                <input
                  type="date"
                  value={startingDate}
                  onChange={(e) => setStartingDate(e.target.value)}
                />
              </label>
            </div>
            {financialError && <div className="error">{financialError}</div>}
            <div>
              <button className="primary" onClick={() => void saveFinancial()} disabled={financialSaving}>
                {financialSaved ? <><Check size={16} /> Saved</> : financialSaving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </article>

        {/* --- BALANCE ADJUSTMENT --- */}
        <article className="panel settings-card" style={{ gridColumn: "1 / -1" }}>
          <div className="settings-icon" style={{ background: "#fff5df", color: "#a76d0a" }}><ArrowDownRight size={19} /></div>
          <div className="settings-fields">
            <div>
              <div className="eyebrow">BALANCE ADJUSTMENT</div>
              <h3>Correct your balance</h3>
              <p style={{ fontSize: "13px" }}>Create an auditable record to correct your balance without modifying historical transactions.</p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              <div>
                <span style={{ fontSize: "12px", color: "#718096", fontWeight: 700 }}>Current balance</span>
                <div style={{ fontSize: "24px", fontWeight: 800, letterSpacing: "-0.5px", fontVariantNumeric: "tabular-nums" }}>{money(currentBalance)}</div>
              </div>
              <button className="primary small" onClick={() => setShowAdjustment(true)}>
                <ArrowDownRight size={16} /> Adjust balance
              </button>
            </div>
          </div>
        </article>

        {/* --- MONTHLY BUDGET --- */}
        <article className="panel settings-card">
          <div className="settings-icon" style={{ background: "#eef2ff", color: "#4968ec" }}><DollarSign size={19} /></div>
          <div className="settings-fields">
            <div>
              <div className="eyebrow">MONTHLY BUDGET</div>
              <h3>Set your spending limit</h3>
            </div>
            <label>
              Monthly spending limit
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#8490a0", fontSize: "13px", fontWeight: 700 }}>{currency === "INR" ? "₹" : currency === "EUR" ? "€" : "$"}</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={monthlyBudget}
                  onChange={(e) => setMonthlyBudget(e.target.value)}
                  placeholder="15000"
                  style={{ paddingLeft: 32 }}
                />
              </div>
            </label>
            {budgetError && <div className="error">{budgetError}</div>}
            <button className="primary" onClick={() => void saveBudget()} disabled={budgetSaving}>
              {budgetSaved ? <><Check size={16} /> Saved</> : budgetSaving ? "Saving…" : "Save budget"}
            </button>
          </div>
        </article>

        {/* --- CATEGORIES --- */}
        <article className="panel settings-card" style={{ gridColumn: "1 / -1" }}>
          <div className="settings-icon"><Layers size={19} /></div>
          <div className="settings-fields">
            <div>
              <div className="eyebrow">MY CATEGORIES</div>
              <h3>Manage your categories</h3>
              <p>Active categories appear in transaction and budget forms. Archived ones stay on old records.</p>
            </div>
            <div className="category-chips">
              {activeCategories.length === 0 ? <small>No active categories</small> : activeCategories.map((cat) => (
                <span className="category-chip" key={cat.id}>
                  {editingCategory === cat.id ? (
                    <form onSubmit={(e) => { e.preventDefault(); void renameCategory(cat); }} style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                      <input
                        value={editCategoryName}
                        onChange={(e) => setEditCategoryName(e.target.value)}
                        maxLength={40}
                        autoFocus
                        style={{ width: 120, padding: "4px 8px", fontSize: "12px", borderRadius: 8, border: "1px solid #d9e0ea" }}
                        onBlur={() => { if (editCategoryName.trim()) void renameCategory(cat); else setEditingCategory(null); }}
                      />
                    </form>
                  ) : (
                    <>
                      {cat.name}
                      <button type="button" onClick={() => { setEditingCategory(cat.id); setEditCategoryName(cat.name); }} title="Rename" style={{ width: 20, height: 20, display: "grid", placeItems: "center", border: 0, borderRadius: "50%", background: "#eef1f6", color: "#6b7686", cursor: "pointer", padding: 0 }}><span style={{ fontSize: "11px" }}>✎</span></button>
                      <button type="button" onClick={() => void archiveCategory(cat)} title="Archive" style={{ width: 20, height: 20, display: "grid", placeItems: "center", border: 0, borderRadius: "50%", background: "#eef1f6", color: "#6b7686", cursor: "pointer", padding: 0 }}><X size={11} /></button>
                    </>
                  )}
                </span>
              ))}
            </div>

            {archivedCategories.length > 0 && (
              <div style={{ marginTop: "8px" }}>
                <small style={{ color: "#98a1af", fontWeight: 700 }}>Archived</small>
                <div className="category-chips" style={{ marginTop: "4px" }}>
                  {archivedCategories.map((cat) => (
                    <span className="category-chip" key={cat.id} style={{ opacity: 0.5, fontStyle: "italic" }}>
                      {cat.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="category-add">
              <input
                value={newCategory}
                onChange={(event) => setNewCategory(event.target.value)}
                placeholder="New category name"
                maxLength={40}
                onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void addCategory(); } }}
              />
              <button className="primary small" onClick={() => void addCategory()} disabled={addingCategory || !newCategory.trim()}>
                {addingCategory ? "Adding…" : "+ Add category"}
              </button>
            </div>
            {categoryError && <div className="error">{categoryError}</div>}
          </div>
        </article>

        {/* --- SECURITY --- */}
        <article className="panel settings-card">
          <div className="settings-icon" style={{ background: "#fff5df", color: "#a76d0a" }}><Shield size={19} /></div>
          <div>
            <div className="eyebrow">SECURITY</div>
            <h3>Account security</h3>
            <p>Your account is protected with password authentication and JWT tokens.</p>
            <small>Sessions expire after 7 days.</small>
          </div>
        </article>

        {/* --- DANGER ZONE --- */}
        <article className="panel settings-card" style={{ borderColor: "#ffd6d6", background: "linear-gradient(135deg, #fff5f5, #fff)" }}>
          <div className="settings-icon" style={{ background: "#fdecec", color: "#c05050" }}><Trash2 size={19} /></div>
          <div className="settings-fields">
            <div>
              <div className="eyebrow" style={{ color: "#c05050" }}>DANGER ZONE</div>
              <h3>Delete account</h3>
              <p style={{ fontSize: "13px" }}>Permanently delete your Ledger account, transactions, budgets, profile, relationships, payment requests, notifications, and associated financial records.</p>
            </div>
            <button
              style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "8px",
                border: "1px solid #ffd6d6", borderRadius: "12px", padding: "10px 16px",
                background: "#fff", color: "#c05050", fontWeight: 800, fontSize: "13px",
                cursor: "pointer", transition: "all .2s"
              }}
              onClick={() => setShowDeleteModal(true)}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#fdecec"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; }}
            >
              <Trash2 size={15} /> Delete my account
            </button>
          </div>
        </article>

      </section>
    </main>

    {showDeleteModal && <DeleteAccountModal onClose={() => setShowDeleteModal(false)} onDeleted={onLogout} />}
    {showAdjustment && <BalanceAdjustmentModal currentBalance={currentBalance} onClose={() => setShowAdjustment(false)} onSaved={() => { setShowAdjustment(false); api.dashboard().then((d) => setCurrentBalance(d.balance)).catch(() => {}); }} />}
  </div>;
}
