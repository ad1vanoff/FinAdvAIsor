import { useEffect, useRef } from 'react';

const COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#4a3aa7'];

/** One short confetti burst when `fire` turns true. Skipped under reduced-motion. */
export function Confetti({ fire }: { fire: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!fire) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const parts = Array.from({ length: 150 }, (_, i) => ({
      x: rect.width / 2 + (Math.random() - 0.5) * 80,
      y: rect.height * 0.4,
      vx: (Math.random() - 0.5) * 11,
      vy: -Math.random() * 10 - 4,
      w: 5 + Math.random() * 6,
      h: 3 + Math.random() * 4,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.35,
      color: COLORS[i % COLORS.length],
    }));

    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const age = (t - t0) / 1000;
      ctx.clearRect(0, 0, rect.width, rect.height);
      const alpha = Math.max(0, 1 - Math.max(0, age - 1.3) / 0.9);
      for (const p of parts) {
        p.vy += 0.28;
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.985;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (age < 2.3) raf = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, rect.width, rect.height);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [fire]);

  return <canvas ref={ref} className="confetti" aria-hidden="true" />;
}
