import type { ReactNode } from "react";

type Props = { eyebrow: string; title: string; subtitle?: string; aside?: ReactNode };

export function PageHeader({ eyebrow, title, subtitle, aside }: Props) {
  return <div className="page-heading">
    <div>
      <div className="eyebrow">{eyebrow}</div>
      <h2>{title}</h2>
      {subtitle && <p className="muted">{subtitle}</p>}
    </div>
    {aside}
  </div>;
}
