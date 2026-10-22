import { EventEmitter } from 'events';

/** Event bus internal antar modul (notifikasi realtime, dsb) */
export const bus = new EventEmitter();
bus.setMaxListeners(50);

/** Emit helper yang aman (tidak melempar error jika tak ada listener) */
export function emit(event, payload) {
  bus.emit(event, payload);
}

export default bus;
