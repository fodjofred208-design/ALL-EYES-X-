import type { ManagerOptions, SocketOptions } from 'socket.io-client';

/** Prefer real-time WebSocket, but actually try polling if the first transport
 * fails (Socket.IO does not do so by default). Keep reconnecting after outages.
 * A fallback is not a substitute for investigating repeated proxy errors.
 */
export const socketOptions: Partial<ManagerOptions & SocketOptions> = {
  transports: ['websocket', 'polling'],
  tryAllTransports: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  withCredentials: true,
};
