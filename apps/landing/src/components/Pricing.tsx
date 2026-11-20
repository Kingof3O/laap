import { useState } from "react";
import { ArrowRight, Check, Info, Sparkles } from "lucide-react";
import { LINKS } from "../content";

const tiers = {
  monthly: { amount: "$3", period: "/ month", note: "Billed monthly when checkout launches" },
  yearly: { amount: "$20", period: "/ year", note: "Billed yearly when checkout launches" },
  lifetime: { amount: "$60", period: "once", note: "One-time access when checkout launches" },
} as const;

type BillingTerm = keyof typeof tiers;

export default function Pricing() {
  const [term, setTerm] = useState<BillingTerm>("yearly");
  const selected = tiers[term];

  return (
    <section id="pricing" className="pricing-section section-pad" aria-labelledby="pricing-heading">
      <div className="container">
        <div className="section-heading section-heading-center">
          <span className="eyebrow"><span className="eyebrow-line" /> SIMPLE BY DESIGN</span>
          <h2 id="pricing-heading">A plan that fits.<br /><span className="serif-accent">Nothing you don't need.</span></h2>
          <p>Start with two active profiles. Move to unlimited profiles when Pro becomes available.</p>
        </div>
        <div className="pricing-wrap">
          <div className="pricing-controls" role="group" aria-label="Choose planned Pro billing period">
            {(Object.keys(tiers) as BillingTerm[]).map((key) => (
              <button className={"pricing-term " + (term === key ? "pricing-term-active" : "")}
                type="button" key={key} aria-pressed={term === key} onClick={() => setTerm(key)}>
                {key === "monthly" ? "Monthly" : key === "yearly" ? "Yearly" : "Lifetime"}
              </button>
            ))}
          </div>
          <div className="pricing-cards">
            <article className="price-card">
              <div className="price-card-top">
                <span className="plan-tag">FOR YOUR ESSENTIALS</span>
                <h3>Basic</h3>
                <p>Everything you need to organize your daily League accounts.</p>
              </div>
              <div className="price-value"><strong>Free</strong><span>forever</span></div>
              <a className="button button-subtle button-block" href={LINKS.releases} target="_blank" rel="noopener noreferrer">View available downloads <ArrowRight size={17} /></a>
              <div className="plan-divider" />
              <span className="plan-includes">WHAT'S INCLUDED</span>
              <ul>
                <li><Check size={17} /> Two active profiles</li>
                <li><Check size={17} /> Local encrypted session storage</li>
                <li><Check size={17} /> Favorites, notes and roster search</li>
                <li><Check size={17} /> Signed application updates</li>
              </ul>
            </article>
            <article className="price-card price-card-featured">
              <span className="price-featured-label"><Sparkles size={14} /> PLANNED UPGRADE</span>
              <div className="price-card-top">
                <span className="plan-tag">FOR YOUR WHOLE ROSTER</span>
                <h3>Pro</h3>
                <p>More room for every account, with the same local-first foundation.</p>
              </div>
              <div className="price-value"><strong>{selected.amount}</strong><span>{selected.period}</span></div>
              <p className="price-caption">{selected.note}</p>
              <a className="button button-primary button-block" href={LINKS.repository} target="_blank" rel="noopener noreferrer">Follow launch progress <ArrowRight size={17} /></a>
              <div className="plan-divider" />
              <span className="plan-includes">EVERYTHING IN BASIC, PLUS</span>
              <ul>
                <li><Check size={17} /> Unlimited active profiles</li>
                <li><Check size={17} /> Keep extra profiles saved if Pro ends</li>
                <li><Check size={17} /> Same installer and update channel</li>
                <li><Check size={17} /> Monthly, yearly or lifetime options planned</li>
              </ul>
            </article>
          </div>
          <p className="pricing-notice"><Info size={16} aria-hidden="true" /> Pro prices are planned, not a live offer. Checkout remains disabled pending launch approvals and verification.</p>
        </div>
      </div>
    </section>
  );
}
