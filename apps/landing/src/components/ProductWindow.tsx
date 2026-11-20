import { ArrowUpRight, CircleCheck, CircleDot, Minus, Search, ShieldCheck } from "lucide-react";

type ProductWindowProps = {
  image?: string;
  alt?: string;
  compact?: boolean;
};

export default function ProductWindow({
  image = "/images/desktop-roster-preview.png",
  alt = "LAAP desktop roster showing League account cards",
  compact = false,
}: ProductWindowProps) {
  return (
    <div className={"product-window " + (compact ? "product-window-compact" : "")}>
      <div className="window-topbar" aria-hidden="true">
        <div className="window-dots"><span /><span /><span /></div>
        <div className="window-center"><span className="window-logo">L</span> LAAP DESKTOP</div>
        <div className="window-top-actions"><Minus size={14} /><CircleDot size={13} /></div>
      </div>
      <div className="window-image-wrap">
        <img className="window-image" src={image} alt={alt} width="1120" height="700" loading={compact ? "lazy" : "eager"} />
      </div>
      <div className="window-bottom-bar" aria-hidden="true">
        <span><CircleCheck size={13} /> Local-first</span>
        <span><ShieldCheck size={13} /> Encrypted sessions</span>
        <span className="window-bottom-search"><Search size={12} /> Search your roster <ArrowUpRight size={12} /></span>
      </div>
    </div>
  );
}
