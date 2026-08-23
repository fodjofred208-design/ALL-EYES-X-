import React from 'react';
import { motion } from 'framer-motion';
import AnimatedNumber from '../effects/AnimatedNumber';

interface Props {
  label: string;
  value: string | number;
  sub?: string;
  icon?: React.ReactNode;
  accent?: string;
  delay?: number;
}

const ExecutiveCard: React.FC<Props> = ({ label, value, sub, icon, accent = '#00d4ff', delay = 0 }) => (
  <motion.div
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.4, delay }}
    className="rounded-2xl border border-white/5 bg-gradient-to-b from-white/[0.04] to-white/[0.01] backdrop-blur-xl p-4 relative overflow-hidden"
  >
    <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full opacity-20 blur-2xl" style={{ backgroundColor: accent }} />
    <div className="flex items-center justify-between mb-2">
      <span className="text-[9px] font-orbitron uppercase tracking-[0.2em] text-slate-500">{label}</span>
      {icon && <span style={{ color: accent }}>{icon}</span>}
    </div>
    <AnimatedNumber
      value={typeof value === 'number' ? value : Number(String(value).replace(/[^\d.-]/g, '')) || 0}
      prefix={typeof value === 'string' ? String(value).replace(/[\d.,\s]+.*$/, '') : ''}
      suffix={typeof value === 'string' ? String(value).replace(/^[^\d]*/, '') : ''}
      className="text-2xl font-bold font-rajdhani text-white leading-none"
    />
    {sub && <p className="text-[9px] font-mono-data text-slate-500 mt-1.5">{sub}</p>}
  </motion.div>
);

export default ExecutiveCard;