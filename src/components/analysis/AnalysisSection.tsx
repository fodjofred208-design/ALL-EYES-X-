import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import type { AnalysisCategory } from './capabilities';

export interface SummaryStat {
  label: string;
  value: string | number;
  /** Severity colour, only where it carries meaning. */
  tone?: 'neutral' | 'low' | 'medium' | 'high' | 'critical';
}

// Staggered so modules do not scan in lockstep - it reads as independent
// monitoring rather than one animation copied six times.
const SCAN_DELAY: Record<string, number> = {
  devices: 0, ports: 1, traffic: 2, topology: 3, malware: 4, logs: 5,
};

const TONE: Record<string, string> = {
  neutral: 'text-slate-200',
  low: 'text-green-400',
  medium: 'text-amber-400',
  high: 'text-orange-400',
  critical: 'text-red-400',
};

interface Props {
  category: AnalysisCategory;
  /** Compact summary shown before the workspace opens. */
  stats: SummaryStat[];
  /** Data-state badge: LIVE / HISTORICAL / SENSOR NOT INSTALLED. */
  state: string;
  /** True when at least one module has live data behind it. */
  live?: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

/**
 * The inset-panel shell every analysis category uses, so the page reads as one
 * workspace rather than a wall of unrelated cards.
 *
 * Collapsed: category identity + real summary figures.
 * Expanded:  the detailed analytical modules.
 */
const AnalysisSection: React.FC<Props> = ({
  category,
  stats,
  state,
  live = false,
  defaultOpen = false,
  children,
}) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className={`aeyes-inset glass-card overflow-hidden ${
        open ? 'border-green-500/25' : 'hover:border-green-500/20'
      }`}
    >
      {/* Decorative layer: travelling edge signal, light sweep, HUD corners and a
          staggered scan line. Purely visual - no data is implied by any of it. */}
      <span className="aeyes-inset__edge" aria-hidden="true" />
      <span className="aeyes-inset__sweep" aria-hidden="true" />
      <span className="aeyes-panel-scan" aria-hidden="true"
        style={{ animationDelay: `${SCAN_DELAY[category.id] ?? 0}s` }} />
      <span className="aeyes-inset__corner aeyes-inset__corner--tl" aria-hidden="true" />
      <span className="aeyes-inset__corner aeyes-inset__corner--tr" aria-hidden="true" />
      <span className="aeyes-inset__corner aeyes-inset__corner--bl" aria-hidden="true" />
      <span className="aeyes-inset__corner aeyes-inset__corner--br" aria-hidden="true" />
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full text-left px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4 group"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <span className="text-[10px] font-orbitron tracking-[0.2em] text-green-400 shrink-0">
            {category.index}
          </span>
          <div className="min-w-0">
            <h2 className="aeyes-inset__title text-base md:text-lg font-orbitron font-bold tracking-[0.18em] text-white uppercase truncate">
              {category.title}
            </h2>
            <p className="text-[10px] font-mono-data text-slate-400 truncate">
              {category.subtitle}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span
            className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-[8px] font-orbitron uppercase tracking-[0.18em] border ${
              live
                ? 'text-green-400 border-green-500/30 bg-green-500/10'
                : 'text-slate-400 border-slate-600/40 bg-slate-800/40'
            }`}
          >
            {live ? (
              <span className="aeyes-live-dot" aria-hidden="true" />
            ) : (
              <span className="aeyes-live-dot aeyes-live-dot--warn" aria-hidden="true" />
            )}
            {state}
          </span>
          <ChevronRight
            size={16}
            className={`aeyes-inset__arrow text-slate-400 group-hover:text-green-400 ${
              open ? 'rotate-90' : ''
            }`}
          />
        </div>
      </button>

      {/* Summary figures - real counts only, never placeholders */}
      {!open && stats.length > 0 && (
        <div className="px-5 pb-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          {stats.map(s => (
            <div key={s.label} className="aeyes-stat rounded-md border border-white/5 bg-slate-900/30 px-3 py-2">
              <p className="text-[8px] font-orbitron uppercase tracking-[0.16em] text-slate-400">
                {s.label}
              </p>
              <p className={`aeyes-stat__value text-lg font-mono-data ${TONE[s.tone ?? 'neutral']}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 space-y-4 border-t border-green-500/10 pt-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
};

export default AnalysisSection;
