import Link from "next/link";
import { site } from "../content/demo";
import { CtaButton } from "./CtaButton";

// Functionele footer (GE-07, GE-08): positionering, primaire contactroute, juridische links.
// Bewust geen tweede volledige navigatie.
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container site-footer__grid">
        <div>
          <p className="site-footer__brand">{site.name}</p>
          <p>{site.footer.positioning}</p>
        </div>
        <div className="site-footer__cta">
          <p>{site.footer.contactLabel}</p>
          <CtaButton cta={site.primaryCta} size="small" />
        </div>
      </div>
      <div className="container site-footer__legal">
        <p>
          © {new Date().getFullYear()} {site.footer.copyright}
        </p>
        <ul>
          {site.footer.legal.map((link) => (
            <li key={link.href}>
              <Link href={link.href}>{link.label}</Link>
            </li>
          ))}
        </ul>
      </div>
    </footer>
  );
}
