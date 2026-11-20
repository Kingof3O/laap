import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, LockKeyhole, RadioTower } from "lucide-react";
import { CHAPTERS } from "../content";

export default function ScrollStory() {
  const rootRef = useRef<HTMLElement>(null);
  const progressRef = useRef<HTMLSpanElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      const steps = Array.from(root.querySelectorAll<HTMLElement>("[data-story-step]"));
      const target = window.innerHeight * 0.48;
      let next = 0;
      let nearest = Number.POSITIVE_INFINITY;
      for (let i = 0; i < steps.length; i++) {
        const bounds = steps[i].getBoundingClientRect();
        const distance = bounds.top <= target && bounds.bottom >= target
          ? 0
          : Math.min(Math.abs(bounds.top - target), Math.abs(bounds.bottom - target));
        if (distance < nearest) {
          nearest = distance;
          next = i;
        }
      }
      setActive((prev) => prev === next ? prev : next);
      const bounds = root.getBoundingClientRect();
      const travel = Math.max(1, bounds.height - window.innerHeight);
      const progress = Math.max(0, Math.min(1, -bounds.top / travel));
      if (progressRef.current) {
        progressRef.current.style.transform = "scaleX(" + progress.toFixed(4) + ")";
      }
    };
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <section id="experience" className="story-section section-pad" ref={rootRef} aria-labelledby="story-heading">
      <div className="container">
        <div className="section-heading story-heading">
          <span className="eyebrow"><span className="eyebrow-line" /> THE EXPERIENCE</span>
          <h2 id="story-heading">A better flow.<br /><span className="serif-accent">From the first click.</span></h2>
          <p>Not another complicated dashboard. A focused desktop companion built around the way you actually switch and play.</p>
        </div>
        <div className="story-layout">
          <div className="story-steps">
            {CHAPTERS.map((chapter, index) => (
              <article className={"story-step " + (active === index ? "story-step-active" : "")}
                id={"chapter-" + chapter.id} key={chapter.id} data-story-step aria-labelledby={"chapter-heading-" + chapter.id}>
                <span className="story-step-number">{chapter.number} / 03</span>
                <span className="story-step-eyebrow">{chapter.eyebrow}</span>
                <h3 id={"chapter-heading-" + chapter.id}>{chapter.title}</h3>
                <p>{chapter.description}</p>
                <img src={chapter.image} alt={chapter.imageAlt} className="story-inline-image" loading="lazy" />
                <span className="story-step-detail"><Check size={15} aria-hidden="true" /> Built for the desktop, not a browser workaround</span>
              </article>
            ))}
          </div>
          <div className="story-sticky">
            <div className="story-visual-frame">
              <div className="story-visual-top">
                <span className="story-visual-kicker"><span className="live-spark" /> IN FOCUS</span>
                <span className="story-visual-index">0{active + 1} <span>/ 03</span></span>
              </div>
              <div className="story-scene-stack">
                {CHAPTERS.map((chapter, index) => (
                  <div key={chapter.id} className={"story-scene " + (index === active ? "story-scene-active" : "")}
                    aria-hidden={index !== active}>
                    <div className="story-image-shell">
                      <img src={chapter.image} alt={index === active ? chapter.imageAlt : ""} loading="lazy" />
                    </div>
                    <div className="story-image-overlay" aria-hidden="true">
                      <span className="overlay-icon">{index === 0 ? <ArrowUpRight size={18} /> : index === 1 ? <LockKeyhole size={18} /> : <RadioTower size={18} />}</span>
                      <div><small>LAAP / {chapter.number}</small><strong>{chapter.marker}</strong></div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="story-visual-bottom">
                <div className="story-progress-track"><span ref={progressRef} /></div>
                <span>SCROLL TO EXPLORE <ArrowUpRight size={13} aria-hidden="true" /></span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
