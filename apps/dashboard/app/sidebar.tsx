"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const navGroups = {
  customer: {
    label: "KLANTDASHBOARD",
    items: [
      { label: "Vandaag", glyph: "▦", href: "/" },
      { label: "Onboarding", glyph: "◎", href: "/onboarding" },
      { label: "Leads & contacten", glyph: "☷", href: "/leads" },
      { label: "Pipeline", glyph: "▥", href: "/pipeline" },
      { label: "Taken & afspraken", glyph: "✓", href: "/tasks" },
      { label: "Resultaten", glyph: "▤", href: "/results" },
      { label: "Websiteprestaties", glyph: "◫", href: "/performance" },
      { label: "Instellingen", glyph: "⚙", href: "/settings" },
      { label: "Support aanvragen", glyph: "?", href: "/support" },
    ],
  },
  admin: {
    label: "WESTEND BEHEER",
    items: [
      { label: "Beheeroverzicht", glyph: "◈", href: "/admin" },
      { label: "Audit & versies", glyph: "⌁", href: "/admin/audit" },
      { label: "Klanten", glyph: "▦", href: "/admin/clients" },
      { label: "Project Brief Review", glyph: "▣", href: "/admin/review" },
      { label: "Websites", glyph: "▤", href: "/admin/websites" },
      { label: "Monitoring", glyph: "◉", href: "/admin/monitoring" },
      { label: "Intelligence", glyph: "◇", href: "/admin/intelligence" },
      { label: "Databronnen", glyph: "◎", href: "/admin/sources" },
      { label: "Templates", glyph: "▧", href: "/admin/templates" },
      { label: "Support", glyph: "✉", href: "/admin/support" },
    ],
  },
} as const;

function isAdminPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

function isActiveNavItem(pathname: string, href: string): boolean {
  if (href === "/" || href === "/admin") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function Sidebar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const isAdmin = isAdminPath(pathname);
  const contextLabel = isAdmin ? navGroups.admin.label : navGroups.customer.label;
  const activeGroup = isAdmin ? navGroups.admin : navGroups.customer;
  const brandHref = isAdmin ? "/admin" : "/";

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <Link
          href={brandHref}
          className="brand"
          aria-label={`${contextLabel}, naar ${isAdmin ? "het beheeroverzicht" : "het klantdashboard"}`}
        >
          <span className="brand-symbol" aria-hidden="true">
            CE
          </span>
          {contextLabel}
        </Link>
        <button
          type="button"
          className="menu-toggle"
          aria-label={menuOpen ? "Navigatiemenu sluiten" : "Navigatiemenu openen"}
          aria-expanded={menuOpen}
          aria-controls="main-nav"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? "Sluit menu" : "Menu"}
        </button>
      </div>

      <nav
        id="main-nav"
        aria-label={`${contextLabel} navigatie`}
        className={menuOpen ? "nav nav-open" : "nav"}
      >
        <ul className="nav-groups">
          <li className="nav-section">
            <p className="nav-section-label">{activeGroup.label}</p>
            <ul>
              {activeGroup.items.map((item) => {
                const isActive = isActiveNavItem(pathname, item.href);

                return (
                  <li key={item.label}>
                    <Link
                      href={item.href}
                      className="nav-item"
                      aria-current={isActive ? "page" : undefined}
                      onClick={() => setMenuOpen(false)}
                    >
                      <span className="nav-glyph" aria-hidden="true">
                        {item.glyph}
                      </span>
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </li>
        </ul>
      </nav>
    </aside>
  );
}
