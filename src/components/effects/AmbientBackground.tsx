import React, { useEffect, useRef } from 'react';
import { useReducedMotion } from '../../hooks/useReducedMotion';

interface Props {
  variant?: 'welcome' | 'dashboard' | 'squares';
  className?: string;
}

interface Star { x: number; y: number; r: number; tw: number; ph: number; }
interface Particle { x: number; y: number; vx: number; vy: number; a: number; r: number; }
interface Sq { x: number; y: number; vx: number; vy: number; size: number; rot: number; vr: number; a: number; }

const AmbientBackground: React.FC<Props> = ({ variant = 'dashboard', className = '' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let w = 0, h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    let stars: Star[] = [];
    let parts: Particle[] = [];
    let squares: Sq[] = [];

    const seed = () => {
      const rect = canvas.getBoundingClientRect();
      w = rect.width || window.innerWidth;
      h = rect.height || window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (variant === 'squares') {
        const count = Math.max(14, Math.floor((w * h) / 9000));
        squares = Array.from({ length: count }, () => ({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.18,
          vy: (Math.random() - 0.5) * 0.18,
          size: 2 + Math.random() * 5,
          rot: Math.random() * Math.PI * 2,
          vr: (Math.random() - 0.5) * 0.012,
          a: 0.03 + Math.random() * 0.07,
        }));
        return;
      }

      const dense = variant === 'welcome';
      const n = Math.floor((w * h) / (dense ? 6500 : 11000));
      stars = Array.from({ length: n }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.3 + 0.3,
        tw: 0.6 + Math.random() * 1.8,
        ph: Math.random() * Math.PI * 2,
      }));
      parts = Array.from({ length: Math.floor(n / 3) }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.14,
        vy: (Math.random() - 0.5) * 0.14,
        a: 0.05 + Math.random() * 0.12,
        r: Math.random() * 1.2 + 0.4,
      }));
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      const ts = t / 1000;

      if (variant === 'squares') {
        // faint static grid
        ctx.strokeStyle = 'rgba(34,197,94,0.035)';
        ctx.lineWidth = 1;
        const gap = 64;
        ctx.beginPath();
        for (let x = 0; x < w + gap; x += gap) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
        for (let y = 0; y < h + gap; y += gap) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
        ctx.stroke();

        // tiny transparent squares drifting slowly
        for (const s of squares) {
          s.x += s.vx; s.y += s.vy; s.rot += s.vr;
          if (s.x < -20) s.x = w + 20; if (s.x > w + 20) s.x = -20;
          if (s.y < -20) s.y = h + 20; if (s.y > h + 20) s.y = -20;
          ctx.save();
          ctx.translate(s.x, s.y);
          ctx.rotate(s.rot);
          ctx.strokeStyle = `rgba(34,197,94,${s.a})`;
          ctx.lineWidth = 1;
          ctx.strokeRect(-s.size / 2, -s.size / 2, s.size, s.size);
          ctx.restore();
        }
        return;
      }

      // nebula fog (subtle)
      const nb = ctx.createRadialGradient(w * 0.2, h * 0.25, 0, w * 0.2, h * 0.25, w * 0.5);
      nb.addColorStop(0, 'rgba(34,197,94,0.035)');
      nb.addColorStop(1, 'transparent');
      ctx.fillStyle = nb;
      ctx.fillRect(0, 0, w, h);
      const nb2 = ctx.createRadialGradient(w * 0.85, h * 0.7, 0, w * 0.85, h * 0.7, w * 0.45);
      nb2.addColorStop(0, 'rgba(0,212,255,0.025)');
      nb2.addColorStop(1, 'transparent');
      ctx.fillStyle = nb2;
      ctx.fillRect(0, 0, w, h);

      // drifting grid
      ctx.strokeStyle = 'rgba(34,197,94,0.05)';
      ctx.lineWidth = 1;
      const gap = 56;
      const off = (ts * 4) % gap;
      ctx.beginPath();
      for (let x = -off; x < w + gap; x += gap) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
      for (let y = -off; y < h + gap; y += gap) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
      ctx.stroke();

      // constellation links
      ctx.strokeStyle = 'rgba(34,197,94,0.05)';
      for (let i = 0; i < stars.length; i++) {
        for (let j = i + 1; j < stars.length; j++) {
          const dx = stars[i].x - stars[j].x;
          const dy = stars[i].y - stars[j].y;
          if (dx * dx + dy * dy < 110 * 110) {
            ctx.beginPath();
            ctx.moveTo(stars[i].x, stars[i].y);
            ctx.lineTo(stars[j].x, stars[j].y);
            ctx.stroke();
          }
        }
      }

      // stars
      for (const s of stars) {
        const a = 0.25 + 0.55 * Math.abs(Math.sin(ts * s.tw + s.ph));
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(34,197,94,${a})`;
        ctx.fill();
      }

      // particles
      for (const p of parts) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = w; if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h; if (p.y > h) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(34,197,94,${p.a})`;
        ctx.fill();
      }

      if (!reduced) raf = requestAnimationFrame(draw);
    };

    seed();
    if (reduced) { draw(0); } else { raf = requestAnimationFrame(draw); }
    const onResize = () => { seed(); if (reduced) draw(0); };
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, [variant, reduced]);

  return <canvas ref={canvasRef} className={`pointer-events-none fixed inset-0 z-0 ${className}`} aria-hidden="true" />;
};

export default AmbientBackground;