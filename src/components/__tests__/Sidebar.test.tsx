import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Sidebar from '../Sidebar';

vi.mock('../DeviceSelector', () => ({ default: () => <div>Target Node</div> }));
vi.mock('../NeuralEye', () => ({ default: () => <div /> }));

describe('navigation', () => {
  it('opens and closes using the menu button and exposes device selection in the drawer', () => {
    const view = render(<MemoryRouter><Sidebar onLogout={() => {}} /></MemoryRouter>);
    const toggle = screen.getByRole('button', { name: 'Open navigation' });
    fireEvent.mouseDown(toggle);
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const menu = view.container.querySelector('#sidebar-menu');
    expect(menu?.textContent).toContain('Target Node');
    fireEvent.mouseDown(toggle);
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    view.unmount();
  });
});
