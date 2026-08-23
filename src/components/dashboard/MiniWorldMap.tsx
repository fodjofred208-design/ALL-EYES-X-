import React from 'react';
import { Globe } from 'lucide-react';
import DashboardCard from './DashboardCard';
import { useDashboard } from '../../context/DashboardContext';

// ISO code → [lat, lng] (centroid)
const COORDS: Record<string, [number, number]> = {
  US: [37.09, -95.71], CA: [56.13, -106.35], MX: [23.63, -102.55], BR: [-14.24, -51.93],
  AR: [-38.42, -63.62], GB: [55.38, -3.44], FR: [46.23, 2.21], DE: [51.17, 10.45],
  ES: [40.46, -3.75], IT: [41.87, 12.57], RU: [61.52, 105.32], IN: [20.59, 78.96],
  CN: [35.86, 104.20], JP: [36.20, 138.25], KR: [35.91, 127.77], AU: [-25.27, 133.78],
  ZA: [-30.56, 22.94], NG: [9.08, 8.68], EG: [26.82, 30.80], SA: [23.89, 45.08],
  ID: [-0.79, 113.92], PK: [30.38, 69.35], TR: [38.96, 35.24], SE: [60.13, 18.64],
  NL: [52.13, 5.29], PL: [51.92, 19.15], UA: [48.38, 31.17], IL: [31.05, 34.85],
  AE: [23.42, 53.85], NZ: [-40.90, 174.89], NO: [60.47, 8.47], CH: [46.82, 8.23],
};

const W = 600;
const H = 300;
const proj = (lat: number, lng: number) => [((lng + 180) / 360) * W, ((90 - lat) / 180) * H] as const;

const MiniWorldMap: React.FC = () => {
  const { data } = useDashboard();
  const geo = data?.geo;
  const countries = geo?.countries ?? [];
  const total = geo?.total ?? 0;
  const maxCount = Math.max(1, ...countries.map((c: any) => c.count ?? 0));

  const grid: Array<[number, number]> = [];
  for (let gx = 0; gx < W; gx += 24) for (let gy = 0; gy < H; gy += 24) grid.push([gx, gy]);

  return (
    <DashboardCard title="Global Device Map" subtitle={`${total} devices · ${countries.length} countries`} icon={<Globe size={18} />} accent="#00d4ff">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
        {grid.map(([gx, gy], i) => (
          <circle key={i} cx={gx} cy={gy} r={0.8} fill="#ffffff" opacity={0.04} />
        ))}
        {countries.map((c: any) => {
          const cc = String(c.code ?? '').toUpperCase();
          const coord = COORDS[cc];
          if (!coord) return null;
          const [x, y] = proj(coord[0], coord[1]);
          const r = 2 + (c.count / maxCount) * 4;
          return (
            <g key={cc}>
              <circle cx={x} cy={y} r={r + 4} fill="#00d4ff" opacity={0.12}>
                <animate attributeName="r" values={`${r + 3};${r + 7};${r + 3}`} dur="2.4s" repeatCount="indefinite" />
              </circle>
              <circle cx={x} cy={y} r={r} fill="#00d4ff" opacity={0.9}>
                <title>{`${c.name ?? cc}: ${c.count} device(s)`}</title>
              </circle>
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {countries.slice(0, 12).map((c: any) => (
          <span key={c.code} className="px-1.5 py-0.5 rounded bg-white/5 text-[8px] font-mono-data text-slate-400">
            {c.code} · {c.count}
          </span>
        ))}
      </div>
    </DashboardCard>
  );
};

export default MiniWorldMap;