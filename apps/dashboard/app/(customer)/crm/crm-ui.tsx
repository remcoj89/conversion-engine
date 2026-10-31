"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import styles from "../customer.module.css";

const crmLinks = [
  { label: "CRM-overzicht", href: "/crm" },
  { label: "Organisaties", href: "/organizations" },
  { label: "Contactpersonen", href: "/contacts" },
  { label: "Leads", href: "/leads" },
] as const;

export function CrmNavigation() {
  const pathname = usePathname();

  return (
    <nav className={styles.crmNavigation} aria-label="CRM-navigatie">
      <ul className={styles.crmNavigationList}>
        {crmLinks.map((link) => {
          const active = pathname === link.href || (link.href !== "/crm" && pathname.startsWith(`${link.href}/`));

          return (
            <li key={link.href}>
              <Link className={active ? styles.crmNavigationLinkActive : styles.crmNavigationLink} href={link.href} aria-current={active ? "page" : undefined}>
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function CrmHeader({ title, intro, children }: { title: string; intro: string; children?: ReactNode }) {
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">Klantomgeving · CRM</p>
        <h1>{title}</h1>
        <p className="intro">{intro}</p>
      </div>
      <CrmNavigation />
      {children}
    </>
  );
}

export function CrmToolbar({ children }: { children: ReactNode }) {
  return <div className={styles.crmToolbar}>{children}</div>;
}
