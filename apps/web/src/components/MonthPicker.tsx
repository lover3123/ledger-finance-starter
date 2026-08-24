import { monthLabel, recentMonths } from "../utils/format";

type Props = { value: string; onChange: (value: string) => void; allowAll?: boolean };

export function MonthPicker({ value, onChange, allowAll }: Props) {
  return <label className="month-picker">Viewing month
    <input type="month" value={value} onChange={(event) => onChange(event.target.value)} />
    <span>{monthLabel(value)}</span>
  </label>;
}

export function MonthSelect({ value, onChange, allowAll }: Props) {
  const months = recentMonths();
  return <label className="toolbar-field">Month
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      {allowAll && <option value="">All months</option>}
      {months.map((m: { value: string; label: string }) => <option key={m.value} value={m.value}>{m.label}</option>)}
    </select>
  </label>;
}
