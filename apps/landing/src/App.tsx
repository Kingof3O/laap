import { ArrowDown, ArrowRight, ArrowUpRight, Check, Command, Fingerprint, Github, Heart, Layers3, LockKeyhole, MonitorDown, Search, ShieldCheck, SlidersHorizontal, Sparkles, Star, Zap } from "lucide-react";
import Nav from "./components/Nav";
import Brand from "./components/Brand";
import ProductWindow from "./components/ProductWindow";
import ScrollStory from "./components/ScrollStory";
import Pricing from "./components/Pricing";
import Faq from "./components/Faq";
import { LINKS } from "./content";

const features = [
  { icon: Layers3, number: "01", name: "A proper roster", description: "Organize accounts with favorites, notes, regions and flexible views. No digging through a pile of logins." },
  { icon: Zap, number: "02", name: "One-click launching", description: "Choose a saved profile and launch through the official Riot client with managed session handling." },
  { icon: Search, number: "03", name: "Find anything fast", description: "Search your collection and see competitive ranks and useful profile context in one place." },
  { icon: SlidersHorizontal, number: "04", name: "Presence controls", description: "Choose how you appear in League chat using LAAP's built-in local presence controls." },
  { icon: LockKeyhole, number: "05", name: "Local encrypted vault", description: "Sessions stay encrypted on your own device, with the key protected by the operating system." },
  { icon: ShieldCheck, number: "06", name: "Match-aware safeguards", description: "Checks for active game processes before a disruptive client switch or shutdown." },
];

export default function App() {
  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <Nav />
      <main id="main">
        <section className="hero" id="top" aria-labelledby="hero-heading">
          <div className="hero-grid" aria-hidden="true" />
          <div className="hero-glow" aria-hidden="true" />
          <div className="container hero-inner">
            <div className="hero-copy">
              <span className="hero-announcement"><span className="announcement-pulse" /> THE NEXT CHAPTER OF YOUR LEAGUE DESKTOP</span>
              <h1 id="hero-heading">Every account.<br /><span className="hero-gradient-text">One beautiful</span><br /><span className="serif-accent hero-italic">place.</span></h1>
              <p className="hero-subtitle">Meet LAAP. A considered, local-first home for your League of Legends accounts—built to make switching feel effortless.</p>
              <div className="hero-actions">
                <a className="button button-primary" href={LINKS.releases} target="_blank" rel="noopener noreferrer">
                  <MonitorDown size={19} aria-hidden="true" /> Explore downloads <ArrowUpRight size={17} aria-hidden="true" />
                </a>
                <a className="button button-ghost" href="#experience">Discover the experience <ArrowDown size={18} aria-hidden="true" /></a>
              </div>
              <div className="hero-footnote"><span className="footnote-line" /> AVAILABLE FOR WINDOWS &amp; macOS <span className="hero-footnote-dot">·</span> INDEPENDENT PROJECT</div>
            </div>
            <div className="hero-art" aria-label="Preview of the LAAP desktop interface">
              <div className="hero-art-ring hero-art-ring-one" aria-hidden="true" />
              <div className="hero-art-ring hero-art-ring-two" aria-hidden="true" />
              <div className="hero-art-aura" aria-hidden="true" />
              <div className="hero-window">
                <ProductWindow />
              </div>
              <div className="floating-label floating-label-left" aria-hidden="true">
                <span className="floating-label-icon"><Fingerprint size={20} /></span>
                <span><small>STORAGE</small><strong>Private by design</strong></span>
              </div>
              <div className="floating-label floating-label-right" aria-hidden="true">
                <span className="floating-label-icon"><Check size={19} /></span>
                <span><small>WORKFLOW</small><strong>Made to move</strong></span>
              </div>
            </div>
            <div className="hero-bottom">
              <span>SCROLL TO DISCOVER</span>
              <span className="hero-scroll-bar"><span /></span>
              <span>01 / 05</span>
            </div>
          </div>
        </section>

        <div className="trust-strip" aria-label="LAAP essentials">
          <div className="container trust-strip-inner">
            <span><ShieldCheck size={18} aria-hidden="true" /> Encrypted on your device</span>
            <i aria-hidden="true" />
            <span><Command size={18} aria-hidden="true" /> Native desktop experience</span>
            <i aria-hidden="true" />
            <span><Fingerprint size={18} aria-hidden="true" /> No Riot passwords collected</span>
            <i aria-hidden="true" />
            <span><Heart size={18} aria-hidden="true" /> Made for League players</span>
          </div>
        </div>

        <section id="features" className="features-section section-pad" aria-labelledby="features-heading">
          <div className="container">
            <div className="features-intro">
              <div className="section-heading">
                <span className="eyebrow"><span className="eyebrow-line" /> WHY LAAP</span>
                <h2 id="features-heading">Less managing.<br /><span className="serif-accent">More playing.</span></h2>
              </div>
              <p>The little details add up. LAAP brings your roster and your daily flow into one carefully designed space.</p>
            </div>
            <div className="features-grid">
              {features.map((feature) => {
                const Icon = feature.icon;
                return (
                  <article className="feature-card" key={feature.number}>
                    <div className="feature-card-header"><span className="feature-icon"><Icon size={23} strokeWidth={1.7} aria-hidden="true" /></span><span className="feature-number">{feature.number} / 06</span></div>
                    <h3>{feature.name}</h3>
                    <p>{feature.description}</p>
                    <span className="feature-corner" aria-hidden="true"><ArrowUpRight size={18} /></span>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <ScrollStory />

        <section className="principles-section section-pad" aria-labelledby="principles-heading">
          <div className="container principles-grid">
            <div className="principles-visual">
              <div className="principles-glow" aria-hidden="true" />
              <div className="security-orbit" aria-hidden="true"><span /><span /><span /></div>
              <div className="security-center"><LockKeyhole size={48} strokeWidth={1.15} aria-hidden="true" /><span>LOCAL FIRST</span></div>
              <div className="security-hint security-hint-top"><span /> ENCRYPTED SESSIONS</div>
              <div className="security-hint security-hint-bottom"><span /> OS-PROTECTED KEY</div>
            </div>
            <div className="principles-copy">
              <span className="eyebrow"><span className="eyebrow-line" /> BUILT ON PRINCIPLE</span>
              <h2 id="principles-heading">Your account.<br />Your device.<br /><span className="serif-accent">Your control.</span></h2>
              <p>Real peace of mind comes from clear boundaries. LAAP works with local sessions instead of collecting passwords, and never needs to touch the game's memory.</p>
              <div className="principle-points">
                <div><span><Check size={16} /></span><p><strong>Locally encrypted sessions</strong><br />Your vault stays on your machine.</p></div>
                <div><span><Check size={16} /></span><p><strong>Official client sign-in</strong><br />LAAP does not prompt for Riot passwords.</p></div>
                <div><span><Check size={16} /></span><p><strong>Clear operating boundaries</strong><br />No game memory injection or gameplay automation.</p></div>
              </div>
              <a className="inline-link" href={LINKS.security} target="_blank" rel="noopener noreferrer">Read the security information <ArrowUpRight size={17} aria-hidden="true" /></a>
            </div>
          </div>
        </section>

        <Pricing />
        <Faq />

        <section className="final-cta" aria-labelledby="final-heading">
          <div className="container">
            <div className="final-cta-inner">
              <span className="final-cta-orbit" aria-hidden="true" />
              <span className="eyebrow"><span className="eyebrow-line" /> YOUR NEXT SESSION STARTS HERE</span>
              <h2 id="final-heading">Bring your roster<br /><span className="serif-accent">into focus.</span></h2>
              <p>A more intentional home for the accounts you play on every day.</p>
              <a className="button button-primary" href={LINKS.releases} target="_blank" rel="noopener noreferrer"><MonitorDown size={19} aria-hidden="true" /> View available releases <ArrowUpRight size={17} aria-hidden="true" /></a>
              <div className="final-small"><Sparkles size={14} aria-hidden="true" /> Available builds are listed on GitHub</div>
            </div>
          </div>
        </section>
      </main>
      <footer className="site-footer">
        <div className="container">
          <div className="footer-upper">
            <div><Brand /><p>Your League accounts, in one considered place.</p></div>
            <div className="footer-links">
              <div><span>EXPLORE</span><a href="#experience">Experience</a><a href="#features">Features</a><a href="#pricing">Pricing</a><a href="#faq">FAQ</a></div>
              <div><span>RESOURCES</span><a href={LINKS.releases} target="_blank" rel="noopener noreferrer">Releases</a><a href={LINKS.security} target="_blank" rel="noopener noreferrer">Security</a><a href={LINKS.privacy} target="_blank" rel="noopener noreferrer">Privacy</a><a href={LINKS.license} target="_blank" rel="noopener noreferrer">License</a></div>
              <div><span>PROJECT</span><a href={LINKS.repository} target="_blank" rel="noopener noreferrer"><Github size={16} aria-hidden="true" /> GitHub <ArrowUpRight size={14} aria-hidden="true" /></a></div>
            </div>
          </div>
          <div className="footer-lower">
            <span>© {new Date().getFullYear()} LAAP. Crafted with intention.</span>
            <p>Independent project. Not endorsed by or affiliated with Riot Games. League of Legends is a trademark of Riot Games.</p>
            <a href="#top" aria-label="Back to top">BACK TO TOP <ArrowRight size={14} aria-hidden="true" /></a>
          </div>
        </div>
      </footer>
    </>
  );
}
