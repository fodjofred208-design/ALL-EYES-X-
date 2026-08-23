import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Network } from 'lucide-react';
import DashboardCard from './DashboardCard';
import { useDashboard } from '../../context/DashboardContext';
import { normalizeDevices } from '../../utils/normalize';

const W = 520;
const H = 320;
const CX = W / 2;
const CY = H / 2;

const GlobalTopologyMap: React.FC = () => {
  const { data } = useDashboard();
  const navigate = useNavigate();
  const list = normalizeDevices(data?.devices?.list ?? []);

  const nodes = useMemo(() => {
    const n = Math.max(list.length, 1);
    const R = Math.min(W, H) * 0.34;
    return list.map((d: any, i: number) => {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      return {
        ...d,
        x: CX + Math.cos(a) * R,
        y: CY + Math.sin(a) * R,
        id: d.device_id ?? d.id ?? `d-${i}`,
        name: d.hostname || d.device_id || 'device',
        online: String(d.status ?? '').toLowerCase() === 'online',
        loc: d.location || (d.country ? `${d.city ? d.city + ', ' : ''}${d.country}` : null),
      };
    });
  }, [list]);

  const hasLoc = nodes.some((n: any) => n.loc);

  return (
    <DashboardCard
      title="Global Device Topology"
      subtitle="ALL EYES X hub · live fleet links"
      icon={<Network size={18} />}
      accent="#22c55e"
      variant="ghost"
    >
      <div className="aeyes-topo relative w-full overflow-hidden rounded-xl bg-black/30 border border-white/5">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto max-h-[320px]" role="img" aria-label="Device topology">
          {/* faint grid */}
          {Array.from({ length: 8 }).map((_, i) => (
            <line key={`v${i}`} x1={(i + 1) * (W / 9)} y1={0} x2={(i + 1) * (W / 9)} y2={H} stroke="rgba(34,197,94,0.04)" />
          ))}
          {Array.from({ length: 5 }).map((_, i) => (
            <line key={`h${i}`} x1={0} y1={(i + 1) * (H / 6)} x2={W} y2={(i + 1) * (H / 6)} stroke="rgba(34,197,94,0.04)" />
          ))}

          {/* edges hub → device */}
          {nodes.map((n: any) => (
            <g key={`e-${n.id}`}>
              <line
                x1={CX} y1={CY} x2={n.x} y2={n.y}
                stroke={n.online ? 'rgba(34,197,94,0.35)' : 'rgba(100,116,139,0.25)'}
                strokeWidth="1.2"
                strokeDasharray={n.online ? '0' : '4 4'}
              />
              {n.online && (
                <circle r="2.5" fill="#22c55e">
                  <animateMotion dur="2.8s" repeatCount="indefinite" path={`M${CX},${CY} L${n.x},${n.y}`} />
                </circle>
              )}
            </g>
          ))}

          {/* hub — ALL EYES X */}
          <circle cx={CX} cy={CY} r="28" fill="rgba(34,197,94,0.08)" stroke="#22c55e" strokeWidth="1.5" />
          <circle cx={CX} cy={CY} r="10" fill="#22c55e" opacity="0.85">
            <animate attributeName="opacity" values="0.55;1;0.55" dur="2.4s" repeatCount="indefinite" />
          </circle>
          <text x={CX} y={CY + 42} textAnchor="middle" fill="#22c55e" fontSize="9" fontFamily="Orbitron, monospace" letterSpacing="1.5">
            ALL EYES X
          </text>

          {/* device nodes */}
          {nodes.map((n: any) => (
            <g
              key={n.id}
              className="cursor-pointer"
              onClick={() => navigate(`/device/${n.id}`)}
            >
              <circle
                cx={n.x} cy={n.y} r="11"
                fill={n.online ? 'rgba(34,197,94,0.15)' : 'rgba(51,65,85,0.35)'}
                stroke={n.online ? '#22c55e' : '#475569'}
                strokeWidth="1.2"
              />
              <circle cx={n.x} cy={n.y} r="3.5" fill={n.online ? '#22c55e' : '#64748b'} />
              <text x={n.x} y={n.y + 24} textAnchor="middle" fill="#94a3b8" fontSize="8" fontFamily="Share Tech Mono, monospace">
                {String(n.name).slice(0, 14)}
              </text>
              {n.ip && (
                <text x={n.x} y={n.y + 34} textAnchor="middle" fill="#475569" fontSize="7" fontFamily="Share Tech Mono, monospace">
                  {n.ip}
                </text>
              )}
            </g>
          ))}

          {nodes.length === 0 && (
            <text x={CX} y={CY + 60} textAnchor="middle" fill="#475569" fontSize="10" fontFamily="Share Tech Mono, monospace">
              No devices registered
            </text>
          )}
        </svg>
      </div>
      <p className="mt-2 text-[9px] font-mono-data text-slate-600">
        {hasLoc ? 'Geo fields attached when available · click a node for detail' : 'Location unavailable · topology drawn from live device registry'}
      </p>
    </DashboardCard>
  );
};

export default GlobalTopologyMap;