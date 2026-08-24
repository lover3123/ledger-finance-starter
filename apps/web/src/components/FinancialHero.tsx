import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { money, monthLabel } from "../utils/format";

type Props = { balance: number; income: number; expenses: number; startingBalance: number; adjustments: number; month: string };

export function FinancialHero({ balance, income, expenses, startingBalance, adjustments, month }: Props) {
  const savingsRate = income > 0 ? Math.round(((income - expenses) / income) * 100) : 0;
  const [expanded, setExpanded] = useState(false);

  return <article className="hero-card">
    <div className="eyebrow">AVAILABLE BALANCE</div>
    <div className="big-number">{money(balance)}</div>
    <div className="hero-caption">{monthLabel(month)}</div>
    <div className="hero-metrics">
      <span><b>+{money(income)}</b> income</span>
      <span><b>&minus;{money(expenses)}</b> expenses</span>
    </div>
    <div className="hero-savings">
      <span>Savings rate</span>
      <strong>{savingsRate}% saved</strong>
    </div>

    {/* Balance breakdown */}
    <button
      type="button"
      onClick={() => setExpanded(!expanded)}
      style={{
        display: "flex", alignItems: "center", gap: "4px", marginTop: "12px", padding: "6px 0",
        border: "0", background: "transparent", color: "#c9d6ff", fontSize: "12px", fontWeight: 700,
        cursor: "pointer", transition: "color .2s"
      }}
    >
      View balance details <ChevronDown size={14} style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
    </button>

    {expanded && (
      <div style={{
        marginTop: "8px", padding: "12px 14px", borderRadius: "12px",
        background: "rgba(255,255,255,0.08)", backdropFilter: "blur(4px)"
      }}>
        <div style={{ fontSize: "11px", color: "#9bb0e0", marginBottom: "6px", fontWeight: 700 }}>Balance calculation</div>
        <div style={{ display: "grid", gap: "6px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#c9d6ff" }}>
            <span>Starting balance</span>
            <span style={{ fontWeight: 700, color: "#fff" }}>{money(startingBalance)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#c9d6ff" }}>
            <span>Income</span>
            <span style={{ fontWeight: 700, color: "#6ff5b8" }}>+{money(income)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#c9d6ff" }}>
            <span>Expenses</span>
            <span style={{ fontWeight: 700, color: "#ffb8b8" }}>−{money(expenses)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#c9d6ff" }}>
            <span>Adjustments</span>
            <span style={{ fontWeight: 700, color: adjustments >= 0 ? "#6ff5b8" : "#ffb8b8" }}>{adjustments >= 0 ? "+" : ""}{money(adjustments)}</span>
          </div>
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.2)", paddingTop: "6px", display: "flex", justifyContent: "space-between", fontSize: "13px", color: "#fff", fontWeight: 800 }}>
            <span>Available balance</span>
            <span>{money(balance)}</span>
          </div>
        </div>
      </div>
    )}
  </article>;
}
