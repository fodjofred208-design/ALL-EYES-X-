import React from 'react';

interface Props {
  children: React.ReactNode;
  className?: string;
  critical?: boolean;
}

const GlowCard: React.FC<Props> = ({ children, className = '', critical = false }) => (
  <div className={`aeyes-card ${critical ? 'aeyes-critical' : ''} ${className}`}>
    {children}
  </div>
);

export default GlowCard;