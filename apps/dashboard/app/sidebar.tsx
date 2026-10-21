"use client";

import Link from "next/link";
import { useState } from "react";

const navItems = [
  { label: "Vandaag", glyph: "▦", href: "/" },
  { label: "Leads & contacten", glyph: "☷" },
  { label: "Pipeline", glyph: "▥" },
  { label: "Taken & afspraken", glyph: "✓" },
  { label: "Resultaten", glyph: "▤" },
  { label: "Websiteprestaties", glyph: "◫" },
  { label: "Instellingen", glyph: "⚙" },
  { label: "Support aanvragen", glyph: "?" },
];

export default function Sidebar() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <Link href="/" className="brand">
          <span className="brand-symbol" aria-hidden="true">
            CE
          </span>
          Conversion Engine
        </Link>
        <button
          type="button"
          className="menu-toggle"
          aria-expanded={menuOpen}
          aria-controls="main-nav"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? "Sluit menu" : "Menu"}
        </button>
      </div>

      <nav
        id="main-nav"
        aria-label="Hoofdnavigatie"
        className={menuOpen ? "nav nav-open" : "nav"}
      >
        <ul>
          {navItems.map((item) => (
            <li key={item.label}>
              {item.href ? (
                <Link
                  href={item.href}
                  className="nav-item"
                  aria-current="page"
                >
                  <span className="nav-glyph" aria-hidden="true">
                    {item.glyph}
                  </span>
                  {item.label}
                </Link>
              ) : (
                <span className="nav-item" aria-disabled="true">
                  <span className="nav-glyph" aria-hidden="true">
                    {item.glyph}
                  </span>
                  {item.label}
                  <span className="visually-hidden"> (nog niet beschikbaar)</span>
                </span>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
