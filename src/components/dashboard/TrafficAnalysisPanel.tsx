import React from 'react';
import { Wifi } from 'lucide-react';
import DashboardCard from './DashboardCard';
import { useDashboard } from '../../context/DashboardContext';

/** Inset panel — fully self-contained. No navigation. */
const TrafficAnalysisPanel: React.FC = () => {
  const { data } = useDashboard();
  const t = data?.traffic ?? null;
  const dl = Number(t?.download ?? t?.down ?? t?.rx ?? 0);
  const ul = Number(t?.upload ?? t?.up ?? t?.tx ?? 0);
  const bw = Number(t?.bandwidth ?? t?.total ?? dl + ul);
  const busiest = t?.busiest_device ?? t?.top_device ?? null;
  const trend = (data?.charts?.traffic ?? t?.trend ?? []).map((p: any) => Number(p.y ?? p.value ?? p.down ?? 0));
  const max = Math.max(dl, ul, 1);
  const tMax = Math.max(...trend, 1);

  return (
    <DashboardCard
      title="Traffic Analysis"
      subtitle="network monitor · traffic trend"
      icon={<Wifi size={18} />}
      accent="#22c55e"
      variant="ghost"
    >
      {t == null ? (
        <p className="text-center py-8 text-[10px] font-mono-data text-slate-600">No telemetry available</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {[
              { l: 'Download', v: dl },
              { l: 'Upload', v: ul },
              { l: 'Bandwidth', v: bw },
              { l: 'Busiest Device', v: busiest ? String(busiest) : '—' },
            ].map(s => (
              <div key={s.l} className="p-2 rounded-lg bg-white/5">
                <p className="text-[8px] font-orbitron text-slate-500 uppercase tracking-widest">{s.l}</p>
                <p className="text-[12px] font-mono-data text-slate-200 mt-1 truncate">{typeof s.v === 'number' ? s.v.toFixed(1) : s.v}</p>
              </div>
            ))}
          </div>

          {/* Network Traffic Monitor bars */}
          <div className="space-y-2">
            <div>
              <p className="text-[8px] font-mono-data text-slate-500 mb-1">Download</p>
              <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full transition-all duration-700" style={{ width: `${(dl / max) * 100}%`, background: 'linear-gradient(90deg,#22c55e,#16a34a)' }} />
              </div>
            </div>
            <div>
              <p className="text-[8px] font-mono-data text-slate-500 mb-1">Upload</p>
              <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full transition-all duration-700" style={{ width: `${(ul / max) * 100}%`, background: 'linear-gradient(90deg,#4ade80,#15803d)' }} />
              </div>
            </div>
          </div>

          {/* Traffic Trend */}
          <div>
            <p className="text-[8px] font-orbitron text-slate-500 tracking-widest uppercase mb-2">Traffic Trend</p>
            {trend.length === 0 ? (
              <p className="text-[9px] font-mono-data text-slate-600">Collecting telemetry…</p>
            ) : (
              <div className="flex items-end gap-0.5 h-12">
                {trend.slice(-24).map((v: number, i: number) => (
                  <div
                    key={i}
                    className="flex-1 rounded-t-sm bg-green-500/60 transition-all duration-500"
                    style={{ height: `${Math.max(4, (v / tMax) * 100)}%` }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </DashboardCard>
  );
};

export default TrafficAnalysisPanel;