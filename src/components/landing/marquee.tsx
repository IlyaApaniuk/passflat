'use client';

const districts = [
  'Mokotów',
  'Ursynów',
  'Śródmieście',
  'Praga Północ',
  'Wola',
  'Żoliborz',
  'Bielany',
  'Ochota',
  'Wilanów',
  'Targówek',
  'Bemowo',
  'Ursus',
];

function MarqueeRow() {
  return (
    <div className="flex shrink-0 gap-8">
      {districts.map((district) => (
        <div
          key={district}
          className="flex items-center gap-8 whitespace-nowrap text-4xl font-bold text-muted-foreground/20 select-none sm:text-5xl md:text-6xl"
        >
          <span className="cursor-default transition-colors hover:text-accent/40">
            {district}
          </span>
          <span className="text-accent/30">•</span>
        </div>
      ))}
    </div>
  );
}

export function Marquee() {
  return (
    <section className="relative overflow-hidden border-y border-border/50 py-16">
      <div className="absolute bottom-0 left-0 top-0 z-10 w-32 bg-gradient-to-r from-background to-transparent" />
      <div className="absolute bottom-0 right-0 top-0 z-10 w-32 bg-gradient-to-l from-background to-transparent" />

      <div className="flex w-max animate-marquee gap-8">
        <MarqueeRow />
        <MarqueeRow />
      </div>
    </section>
  );
}
