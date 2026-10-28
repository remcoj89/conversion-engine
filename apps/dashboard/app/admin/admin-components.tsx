import Link from "next/link";
import type { ReactNode } from "react";
import type { AdminTone } from "./admin-data";

const toneLabels: Record<AdminTone, string> = {
  success: "success",
  warning: "warning",
  danger: "danger",
  info: "info",
  neutral: "neutral",
};

export function AdminBadge({ children, tone = "neutral" }: { children: ReactNode; tone?: AdminTone }) {
  return <span className={`badge admin-badge admin-badge-${toneLabels[tone]}`}>{children}</span>;
}

export function AdminPageHeader({
  eyebrow = "Westend beheeromgeving",
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="admin-page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="intro">{description}</p>
      </div>
      {actions ? <div className="admin-page-actions">{actions}</div> : null}
    </header>
  );
}

export function AdminSection({
  id,
  title,
  description,
  children,
}: {
  id?: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="admin-section" aria-labelledby={id ? `${id}-title` : undefined}>
      <div className="admin-section-heading">
        <div>
          <h2 id={id ? `${id}-title` : undefined}>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

export function AdminStat({ label, value, detail, tone = "neutral" }: { label: string; value: string; detail: string; tone?: AdminTone }) {
  return (
    <div className="card admin-stat-card">
      <span className="admin-stat-label">{label}</span>
      <strong className="admin-stat-value">{value}</strong>
      <span className={`admin-stat-detail admin-stat-detail-${toneLabels[tone]}`}>{detail}</span>
    </div>
  );
}

export function AdminNotice({ children, tone = "info" }: { children: ReactNode; tone?: AdminTone }) {
  return <div className={`notice admin-notice admin-notice-${toneLabels[tone]}`}>{children}</div>;
}

export function AdminTabs({ items }: { items: Array<{ href: string; label: string }> }) {
  return (
    <nav className="admin-tabs" aria-label="Reviewsecties">
      {items.map((item, index) => (
        <Link key={item.href} href={item.href} className="admin-tab" aria-current={index === 0 ? "location" : undefined}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function AdminLinkCard({ href, title, description, label = "Open onderdeel" }: { href: string; title: string; description: string; label?: string }) {
  return (
    <Link href={href} className="card admin-link-card">
      <span className="admin-link-card-label">{label}</span>
      <strong>{title}</strong>
      <span>{description}</span>
    </Link>
  );
}

export function AdminDemoFooter() {
  return (
    <p className="admin-demo-footer">
      UX-prototype met fictieve gegevens. Deze slice leest nog geen live tenantdata en voert geen review-, audit-, support- of deploymentactie uit.
    </p>
  );
}
