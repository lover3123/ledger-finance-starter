import { useState } from "react";
import type { Transaction } from "@ledger/shared";
import { money, monthRangeLabel } from "../utils/format";

type Props = { transactions: Transaction[]; month: string };
type Pt = [number, number];

const W = 640;
const H = 260;
const PAD = { top: 18, right: 16, bottom: 36, left: 62 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

const ACCENT = "#168a62";
const EXPENSE = "#c8505e";
const NET = "#4968ec";

const compact = (value: number) => {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1e7) return `${sign}₹${Number((abs / 1e7).toPrecision(3))}Cr`;
  if (abs >= 1e5) return `${sign}₹${Number((abs / 1e5).toPrecision(3))}L`;
  if (abs >= 1e3) return `${sign}₹${Number((abs / 1e3).toPrecision(3))}k`;
  return `${sign}₹${Math.round(abs)}`;
};

const clampY = (y: number) => Math.min(PAD.top + PLOT_H, Math.max(PAD.top, y));

function niceMax(value: number) {
  if (value <= 0) return 1;
  const exp = Math.floor(Math.log10(value));
  const base = Math.pow(10, exp);
  const f = value / base;
  const step = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return step * base;
}

function smoothPath(pts: Pt[]) {
  if (pts.length < 2) return "";
  let d = `M ${pts[0][0].toFixed(2)},${pts[0][1].toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, pts.length - 1)];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = clampY(p1[1] + (p2[1] - p0[1]) / 6);
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = clampY(p2[1] - (p3[1] - p1[1]) / 6);
    d += ` C ${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
  }
  return d;
}

function areaPath(line: string, firstX: number, lastX: number, zeroY: number) {
  return line ? `${line} L ${lastX.toFixed(2)},${zeroY.toFixed(2)} L ${firstX.toFixed(2)},${zeroY.toFixed(2)} Z` : "";
}

export function MoneyFlowChart({ transactions, month }: Props) {
  const [hoverDay, setHoverDay] = useState<number | null>(null);
  const days = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const dailyIncome = Array(days).fill(0) as number[];
  const dailyExpenses = Array(days).fill(0) as number[];

  for (const transaction of transactions) {
    const day = new Date(transaction.occurredAt).getDate() - 1;
    if (day < 0 || day >= days) continue;
    if (transaction.type === "income") dailyIncome[day] += transaction.amount;
    else dailyExpenses[day] += transaction.amount;
  }

  const cumIncome = dailyIncome.map((_, i) => dailyIncome.slice(0, i + 1).reduce((sum, v) => sum + v, 0));
  const cumExpenses = dailyExpenses.map((_, i) => dailyExpenses.slice(0, i + 1).reduce((sum, v) => sum + v, 0));
  const net = cumIncome.map((value, i) => value - cumExpenses[i]);

  const hi = niceMax(Math.max(...cumIncome, ...cumExpenses, ...net, 1));
  const lo = Math.min(...net, 0) < 0 ? -niceMax(-Math.min(...net)) : 0;
  const span = hi - lo;
  const x = (day: number) => PAD.left + (day / Math.max(days - 1, 1)) * PLOT_W;
  const y = (value: number) => PAD.top + PLOT_H - ((value - lo) / span) * PLOT_H;
  const zeroY = y(0);

  const incomePts: Pt[] = cumIncome.map((v, i) => [x(i), y(v)]);
  const expensePts: Pt[] = cumExpenses.map((v, i) => [x(i), y(v)]);
  const netPts: Pt[] = net.map((v, i) => [x(i), y(v)]);
  const incomeLine = smoothPath(incomePts);
  const expenseLine = smoothPath(expensePts);
  const netLine = smoothPath(netPts);

  const ticks = [...new Set(lo < 0 ? [hi, hi / 2, 0, lo] : [hi, hi / 2, 0])];
  const xTicks = [...new Set([0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * (days - 1))))];
  const monthShort = new Date(`${month}-01T00:00:00`).toLocaleDateString("en-IN", { month: "short" });

  const marks = transactions
    .map((transaction) => {
      const day = new Date(transaction.occurredAt).getDate() - 1;
      return day >= 0 && day < days ? { transaction, day } : null;
    })
    .filter((mark): mark is { transaction: Transaction; day: number } => mark !== null);

  const totalIncome = cumIncome[days - 1] ?? 0;
  const totalExpenses = cumExpenses[days - 1] ?? 0;
  const totalNet = totalIncome - totalExpenses;

  const hover = hoverDay === null ? null : {
    date: `${monthShort} ${hoverDay + 1}`,
    income: cumIncome[hoverDay],
    expenses: cumExpenses[hoverDay],
    balance: net[hoverDay],
    left: x(hoverDay) / W
  };

  return <article className="panel money-flow">
    <div className="panel-head">
      <div>
        <div className="eyebrow">MONEY FLOW &middot; {monthRangeLabel(month)}</div>
        <h3>How your money moved</h3>
      </div>
      <div className="chart-legend">
        <span><i className="income-dot" /> Income</span>
        <span><i className="expense-dot" /> Expenses</span>
        <span><i className="net-dot" /> Net</span>
      </div>
    </div>
    <div className="flow-chart-wrap">
      <svg className="flow-chart" key={month} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Money flow for ${monthRangeLabel(month)}`}>
        <defs>
          <linearGradient id="incomeFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ACCENT} stopOpacity="0.24" />
            <stop offset="100%" stopColor={ACCENT} stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="expenseFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={EXPENSE} stopOpacity="0.2" />
            <stop offset="100%" stopColor={EXPENSE} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {ticks.map((tick) => (
          <g key={tick}>
            <line className={tick === 0 ? "chart-grid chart-baseline" : "chart-grid"} x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} />
            <text className="chart-tick" x={PAD.left - 9} y={y(tick) + 4} textAnchor="end">{compact(tick)}</text>
          </g>
        ))}
        {xTicks.map((day) => (
          <text key={day} className="chart-tick" x={x(day)} y={PAD.top + PLOT_H + 20} textAnchor="middle">{monthShort} {day + 1}</text>
        ))}

        <path className="flow-area-income" d={areaPath(incomeLine, incomePts[0]?.[0] ?? PAD.left, incomePts[incomePts.length - 1]?.[0] ?? PAD.left, zeroY)} />
        <path className="flow-area-expense" d={areaPath(expenseLine, expensePts[0]?.[0] ?? PAD.left, expensePts[expensePts.length - 1]?.[0] ?? PAD.left, zeroY)} />

        <path className="chart-line income-line" d={incomeLine} pathLength={1} />
        <path className="chart-line expense-line" d={expenseLine} pathLength={1} />
        <path className="chart-line net-line" d={netLine} pathLength={1} />

        {marks.map(({ transaction, day }) => (
          <circle
            key={transaction.id}
            className={transaction.type === "income" ? "income-dot-mark" : "expense-dot-mark"}
            cx={x(day)}
            cy={y(transaction.type === "income" ? cumIncome[day] : cumExpenses[day])}
            r={4}
          />
        ))}

        {hoverDay !== null && (
          <g className="hover-guide">
            <line x1={x(hoverDay)} x2={x(hoverDay)} y1={PAD.top} y2={PAD.top + PLOT_H} />
          </g>
        )}

        {Array.from({ length: days }, (_, day) => (
          <rect
            key={day}
            className="hover-band"
            x={PAD.left + (day / days) * PLOT_W}
            y={PAD.top}
            width={PLOT_W / days}
            height={PLOT_H}
            fill="transparent"
            onMouseEnter={() => setHoverDay(day)}
            onMouseLeave={() => setHoverDay((current) => (current === day ? null : current))}
          />
        ))}
      </svg>

      {hover && (
        <div
          className="flow-tooltip"
          style={{
            left: `${hover.left * 100}%`,
            transform: hover.left > 0.72 ? "translateX(-100%)" : hover.left < 0.2 ? "translateX(0)" : "translateX(-50%)"
          }}
        >
          <div className="flow-tooltip-date">{hover.date}</div>
          <div className="flow-tooltip-row"><i className="income-dot" /> Income<b>{money(hover.income)}</b></div>
          <div className="flow-tooltip-row"><i className="expense-dot" /> Expenses<b>{money(hover.expenses)}</b></div>
          <div className="flow-tooltip-row"><i className="net-dot" /> Balance<b>{money(hover.balance)}</b></div>
        </div>
      )}
    </div>
    <div className="chart-summary">
      <span><b>{money(totalIncome)}</b> income</span>
      <span><b>{money(totalExpenses)}</b> expenses</span>
      <span><b className={totalNet >= 0 ? "positive" : "negative"}>{totalNet >= 0 ? "+" : "−"}{money(Math.abs(totalNet))}</b> net</span>
    </div>
  </article>;
}
