import { RingChart } from '../../shared/RingChart';

interface HomeBlockProps {
  icon: string;
  name: string;
  href?: string;
  pct?: number;
}

export function HomeBlock({ icon, name, href, pct }: HomeBlockProps) {
  const content = (
    <>
      <div className="home-block-icon">{icon}</div>
      <div className="home-block-name">{name}</div>
      {pct != null ? <RingChart pct={pct} size={72} /> : <div className="home-block-badge">בקרוב</div>}
    </>
  );

  if (href) {
    return <a className="home-block" href={href}>{content}</a>;
  }
  return <div className="home-block home-block-idea">{content}</div>;
}
