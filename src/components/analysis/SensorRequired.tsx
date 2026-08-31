import React from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import type { ModuleCapability } from './capabilities';

/**
 * Honest empty state for a module whose sensor does not exist.
 *
 * This is deliberately NOT a chart with zeros. It states what is missing, why,
 * and what becomes available once the sensor ships - so an analyst never
 * mistakes an empty panel for a clean system.
 */
const SensorRequired: React.FC<{ module: ModuleCapability; compact?: boolean }> = ({
  module,
  compact = false,
}) => (
  <div
    className={`rounded-lg border border-dashed border-slate-600/40 bg-slate-900/30 ${
      compact ? 'p-4' : 'p-6'
    }`}
  >
    <div className="flex items-start gap-3">
      <AlertTriangle size={16} className="text-amber-400/80 shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-[10px] font-orbitron uppercase tracking-[0.2em] text-amber-400/90">
          Status: sensor not installed
        </p>
        <p className="mt-2 text-[11px] font-mono-data text-slate-400 leading-relaxed">
          {module.missing}
        </p>
        {module.unlocks && (
          <p className="mt-3 text-[10px] font-mono-data text-slate-500 leading-relaxed border-t border-white/5 pt-3">
            <span className="text-green-500/80 uppercase tracking-wider">When available: </span>
            {module.unlocks}
          </p>
        )}
        <motion.p
          className="mt-3 text-[9px] font-orbitron uppercase tracking-[0.2em] text-slate-600"
          animate={{ opacity: [0.45, 0.85, 0.45] }}
          transition={{ duration: 3, repeat: Infinity }}
        >
          No data is simulated for this module
        </motion.p>
      </div>
    </div>
  </div>
);

export default SensorRequired;
