import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

interface Props {
  /** Main title. Rendered as white + neon-green split, matching the theme. */
  title: string;
  /** Optional word inside the title that should be neon green. */
  highlight?: string;
  subtitle?: string;
  /** Extra content pinned to the right (menus, selectors, badges). */
  right?: React.ReactNode;
  /** Where the back arrow goes. Defaults to browser history. */
  backTo?: string;
}

/**
 * Shared page header.
 *
 * Every ALL EYES X page uses this so the back arrow and title treatment are
 * identical everywhere - no page is a dead end.
 */
const PageHeader: React.FC<Props> = ({ title, highlight, subtitle, right, backTo }) => {
  const navigate = useNavigate();

  const goBack = () => {
    if (backTo) navigate(backTo);
    else navigate(-1);
  };

  let titleNode: React.ReactNode = title;
  if (highlight && title.includes(highlight)) {
    const [before, after] = title.split(highlight);
    titleNode = (
      <>
        {before}
        <span className="text-[#22c55e]">{highlight}</span>
        {after}
      </>
    );
  }

  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div className="flex items-start gap-3 min-w-0">
        <button
          onClick={goBack}
          title="Go back"
          aria-label="Go back"
          className="mt-1 p-2 rounded-lg border border-green-500/20 bg-green-500/5 text-green-400 hover:bg-green-600 hover:text-white hover:border-green-500/50 transition-all shrink-0"
        >
          <ArrowLeft size={16} />
        </button>

        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-orbitron font-bold tracking-[0.25em] text-white aeyes-title-glow truncate">
            {titleNode}
          </h1>
          {subtitle && (
            <p className="mt-1 text-[10px] font-mono-data text-[#22c55e] tracking-[0.3em] uppercase">
              {subtitle}
            </p>
          )}
          <div className="aeyes-divider mt-2 w-56 md:w-80" />
        </div>
      </div>

      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
};

export default PageHeader;
