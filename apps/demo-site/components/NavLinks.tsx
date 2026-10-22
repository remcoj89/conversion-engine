"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Cta } from "../content/types";

type Props = Readonly<{ links: readonly Cta[]; className: string; onNavigate?: () => void }>;

// Gedeelde kernroutes voor desktop en mobiel (GE-02, GE-03), met de actieve pagina gemarkeerd.
export function NavLinks({ links, className, onNavigate }: Props) {
  const pathname = usePathname();
  return (
    <ul className={className}>
      {links.map((link) => {
        const active = link.href === "/" ? pathname === "/" : pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <li key={link.href}>
            <Link href={link.href} aria-current={active ? "page" : undefined} onClick={onNavigate}>
              {link.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
