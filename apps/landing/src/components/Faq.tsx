import { Plus } from "lucide-react";
import { FAQ } from "../content";

export default function Faq() {
  return (
    <section id="faq" className="faq-section section-pad" aria-labelledby="faq-heading">
      <div className="container faq-layout">
        <div className="faq-intro">
          <span className="eyebrow"><span className="eyebrow-line" /> THE DETAILS</span>
          <h2 id="faq-heading">Good questions.<br /><span className="serif-accent">Clear answers.</span></h2>
          <p>Understand what LAAP does, where your sessions stay, and what to expect before installing.</p>
        </div>
        <div className="faq-list">
          {FAQ.map((item) => (
            <details key={item.question} className="faq-item">
              <summary><span>{item.question}</span><Plus aria-hidden="true" size={19} /></summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
