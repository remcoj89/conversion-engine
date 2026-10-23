import Link from "next/link";
import { site } from "../content/demo";
import { CtaButton } from "./CtaButton";
import { MobileNav } from "./MobileNav";
import { NavLinks } from "./NavLinks";

// Header (GE-01): merknaam, primaire navigatie, primaire CTA en mobiele toggle.
export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="container site-header__bar">
        <Link href="/" className="brand">
          <span className="brand__mark" aria-hidden="true">
            {site.mark}
          </span>
          {site.name}
        </Link>
        <nav aria-label="Hoofdmenu" className="site-nav">
          <NavLinks links={site.nav} className="site-nav__links" />
        </nav>
        <CtaButton cta={site.primaryCta} size="small" className="site-header__cta" />
        <MobileNav links={site.nav} cta={site.primaryCta} />
      </div>
    </header>
  );
}
