import type { ReactNode } from "react";
import { Link } from "react-router-dom";

type Tone = "blue" | "green" | "amber" | "red";
type Props = { tone: Tone; icon: ReactNode; label: string; title: string; body: string; linkTo: string; linkLabel: string };

export function InsightCard({ tone, icon, label, title, body, linkTo, linkLabel }: Props) {
  return <article className={`pulse-card tone-${tone}`}>
    <div className={`pulse-icon ${tone}`}>{icon}</div>
    <div>
      <span>{label}</span>
      <strong>{title}</strong>
      <p>{body}</p>
      <Link to={linkTo} className="insight-link">{linkLabel} &rarr;</Link>
    </div>
  </article>;
}
