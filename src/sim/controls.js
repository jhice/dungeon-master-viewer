// Keyboard -> simulation commands, by KeyboardEvent.code (physical key), so the
// same keys work in QWERTY and AZERTY. Left hand (WASD + QE), right hand
// (arrows) and numeric keypad (docs/012-simulation.md § 5).
// Phase A: instant movement. Held keys repeat at most every REPEAT_MS.

export const KEY_COMMANDS = {
  KeyW: 'forward',
  KeyS: 'back',
  KeyA: 'left',
  KeyD: 'right',
  KeyQ: 'turnLeft',
  KeyE: 'turnRight',
  ArrowUp: 'forward',
  ArrowDown: 'back',
  ArrowLeft: 'turnLeft',
  ArrowRight: 'turnRight',
  Numpad5: 'forward',
  Numpad2: 'back',
  Numpad1: 'left',
  Numpad3: 'right',
  Numpad4: 'turnLeft',
  Numpad6: 'turnRight',
};

const REPEAT_MS = 160;

/**
 * Resolves a key event to an action, or undefined if the key is not a movement key.
 * @param {(command: string) => void} onCommand
 */
export function createControls(onCommand) {
  let last = 0;
  return (event) => {
    const command = KEY_COMMANDS[event.code];
    if (!command) return undefined;
    return () => {
      const now = performance.now();
      if (event.repeat && now - last < REPEAT_MS) return;
      last = now;
      onCommand(command);
    };
  };
}
