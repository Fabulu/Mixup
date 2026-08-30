// Small Gamepad API navigator for native browser setup forms.

const AXIS_THRESHOLD = 0.55;
const BUTTON_A = 0;
const BUTTON_START = 9;
const BUTTON_UP = 12;
const BUTTON_DOWN = 13;
const BUTTON_LEFT = 14;
const BUTTON_RIGHT = 15;

function buttonDown(pad, index) {
  const button = pad?.buttons?.[index];
  return Boolean(button && (button.pressed || button.value > 0.5));
}

/** Normalize one connected pad into the setup actions this menu consumes. */
export function gamepadMenuState(pad, threshold = AXIS_THRESHOLD) {
  const x = Number(pad?.axes?.[0]) || 0;
  const y = Number(pad?.axes?.[1]) || 0;
  return Object.freeze({
    up: buttonDown(pad, BUTTON_UP) || y < -threshold,
    down: buttonDown(pad, BUTTON_DOWN) || y > threshold,
    left: buttonDown(pad, BUTTON_LEFT) || x < -threshold,
    right: buttonDown(pad, BUTTON_RIGHT) || x > threshold,
    accept: buttonDown(pad, BUTTON_A),
    start: buttonDown(pad, BUTTON_START),
  });
}

function menuItems(root) {
  return [...root.querySelectorAll('button, select, input, [tabindex]')].filter((item) =>
    !item.disabled && item.getAttribute('aria-disabled') !== 'true'
      && !item.hidden && !item.closest('[hidden]') && item.tabIndex >= 0
      && (typeof item.getClientRects !== 'function' || item.getClientRects().length > 0));
}

function changeSelect(select, direction) {
  const options = [...select.options].filter((option) => !option.disabled);
  const current = options.findIndex((option) => option.value === select.value);
  if (current < 0 || options.length < 2) return false;
  const next = Math.max(0, Math.min(options.length - 1, current + direction));
  if (next === current) return false;
  select.value = options[next].value;
  select.dispatchEvent(new Event('input', { bubbles: true }));
  select.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

function focusRelative(root, direction) {
  const items = menuItems(root);
  if (!items.length) return false;
  const active = root.ownerDocument.activeElement;
  const current = items.indexOf(active);
  const index = current < 0 ? 0
    : Math.max(0, Math.min(items.length - 1, current + direction));
  items[index].focus({ preventScroll: false });
  return true;
}

function firstPad(view) {
  const pads = view.navigator?.getGamepads?.() ?? [];
  return [...pads].find((pad) => pad?.connected !== false) ?? null;
}

/**
 * Let a standard gamepad operate ordinary buttons and selects without replacing
 * their native keyboard, pointer, focus, or accessibility behavior.
 */
export function attachGamepadMenu(root, options = {}) {
  if (!root?.querySelectorAll || !root.ownerDocument) return () => {};
  const view = root.ownerDocument.defaultView ?? globalThis;
  if (typeof view.requestAnimationFrame !== 'function') return () => {};
  const active = options.active ?? (() => !root.hidden);
  const primary = options.primary ?? (() => null);
  let previous = gamepadMenuState(null);
  let request = 0;
  let stopped = false;

  const edge = (state, name) => state[name] && !previous[name];
  const frame = () => {
    if (stopped) return;
    const enabled = active() && !root.ownerDocument.hidden;
    const state = enabled ? gamepadMenuState(firstPad(view)) : gamepadMenuState(null);
    if (enabled) {
      const focused = root.contains(root.ownerDocument.activeElement)
        ? root.ownerDocument.activeElement : null;
      if (edge(state, 'left')) {
        if (focused?.tagName !== 'SELECT' || !changeSelect(focused, -1)) {
          focusRelative(root, -1);
        }
      } else if (edge(state, 'right')) {
        if (focused?.tagName !== 'SELECT' || !changeSelect(focused, 1)) {
          focusRelative(root, 1);
        }
      } else if (edge(state, 'up')) {
        focusRelative(root, -1);
      } else if (edge(state, 'down')) {
        focusRelative(root, 1);
      } else if (edge(state, 'accept')) {
        const target = focused ?? menuItems(root)[0];
        if (target?.tagName === 'SELECT') changeSelect(target, 1);
        else target?.click?.();
      } else if (edge(state, 'start')) {
        primary()?.click?.();
      }
    }
    previous = state;
    request = view.requestAnimationFrame(frame);
  };
  request = view.requestAnimationFrame(frame);
  return () => {
    stopped = true;
    if (request) view.cancelAnimationFrame?.(request);
  };
}
