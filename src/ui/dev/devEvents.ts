import type { LogEvent, LogFields } from '../../core/controller';

export type DevEvent = { id: number; event: LogEvent; fields?: LogFields };

let events: DevEvent[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

export function recordDevEvent(event: LogEvent, fields?: LogFields) {
  events = [{ id: nextId++, event, fields }, ...events].slice(0, 5);
  listeners.forEach((listener) => listener());
}

export function subscribeDevEvents(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getDevEvents() {
  return events;
}
