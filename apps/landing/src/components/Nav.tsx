import { useEffect, useState } from "react";
import { ArrowUpRight, Menu, X } from "lucide-react";
import Brand from "./Brand";
import { LINKS } from "../content";

const navigation = [
  { href: "#experience", text: "Experience" },
  { href: "#features", text: "Features" },
  { href: "#pricing", text: "Pricing" },
  { href: "#faq", text: "FAQ" },
];

export default function Nav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 18);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <header className={"site-header " + (scrolled ? "site-header-scrolled" : "")}>
      <div className="container header-inner">
        <Brand />
        <nav className="desktop-nav" aria-label="Main navigation">
          {navigation.map((link) => <a href={link.href} key={link.href}>{link.text}</a>)}
        </nav>
        <div className="header-actions">
          <a className="header-download" href={LINKS.releases} target="_blank" rel="noopener noreferrer">
            Get LAAP <ArrowUpRight size={16} aria-hidden="true" />
          </a>
          <button className="mobile-menu-button" type="button" onClick={() => setOpen(!open)}
            aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls="mobile-nav">
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>
      <nav id="mobile-nav" className={"mobile-nav " + (open ? "mobile-nav-open" : "")}
        aria-label="Mobile navigation" aria-hidden={!open}>
        {navigation.map((link) => <a href={link.href} key={link.href} tabIndex={open ? 0 : -1}
          onClick={() => setOpen(false)}>{link.text}</a>)}
        <a href={LINKS.releases} target="_blank" rel="noopener noreferrer" tabIndex={open ? 0 : -1}
          onClick={() => setOpen(false)}>View releases <ArrowUpRight size={16} aria-hidden="true" /></a>
      </nav>
    </header>
  );
}
