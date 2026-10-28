import type { ReactNode } from "react";
import styles from "./customer.module.css";

export type CustomerRoute =
  | "leads"
  | "pipeline"
  | "tasks"
  | "results"
  | "performance"
  | "settings"
  | "support";

export function CustomerPage({
  current,
  eyebrow = "Klantomgeving",
  title,
  intro,
  actions,
  children,
}: {
  current: CustomerRoute;
  eyebrow?: string;
  title: string;
  intro: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <div className="page-heading" data-customer-route={current}>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="intro">{intro}</p>
        {actions ? <div className={styles.customerHeaderActions}>{actions}</div> : null}
      </div>
      {children}
    </>
  );
}
export function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "warning" | "success";
}) {
  const toneClass = tone === "warning" ? "badge-warning" : tone === "success" ? "badge-success" : "badge-neutral";
  return <span className={`badge ${toneClass}`}>{children}</span>;
}

export function SourceLabel({ children }: { children: ReactNode }) {
  return <span className={styles.customerSourceLabel}>{children}</span>;
}

export function DemoNotice({ children }: { children: ReactNode }) {
  return (
    <div className="notice notice-warning" role="note">
      <strong>Demogegevens</strong>
      <span>{children}</span>
    </div>
  );
}
