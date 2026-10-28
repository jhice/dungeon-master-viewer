// Game clock in ticks and queue of delayed events (actuator `delay`).
// The duration of a tick is set by the caller (main.js); the simulation only
// counts ticks, so it runs the same in Node.

/** @returns {{ now: number, schedule(delay, run, key?): void, advance(ticks): void, flush(): void, clear(): void }} */
export function createClock() {
  let now = 0;
  let order = 0; // events due at the same tick run in insertion order
  let queue = []; // [{ time, order, run }], sorted

  // Runs every event due at the current tick, including those they schedule with no delay.
  function flush() {
    while (queue.length && queue[0].time <= now) queue.shift().run();
  }

  return {
    get now() {
      return now;
    },
    get pending() {
      return queue.length;
    },
    // An event with a `key` replaces the pending one of the same key due at the same tick,
    // as DM does for the events of a square (ReDMCSB F238, see docs/026): two actuators
    // sending to the same target at the same tick make one event, the last effect wins.
    schedule(delay, run, key) {
      const event = { time: now + Math.max(0, delay), order: order++, run, key };
      const same = key === undefined ? null : queue.find((e) => e.key === key && e.time === event.time);
      if (same) {
        same.run = run;
        return;
      }
      const i = queue.findIndex((e) => e.time > event.time);
      if (i < 0) queue.push(event);
      else queue.splice(i, 0, event);
    },
    advance(ticks = 1) {
      for (let i = 0; i < ticks; i++) {
        now++;
        flush();
      }
    },
    flush,
    clear() {
      queue = [];
      now = 0;
    },
  };
}
