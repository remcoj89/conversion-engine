import Link from "next/link";
import type { Cta } from "../content/types";

type Props = Readonly<{
  cta: Cta;
  variant?: "primary" | "secondary" | "text";
  size?: "default" | "small";
  className?: string;
}>;

// Eén vormgeving voor elke CTA (GE-04 t/m GE-06): primair, secundair of ondersteunende tekstlink.
export function CtaButton({ cta, variant = "primary", size = "default", className }: Props) {
  const classes = ["cta", `cta--${variant}`, size === "small" ? "cta--small" : "", className ?? ""].filter(Boolean).join(" ");
  return (
    <Link href={cta.href} className={classes}>
      {cta.label}
    </Link>
  );
}
