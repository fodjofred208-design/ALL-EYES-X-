import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

interface Props {
  /** Where to go. Defaults to browser history (step back one page). */
  to?: string;
  /** Smaller variant for tight headers. */
  compact?: boolean;
  className?: string;
}

/**
 * Step-back arrow.
 *
 * Deliberately a standalone button rather than part of PageHeader, so it can be
 * dropped into any page's existing header without restyling that header.
 */
const BackButton: React.FC<Props> = ({ to, compact = false, className = '' }) => {
  const navigate = useNavigate();

  const goBack = () => {
    if (to) navigate(to);
    else navigate(-1);
  };

  const size = compact ? 'p-1.5' : 'p-2';
  const icon = compact ? 14 : 16;

  return (
    <button
      onClick={goBack}
      title="Go back"
      aria-label="Go back"
      className={`${size} rounded-lg border border-green-500/20 bg-green-500/5 text-green-400 hover:bg-green-600 hover:text-white hover:border-green-500/50 transition-all shrink-0 ${className}`}
    >
      <ArrowLeft size={icon} />
    </button>
  );
};

export default BackButton;
