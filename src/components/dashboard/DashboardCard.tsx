import React from 'react';

interface Props {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  accent?: string;
  actions?: React.ReactNode;
  variant?: 'green' | 'ghost';
  className?: string;
  onClick?: () => void;
  children: React.ReactNode;
}

const DashboardCard: React.FC<Props> = ({
  title,
  subtitle,
  icon,
  accent = '#22c55e',
  actions,
  variant = 'green',
  className = '',
  onClick,
  children,
}) => {
  const clickable = Boolean(onClick);
  const cls = `aeyes-card ${variant === 'ghost' ? 'aeyes-card--ghost' : ''} ${clickable ? 'aeyes-card--clickable' : ''} p-4 text-left w-full ${className}`;
  const handleKey = (e: React.KeyboardEvent) => {
    if ((e.key === 'Enter' || e.key === ' ') && onClick) { e.preventDefault(); onClick(); }
  };
  return (
    <div
      onClick={onClick}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? handleKey : undefined}
      className={cls}
    >
      <div className="flex items-start justify-between gap-2 mb-3 relative z-1">
        <div className="flex items-center gap-2 min-w-0">
          {icon && <span className="shrink-0" style={{ color: accent }}>{icon}</span>}
          <div className="min-w-0">
            <h3 className="text-[10px] font-orbitron uppercase tracking-[0.2em] text-slate-300 truncate">{title}</h3>
            {subtitle && <p className="text-[9px] font-mono-data text-slate-500 truncate">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="shrink-0" onClick={(e) => e.stopPropagation()}>{actions}</div>}
      </div>
      <div className="relative z-1">{children}</div>
    </div>
  );
};

export default DashboardCard;