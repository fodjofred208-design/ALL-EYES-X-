import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Radio } from 'lucide-react';
import type { AnalysisCategory } from './capabilities';

export interface SummaryStat {
  label: string;
  value: string | number;
  /** Severity colour, only where it carries meaning. */
  tone?: 'neutral' | 'low' | 'medium' | 'high' | 'critical';
}

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
      className={`glass-card overflow-hidden transition-shadow duration-300 ${
        open ? 'border-green-500/25' : 'hover:border-green-500/20'
      }`}
    >
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full text-left px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4 group"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <span className="text-[10px] font-orbitron tracking-[0.2em] text-green-500/70 shrink-0">
            {category.index}
          </span>
          <div className="min-w-0">
            <h2 className="text-base md:text-lg font-orbitron font-bold tracking-[0.18em] text-white uppercase truncate">
              {category.title}
            </h2>
            <p className="text-[10px] font-mono-data text-slate-500 truncate">
              {category.subtitle}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span
            className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-[8px] font-orbitron uppercase tracking-[0.18em] border ${
              live
                ? 'text-green-400 border-green-500/30 bg-green-500/10'
                : 'text-slate-500 border-slate-600/30 bg-slate-800/40'
            }`}
          >
            {live && (
              <motion.span
                animate={{ opacity: [1, 0.25, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="w-1.5 h-1.5 rounded-full bg-green-400"
              />
            )}
            {!live && <Radio size={9} />}
            {state}
          </span>
          <ChevronRight
            size={16}
            className={`text-slate-500 group-hover:text-green-400 transition-transform duration-300 ${
              open ? 'rotate-90' : ''
            }`}
          />
        </div>
      </button>

      {/* Summary figures - real counts only, never placeholders */}
      {!open && stats.length > 0 && (
        <div className="px-5 pb-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          {stats.map(s => (
            <div key={s.label} className="rounded-md border border-white/5 bg-slate-900/30 px-3 py-2">
              <p className="text-[8px] font-orbitron uppercase tracking-[0.16em] text-slate-500">
                {s.label}
              </p>
              <p className={`text-lg font-mono-data ${TONE[s.tone ?? 'neutral']}`}>{s.value}</p>
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
