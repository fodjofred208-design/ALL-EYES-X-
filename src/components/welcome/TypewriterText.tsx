import React, { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '../../hooks/useReducedMotion';

interface Props {
  text: string;
  speed?: number;   // ms per char
  startDelay?: number;
  className?: string;
}

const TypewriterText: React.FC<Props> = ({ text, speed = 14, startDelay = 2600, className = '' }) => {
  const reduced = useReducedMotion();
  const [count, setCount] = useState(reduced ? text.length : 0);
  const started = useRef(false);

  useEffect(() => {
    if (reduced) { setCount(text.length); return; }
    if (started.current) return;
    started.current = true;
    let i = 0;
    const t = setTimeout(() => {
      const iv = setInterval(() => {
        i += 1;
        setCount(i);
        if (i >= text.length) clearInterval(iv);
      }, speed);
    }, startDelay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, reduced]);

  return (
    <p className={className}>
      {text.slice(0, count)}
      {count < text.length && <span className="aeyes-caret" style={{ height: '1em' }} />}
    </p>
  );
};

export default TypewriterText;