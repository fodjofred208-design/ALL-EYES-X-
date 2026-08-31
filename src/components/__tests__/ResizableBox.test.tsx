import React, { useState } from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import ResizableBox, { loadBoxSize, type BoxSize } from '../ResizableBox';

/**
 * These tests drive the real ResizableBox component: real pointer events on the
 * real handles, through the real drag math, to the real onResize / localStorage
 * commit. Nothing here re-implements the logic under test.
 */

interface HarnessProps {
  initial: BoxSize;
  defaultSize?: BoxSize;
  min?: BoxSize;
  max?: BoxSize;
  storageKey?: string;
  onCommit?: (s: BoxSize) => void;
}

const Harness: React.FC<HarnessProps> = ({ initial, defaultSize, min, max, storageKey = 'test.box', onCommit }) => {
  const [size, setSize] = useState<BoxSize>(initial);
  return (
    <ResizableBox
      storageKey={storageKey}
      size={size}
      defaultSize={defaultSize}
      min={min}
      max={max}
      onResize={next => { setSize(next); onCommit?.(next); }}
    >
      <div>content</div>
    </ResizableBox>
  );
};

const handleOf = (container: HTMLElement, handle: string): HTMLElement => {
  const el = container.querySelector(`[data-handle="${handle}"]`);
  if (!el) throw new Error(`handle "${handle}" was not rendered`);
  return el as HTMLElement;
};

/** Drag one handle by (dx, dy) using real pointer events. */
const dragHandle = (container: HTMLElement, handle: string, dx: number, dy: number) => {
  fireEvent.pointerDown(handleOf(container, handle), { clientX: 500, clientY: 500 });
  fireEvent.pointerMove(window, { clientX: 500 + dx, clientY: 500 + dy });
  fireEvent.pointerUp(window);
};

beforeEach(() => {
  localStorage.clear();
});

describe('ResizableBox', () => {
  it('renders at the size it is given', () => {
    const { container } = render(<Harness initial={{ w: 400, h: 250 }} />);
    const box = container.firstElementChild as HTMLElement;
    expect(box.style.width).toBe('400px');
    expect(box.style.height).toBe('250px');
  });

  it('grows from the se handle by exactly the pointer delta and saves it', () => {
    let committed: BoxSize | null = null;
    const { container } = render(<Harness initial={{ w: 400, h: 250 }} onCommit={s => { committed = s; }} />);

    dragHandle(container, 'se', 120, 70);

    expect(committed).toEqual({ w: 520, h: 320 });
    expect(loadBoxSize('test.box')).toEqual({ w: 520, h: 320 });
  });

  it('resizes from the nw handle by moving the top-left corner', () => {
    let committed: BoxSize | null = null;
    const { container } = render(<Harness initial={{ w: 400, h: 250 }} onCommit={s => { committed = s; }} />);

    // Dragging nw left/up grows the box: dx = -100, dy = -50.
    dragHandle(container, 'nw', -100, -50);

    expect(committed).toEqual({ w: 500, h: 300 });
  });

  it('resizes width only from the e edge', () => {
    let committed: BoxSize | null = null;
    const { container } = render(<Harness initial={{ w: 400, h: 250 }} onCommit={s => { committed = s; }} />);
    dragHandle(container, 'e', 80, 500);
    expect(committed).toEqual({ w: 480, h: 250 });
  });

  it('resizes height only from the s edge', () => {
    let committed: BoxSize | null = null;
    const { container } = render(<Harness initial={{ w: 400, h: 250 }} onCommit={s => { committed = s; }} />);
    dragHandle(container, 's', 900, 40);
    expect(committed).toEqual({ w: 400, h: 290 });
  });

  it('clamps to the minimum instead of collapsing or inverting', () => {
    let committed: BoxSize | null = null;
    const { container } = render(
      <Harness initial={{ w: 400, h: 250 }} min={{ w: 300, h: 200 }} onCommit={s => { committed = s; }} />,
    );
    dragHandle(container, 'se', -5000, -5000);
    expect(committed).toEqual({ w: 300, h: 200 });
  });

  it('clamps to the maximum', () => {
    let committed: BoxSize | null = null;
    const { container } = render(
      <Harness initial={{ w: 400, h: 250 }} max={{ w: 600, h: 400 }} onCommit={s => { committed = s; }} />,
    );
    dragHandle(container, 'se', 9000, 9000);
    expect(committed).toEqual({ w: 600, h: 400 });
  });

  it('double-clicking a handle resets to defaultSize and clears storage', () => {
    let committed: BoxSize | null = null;
    const { container } = render(
      <Harness initial={{ w: 700, h: 500 }} defaultSize={{ w: 380, h: 209 }} onCommit={s => { committed = s; }} />,
    );

    // Grow it first so there is something to reset.
    dragHandle(container, 'se', 100, 100);
    expect(committed).toEqual({ w: 800, h: 600 });
    expect(loadBoxSize('test.box')).not.toBeNull();

    fireEvent.doubleClick(handleOf(container, 'se'));

    expect(committed).toEqual({ w: 380, h: 209 });
    expect(loadBoxSize('test.box')).toBeNull();
  });

  it('does not intercept clicks until the pointer is over the box', () => {
    const { container } = render(<Harness initial={{ w: 400, h: 250 }} />);
    const handle = handleOf(container, 'se');

    expect(handle.className).toContain('pointer-events-none');

    fireEvent.mouseEnter(container.firstElementChild as HTMLElement);

    expect(handle.className).toContain('pointer-events-auto');
  });

  it('rounds fractional sizes to whole pixels', () => {
    let committed: BoxSize | null = null;
    const { container } = render(<Harness initial={{ w: 400, h: 250 }} onCommit={s => { committed = s; }} />);
    dragHandle(container, 'se', 10.4, 20.6);
    expect(committed).toEqual({ w: 410, h: 271 });
  });
});

describe('ResizableBox keeps its size after a drag', () => {
  it('does not collapse when the drag ends at the same size', () => {
    // React skips a style write when the prop value is unchanged. onUp used to
    // clear the inline style and rely on React to re-apply it - so a drag that
    // ended where it started (or was clamped back to the same size) left the
    // element with no width/height and the box appeared to vanish.
    const { container } = render(<Harness initial={{ w: 400, h: 250 }} />);
    const box = container.firstElementChild as HTMLElement;

    dragHandle(container, 'se', 0, 0);

    expect(box.style.width).toBe('400px');
    expect(box.style.height).toBe('250px');
  });

  it('does not collapse when the drag is clamped back to the minimum', () => {
    const { container } = render(
      <Harness initial={{ w: 300, h: 200 }} min={{ w: 300, h: 200 }} />,
    );
    const box = container.firstElementChild as HTMLElement;

    dragHandle(container, 'se', -500, -500);

    expect(box.style.width).toBe('300px');
    expect(box.style.height).toBe('200px');
  });

  it('does not collapse on reset-to-default when already at default', () => {
    const { container } = render(
      <Harness initial={{ w: 380, h: 209 }} defaultSize={{ w: 380, h: 209 }} />,
    );
    const box = container.firstElementChild as HTMLElement;

    fireEvent.doubleClick(handleOf(container, 'se'));

    expect(box.style.width).toBe('380px');
    expect(box.style.height).toBe('209px');
  });
});
