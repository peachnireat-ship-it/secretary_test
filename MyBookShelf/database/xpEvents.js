const listeners = new Set();

export function onXpGain(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emitXpGain(amount) {
  listeners.forEach((fn) => fn(amount));
}
