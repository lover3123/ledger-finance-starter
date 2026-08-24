import { useState } from "react";
import { money } from "../utils/format";

export type SpendingEntry = { category: string; amount: number };

type Props = { spending: SpendingEntry[]; total: number; collapsedCount?: number };

export function SpendingBreakdown({ spending, total, collapsedCount = 5 }: Props) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? spending : spending.slice(0, collapsedCount);

  return <div className="bars">
    {visible.map((item, index) => {
      const share = total > 0 ? Math.round((item.amount / total) * 100) : 0;
      return <div className="bar-row" key={item.category}>
        <div className="bar-label">
          <span>{item.category}</span>
          <span><b>{money(item.amount)}</b> &middot; {share}%{index === 0 ? " of spending" : ""}</span>
        </div>
        <div className="bar-track">
          <div className="bar-fill" style={{ width: `${Math.max(2, share)}%`, animationDelay: `${index * 70}ms` }} />
        </div>
      </div>;
    })}
    {spending.length > collapsedCount && <button className="text-button" onClick={() => setExpanded((current) => !current)}>
      {expanded ? "Show top categories" : "View all categories \u2192"}
    </button>}
  </div>;
}
