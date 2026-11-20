type BrandProps = {
  onDark?: boolean;
};

export default function Brand({ onDark = true }: BrandProps) {
  return (
    <a className={"brand " + (onDark ? "brand-light" : "")} href="#top" aria-label="LAAP, back to top">
      <span className="brand-symbol" aria-hidden="true"><span /><span /><span /></span>
      <span className="brand-word">LAAP<span className="brand-dot">.</span></span>
    </a>
  );
}
