type Props = { label: string; value: string; hint?: string; tone?: "positive" | "negative" };

export function StatCard({ label, value, hint, tone }: Props) {
  return <article className="stat-card">
    <span>{label}</span>
    <strong className={tone}>{value}</strong>
    {hint && <small>{hint}</small>}
  </article>;
}
