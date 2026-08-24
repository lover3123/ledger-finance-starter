import { CircleDollarSign, Target, TrendingUp } from "lucide-react";
import type { Budget, Dashboard } from "@ledger/shared";
import { money } from "../utils/format";
import { InsightCard } from "./InsightCard";

type Props = { data: Dashboard; budgets: Budget[] };

export function MoneyPulse({ data, budgets }: Props) {
  const savingsRate = data.income > 0 ? Math.round(((data.income - data.expenses) / data.income) * 100) : 0;
  const topCategory = data.spendingByCategory[0];
  const categoryShare = topCategory && data.expenses > 0 ? Math.round((topCategory.amount / data.expenses) * 100) : 0;

  const savingsBody = data.income > 0
    ? `You kept ${money(Math.max(data.balance, 0))} of ${money(data.income)} earned this month.`
    : "Record income this month to see your savings rate.";

  const largestTitle = topCategory ? `${topCategory.category} · ${money(topCategory.amount)}` : "No expense data";
  const largestBody = topCategory
    ? `${topCategory.category} accounts for ${categoryShare}% of your spending this month.`
    : "Add an expense to see your spending pattern.";

  // Find the most over-budget or most-pressured category budget
  const categoryBudgets = budgets.filter((b) => b.category !== "__overall__");
  let mostPressured: { budget: Budget; spent: number; ratio: number; status: "over" | "attention" | "healthy" } | null = null;

  for (const budget of categoryBudgets) {
    const spent = data.spendingByCategory.find((s) => s.category === budget.category)?.amount ?? 0;
    const ratio = budget.limit ? spent / budget.limit : 0;
    const status = ratio > 1 ? "over" : ratio >= 0.8 ? "attention" : "healthy";
    if (!mostPressured || (status === "over" && mostPressured.status !== "over") || (status === "attention" && mostPressured.status === "healthy")) {
      mostPressured = { budget, spent, ratio, status };
    }
  }

  let nextAction: { tone: "blue" | "green" | "red" | "amber"; title: string; body: string; label: string };
  if (!mostPressured) {
    nextAction = { tone: "blue", title: "Create your first budget", body: "A budget turns your largest expense into a plan.", label: "Set a budget" };
  } else if (mostPressured.status === "over") {
    nextAction = {
      tone: "red",
      title: `${mostPressured.budget.category} over budget`,
      body: `${money(mostPressured.spent - mostPressured.budget.limit)} over your planned limit of ${money(mostPressured.budget.limit)}.`,
      label: "Review budget"
    };
  } else if (mostPressured.status === "attention") {
    nextAction = {
      tone: "amber",
      title: `${mostPressured.budget.category} approaching limit`,
      body: `You've used ${Math.round(mostPressured.ratio * 100)}% of your ${money(mostPressured.budget.limit)} budget. ${money(mostPressured.budget.limit - mostPressured.spent)} remaining.`,
      label: "Review budget"
    };
  } else {
    nextAction = {
      tone: "green",
      title: "You have room in your budget",
      body: `${money(mostPressured.budget.limit - mostPressured.spent)} remains in your ${mostPressured.budget.category} budget.`,
      label: "Review budget"
    };
  }

  return <section className="pulse-section">
    <div className="section-heading">
      <div>
        <div className="eyebrow">YOUR MONEY PULSE</div>
        <h3>Small signals, useful decisions.</h3>
      </div>
      <span className="section-caption">This month</span>
    </div>
    <div className="pulse-grid">
      <InsightCard tone="blue" icon={<CircleDollarSign size={19} />} label="Savings" title={`${savingsRate}% saved`} body={savingsBody} linkTo="/transactions" linkLabel="View activity" />
      <InsightCard tone="amber" icon={<Target size={19} />} label="Largest expense" title={largestTitle} body={largestBody} linkTo="/transactions" linkLabel="View transactions" />
      <InsightCard tone={nextAction.tone} icon={<TrendingUp size={19} />} label="Next action" title={nextAction.title} body={nextAction.body} linkTo="/budgets" linkLabel={nextAction.label} />
    </div>
  </section>;
}
