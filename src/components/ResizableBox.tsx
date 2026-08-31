import React, { useCallback, useEffect, useRef, useState } from 'react';

/**
 * ResizableBox — a panel the operator can resize by dragging, the same way you
 * drag the corner of a shape in a drawing program.
 *
 * Eight handles (4 corners + 4 edges). Pointer events, so it works with a mouse
 * and with touch. Sizes are persisted in localStorage per storage key so a wall
 * the operator arranged stays arranged after a reload.
 *
 * During the drag the size is written straight to the element's style instead of
 * going through React state, so a modest machine stays smooth while the pointer
 * moves. React state is committed once, on release.
 */

export interface BoxSize {
  w: number;
  h: number;
}

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

const STORAGE_PREFIX = 'aeyesx.box.';

/** Read a saved size for a key, or null when nothing was saved. */
export const loadBoxSize = (key: string): BoxSize | null => {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.w === 'number' && typeof parsed?.h === 'number'
      && Number.isFinite(parsed.w) && Number.isFinite(parsed.h)) {
      return { w: Math.round(parsed.w), h: Math.round(parsed.h) };
    }
  } catch { /* corrupt entry or no localStorage — fall back to defaults */ }
  return null;
};

export const saveBoxSize = (key: string, size: BoxSize) => {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify({ w: Math.round(size.w), h: Math.round(size.h) }));
  } catch { /* private mode / quota — resizing still works for this session */ }
};

export const clearBoxSize = (key: string) => {
  try {
    localStorage.removeItem(STORAGE_PREFIX + key);
  } catch { /* nothing to do */ }
};

/** Remove every saved box size — used by the pages' "Reset layout" button. */
export const clearAllBoxSizes = (prefix: string) => {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(STORAGE_PREFIX + prefix)) doomed.push(k);
    }
    doomed.forEach(k => localStorage.removeItem(k));
  } catch { /* nothing to do */ }
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

interface HandleSpec {
  id: ResizeHandle;
  cursor: string;
  /** Tailwind classes that place the handle on the box. */
  place: string;
  /** Tailwind classes for the visible bar / corner grip. */
  look: string;
}

const CORNER = 'w-3 h-3 border-green-400/80 bg-black/70';
const EDGE_X = 'h-2.5 w-10 bg-green-400/25 hover:bg-green-400/70 rounded-full';
const EDGE_Y = 'w-2.5 h-10 bg-green-400/25 hover:bg-green-400/70 rounded-full';

const HANDLES: HandleSpec[] = [
  { id: 'nw', cursor: 'nwse-resize', place: '-top-1.5 -left-1.5',        look: `${CORNER} border-t-2 border-l-2 rounded-tl` },
  { id: 'n',  cursor: 'ns-resize',   place: '-top-1.5 left-1/2 -ml-5',   look: EDGE_X },
  { id: 'ne', cursor: 'nesw-resize', place: '-top-1.5 -right-1.5',       look: `${CORNER} border-t-2 border-r-2 rounded-tr` },
  { id: 'e',  cursor: 'ew-resize',   place: 'top-1/2 -right-1.5 -mt-5',  look: EDGE_Y },
  { id: 'se', cursor: 'nwse-resize', place: '-bottom-1.5 -right-1.5',    look: `${CORNER} border-b-2 border-r-2 rounded-br` },
  { id: 's',  cursor: 'ns-resize',   place: '-bottom-1.5 left-1/2 -ml-5',look: EDGE_X },
  { id: 'sw', cursor: 'nesw-resize', place: '-bottom-1.5 -left-1.5',     look: `${CORNER} border-b-2 border-l-2 rounded-bl` },
  { id: 'w',  cursor: 'ew-resize',   place: 'top-1/2 -left-1.5 -mt-5',   look: EDGE_Y },
];

export interface ResizableBoxProps {
  /** Storage key. Boxes sharing a key share a size. */
  storageKey: string;
  size: BoxSize;
  onResize: (size: BoxSize) => void;
  /** Size restored by "double-click a handle". Defaults to the first size rendered. */
  defaultSize?: BoxSize;
  min?: BoxSize;
  max?: BoxSize;
  children: React.ReactNode;
  className?: string;
  /** Short label shown in the size readout while dragging. */
  label?: string;
}

const DEFAULT_MIN: BoxSize = { w: 200, h: 140 };
const DEFAULT_MAX: BoxSize = { w: 4000, h: 3000 };

const ResizableBox: React.FC<ResizableBoxProps> = ({
  storageKey, size, onResize, defaultSize, min = DEFAULT_MIN, max = DEFAULT_MAX, children, className = '', label,
}) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const readoutRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<ResizeHandle | null>(null);
  const [hover, setHover] = useState(false);

  // Where "double-click to reset" returns to: the caller's defaultSize, or the
  // size this box first rendered at when no default was given.
  const initialSize = useRef(size);
  const defaultRef = useRef(size);
  defaultRef.current = defaultSize ?? initialSize.current;
  const dragState = useRef<{ handle: ResizeHandle; startX: number; startY: number; startW: number; startH: number } | null>(null);

  // Latest limits, read inside the move handler without re-binding listeners.
  const limits = useRef({ min, max });
  limits.current = { min, max };
  const sizeRef = useRef(size);
  sizeRef.current = size;

  /**
   * Hand a new size to the parent and (normally) remember it. `persist: false`
   * is used by reset: writing the default back to storage would pin a stale
   * size that stops the tile re-flowing when the window is later resized.
   */
  const commit = useCallback((next: BoxSize, persist = true): BoxSize => {
    const clamped = {
      w: Math.round(clamp(next.w, limits.current.min.w, limits.current.max.w)),
      h: Math.round(clamp(next.h, limits.current.min.h, limits.current.max.h)),
    };
    onResize(clamped);
    if (persist) saveBoxSize(storageKey, clamped);
    return clamped;
  }, [onResize, storageKey]);

  /**
   * Write the committed size straight to the element.
   *
   * This must NOT just clear the inline style and trust React: React skips a
   * style write when the incoming prop value is unchanged, so whenever a drag
   * ended at the size it started from - or was clamped back to it - the cleared
   * style survived and the box collapsed to nothing. The tile looked like it had
   * resized correctly and then vanished.
   */
  const applySize = (size: BoxSize) => {
    if (!boxRef.current) return;
    boxRef.current.style.width = `${size.w}px`;
    boxRef.current.style.height = `${size.h}px`;
  };

  useEffect(() => {
    if (!dragging) return;

    let raf = 0;
    let pending: BoxSize | null = null;

    const onMove = (e: PointerEvent) => {
      const drag = dragState.current;
      if (!drag) return;
      e.preventDefault();
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      const { min: lo, max: hi } = limits.current;

      let w = drag.startW;
      let h = drag.startH;
      if (drag.handle.includes('e')) w = drag.startW + dx;
      if (drag.handle.includes('w')) w = drag.startW - dx;
      if (drag.handle.includes('s')) h = drag.startH + dy;
      if (drag.handle.includes('n')) h = drag.startH - dy;

      pending = {
        w: clamp(w, lo.w, hi.w),
        h: clamp(h, lo.h, hi.h),
      };

      // Paint immediately, commit to React once per frame.
      if (!raf) {
        raf = requestAnimationFrame(() => {
          raf = 0;
          if (!pending || !boxRef.current) return;
          boxRef.current.style.width = `${Math.round(pending.w)}px`;
          boxRef.current.style.height = `${Math.round(pending.h)}px`;
          if (readoutRef.current) {
            readoutRef.current.textContent = `${Math.round(pending.w)} × ${Math.round(pending.h)}`;
          }
        });
      }
    };

    const onUp = () => {
      if (raf) cancelAnimationFrame(raf);
      const final = pending ?? sizeRef.current;
      setDragging(null);
      dragState.current = null;
      applySize(commit(final));
    };

    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [dragging, commit]);

  const startDrag = (handle: ResizeHandle) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragState.current = { handle, startX: e.clientX, startY: e.clientY, startW: size.w, startH: size.h };
    setDragging(handle);
  };

  /** Double-clicking any handle puts the box back to the size it first rendered at. */
  const resetSize = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    clearBoxSize(storageKey);
    applySize(commit(defaultRef.current, false));
  };

  const shown = dragging !== null || hover;

  return (
    <div
      ref={boxRef}
      className={`relative ${className}`}
      style={{ width: size.w, height: size.h }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {children}

      {/* Handles. Hidden until the pointer is over the box or a drag is live.
          Each handle gates its own pointer events: a pointer-events-none parent
          does NOT block a pointer-events-auto child, so gating the wrapper alone
          would leave invisible handles swallowing clicks. */}
      <div
        className={`absolute inset-0 transition-opacity duration-150 ${shown ? 'opacity-100' : 'opacity-0'}`}
      >
        {HANDLES.map(h => (
          <div
            key={h.id}
            data-handle={h.id}
            onPointerDown={startDrag(h.id)}
            onDoubleClick={resetSize}
            title="Drag to resize · double-click to reset"
            className={`absolute ${h.place} ${h.look} ${shown ? 'pointer-events-auto' : 'pointer-events-none'} ${
              dragging === h.id ? 'bg-green-400 border-green-300' : ''
            }`}
            style={{ cursor: h.cursor, touchAction: 'none' }}
          />
        ))}
      </div>

      {/* Live size readout, only while resizing. */}
      {dragging && (
        <div className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-black/85 border border-green-500/40 text-[9px] font-mono-data text-green-300 whitespace-nowrap z-50">
          {label ? `${label} · ` : ''}<span ref={readoutRef}>{size.w} × {size.h}</span>
        </div>
      )}
    </div>
  );
};

export default ResizableBox;
