import { ArrowUpRight, CircleDollarSign, Target, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import type { Budget, Dashboard } from "@ledger/shared";
import { money } from "../utils/format";

type Props = { data: Dashboard; budgets: Budget[] };

export function FinancialPulse({ data, budgets }: Props) {
  const savings = data.income > 0 ? Math.round(((data.income - data.expenses) / data.income) * 100) : 0;
  const topCategory = data.spendingByCategory[0];
  const categoryShare = topCategory && data.expenses > 0 ? Math.round((topCategory.amount / data.expenses) * 100) : 0;
  const topBudget = budgets.find((budget) => budget.category === topCategory?.category);
  const budgetUsed = topBudget && topCategory ? Math.round((topCategory.amount / topBudget.limit) * 100) : 0;

  return <section className="pulse-section">
    <div className="section-heading"><div><div className="eyebrow">YOUR MONEY PULSE</div><h3>Small signals, useful decisions.</h3></div><span className="section-caption">This month</span></div>
    <div className="pulse-grid">
      <article className="pulse-card"><div className="pulse-icon blue"><CircleDollarSign size={19} /></div><div><span>Savings</span><strong>{savings}% saved</strong><p>You kept {money(Math.max(data.balance, 0))} of {money(data.income)} earned this month.</p><Link to="/transactions">View activity</Link></div></article>
      <article className="pulse-card"><div className="pulse-icon amber"><Target size={19} /></div><div><span>Largest expense</span><strong>{topCategory ? `${topCategory.category} · ${money(topCategory.amount)}` : "No expense data"}</strong><p>{topCategory ? `${categoryShare}% of your spending is going toward ${topCategory.category}.` : "Add an expense to see your spending pattern."}</p><Link to="/transactions">View transactions</Link></div></article>
      <article className="pulse-card"><div className="pulse-icon green"><TrendingUp size={19} /></div><div><span>Next action</span><strong>{topBudget ? `${budgetUsed}% of ${topBudget.category} budget used` : "Create your first budget"}</strong><p>{topBudget ? `${money(Math.max(topBudget.limit - (topCategory?.amount ?? 0), 0))} remains in this category.` : "A budget gives your spending a clear limit to work with."}</p><Link to="/budgets">Review budget</Link></div><ArrowUpRight className="pulse-arrow" size={18} /></article>
    </div>
  </section>;
}
