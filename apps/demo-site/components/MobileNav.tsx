"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import type { Cta } from "../content/types";
import { NavLinks } from "./NavLinks";

type Props = Readonly<{ links: readonly Cta[]; cta: Cta }>;

// Mobiele navigatie (GE-03): zelfde kernroutes, primaire CTA zichtbaar, sluit na navigatie,
// met Escape of de knop. Geen scroll-lock of overlay die de browserbediening blokkeert.
export function MobileNav({ links, cta }: Props) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div className="mobile-nav">
      <button
        ref={toggleRef}
        type="button"
        className="mobile-nav__toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="mobile-nav__icon" aria-hidden="true" data-open={open} />
        {open ? "Sluit menu" : "Menu"}
      </button>
      <div id={panelId} className="mobile-nav__panel" hidden={!open}>
        <nav aria-label="Hoofdmenu (mobiel)">
          <NavLinks links={links} className="mobile-nav__links" onNavigate={close} />
        </nav>
        <Link href={cta.href} className="cta cta--primary mobile-nav__cta" onClick={close}>
          {cta.label}
        </Link>
      </div>
    </div>
  );
}
