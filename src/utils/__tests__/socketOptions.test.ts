import { describe, expect, it } from 'vitest';
import { socketOptions } from '../socketOptions';

describe('Socket.IO transport resilience', () => {
  it('tries WebSocket first and polling when the first transport fails', () => {
    expect(socketOptions.transports).toEqual(['websocket', 'polling']);
    expect(socketOptions.tryAllTransports).toBe(true);
  });

  it('retains reconnect and credential settings', () => {
    expect(socketOptions.reconnection).toBe(true);
    expect(socketOptions.reconnectionAttempts).toBe(Infinity);
    expect(socketOptions.withCredentials).toBe(true);
  });
});
