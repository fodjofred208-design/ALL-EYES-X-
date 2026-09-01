import React from 'react';
import { Monitor, Disc3, Cpu } from 'lucide-react';
import { useIconMode, setIconMode, type IconMode } from './DeviceIcon';

const OPTIONS: { id: IconMode; icon: React.ReactNode; label: string; title: string }[] = [
  { id: 'auto', icon: <Cpu size={11} />, label: 'Auto', title: 'OS logo while online, monitor while offline' },
  { id: 'os', icon: <Disc3 size={11} />, label: 'OS', title: 'Always the OS logo' },
  { id: 'device', icon: <Monitor size={11} />, label: 'Device', title: 'Always the neutral device icon' },
];

/**
 * Lets the operator choose how device icons are drawn. The choice persists in
 * localStorage and every DeviceIcon on screen follows it immediately.
 */
const IconModeToggle: React.FC = () => {
  const mode = useIconMode();
  return (
    <div
      className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-slate-900/50 px-1.5 py-1"
      title="How device icons are drawn"
      role="group"
      aria-label="Device icon style"
    >
      <span className="px-1 text-[9px] font-orbitron uppercase tracking-[0.14em] text-slate-400">Icons</span>
      {OPTIONS.map(o => (
        <button
          key={o.id}
          onClick={() => setIconMode(o.id)}
          title={o.title}
          aria-pressed={mode === o.id}
          className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-orbitron uppercase tracking-[0.12em] transition-colors ${
            mode === o.id
              ? 'border border-green-500/40 bg-green-500/10 text-green-300'
              : 'border border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
};

export default IconModeToggle;
