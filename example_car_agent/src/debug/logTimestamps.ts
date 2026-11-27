// Every console line of the app starts with the local time ("14:47:19.935"), so a device log shows how long each step of a
// request took (the speech, the model, the reply). Imported first in index.js. Native lines (Xcode / logcat) keep their own format.

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** "14:47:19.935" */
export function clockStamp(date: Date = new Date()): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

const PATCHED = '__davoiceLogTimestamps';
const methods = ['log', 'info', 'warn', 'error', 'debug'] as const;

if (!(globalThis as any)[PATCHED]) {
  (globalThis as any)[PATCHED] = true;
  for (const name of methods) {
    const original = (console as any)[name];
    if (typeof original !== 'function') continue;
    (console as any)[name] = (...args: unknown[]) => {
      const stamp = `[${clockStamp()}]`;
      // a format string stays first ("%s"), so the stamp goes into it
      if (typeof args[0] === 'string') original.call(console, `${stamp} ${args[0]}`, ...args.slice(1));
      else original.call(console, stamp, ...args);
    };
  }
}
