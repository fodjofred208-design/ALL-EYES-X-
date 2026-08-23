import React from 'react';

const Skeleton: React.FC<{ className?: string }> = ({ className = 'h-24' }) => (
  <div className={`skeleton ${className}`} />
);

export default Skeleton;