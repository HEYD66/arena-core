'use strict';
// Electron's native preferred-size event already includes page zoom, in logical
// window units. Never multiply it by devicePixelRatio or display.scaleFactor.
// No extension DOM/CSS modification, injected script or renderer IPC is needed.
const GAP = 12;
const ROUNDING_PAD = 2;
const ROUNDING_TOLERANCE = 3;
const MAX_WIDTH = 800;
const MAX_HEIGHT = 600;
const HORIZONTAL_SCROLLBAR_ALLOWANCE = 18;
const HOST_SCALE_MIN = 0.65;
const HOST_SCALE_MAX = 1.5;
const ZOOM_EPSILON = 0.01;
const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
const validSize = value => value && positive(value.width) && positive(value.height);
const validArea = value => validSize(value) && Number.isFinite(value.x) && Number.isFinite(value.y);
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

function extensionWindowOptions(kind) {
  if (kind === 'popup') return {
    width: 360, height: 480, minWidth: 160, minHeight: 100,
    useContentSize: true, resizable: true
  };
  if (kind === 'options') return { width: 760, height: 640, minWidth: 420, minHeight: 360, resizable: true };
  throw new Error('无效的扩展界面');
}

function popupContentSize(preferred, frame = {}, area) {
  if (!validSize(preferred)) return null;
  const frameWidth = Math.max(0, Number.isFinite(frame.width) ? frame.width : 0);
  const frameHeight = Math.max(0, Number.isFinite(frame.height) ? frame.height : 0);
  const maxWidth = validArea(area) ? Math.max(1, Math.min(MAX_WIDTH, Math.floor(area.width - GAP * 2 - frameWidth))) : MAX_WIDTH;
  const maxHeight = validArea(area) ? Math.max(1, Math.min(MAX_HEIGHT, Math.floor(area.height - GAP * 2 - frameHeight))) : MAX_HEIGHT;
  const requestedWidth = Math.ceil(preferred.width + ROUNDING_PAD);
  const requestedHeight = Math.ceil(preferred.height + ROUNDING_PAD + (requestedWidth > maxWidth ? HORIZONTAL_SCROLLBAR_ALLOWANCE : 0));
  return {
    width: clamp(requestedWidth, Math.min(160, maxWidth), maxWidth),
    height: clamp(requestedHeight, Math.min(80, maxHeight), maxHeight)
  };
}

function popupPosition(bounds, area) {
  if (!validArea(area)) return { x: bounds.x, y: bounds.y };
  const gapX = Math.min(GAP, Math.max(0, (area.width - bounds.width) / 2));
  const gapY = Math.min(GAP, Math.max(0, (area.height - bounds.height) / 2));
  const left = area.x + gapX, top = area.y + gapY;
  return {
    x: Math.round(clamp(bounds.x, left, Math.max(left, area.x + area.width - gapX - bounds.width))),
    y: Math.round(clamp(bounds.y, top, Math.max(top, area.y + area.height - gapY - bounds.height)))
  };
}

function attachPopupSizing(win, screen, { host = null, initialWait = 300, debounceMs = 24 } = {}) {
  const contents = win.webContents;
  let preferred = null, pending = null, disposed = false, manual = false;
  let displayKey = '', readyTimer, resolveReady, positioning = false;
  let hostBase = null, hostAnchor = null, appliedHostScale = 1;
  const ready = new Promise(resolve => { resolveReady = resolve; });
  const listeners = [];
  const on = (target, name, listener) => {
    if (!target?.on) return;
    target.on(name, listener); listeners.push([target, name, listener]);
  };
  const settle = () => { clearTimeout(readyTimer); resolveReady(); };
  const alive = () => !disposed && !win.isDestroyed() && !contents.isDestroyed();
  const display = () => {
    try { return screen?.getDisplayMatching(win.getBounds()) || null; } catch { return null; }
  };
  const key = value => value ? JSON.stringify([value.id, value.workArea, value.scaleFactor]) : '';
  const boundsOf = target => {
    try { return target?.getBounds?.() || null; } catch { return null; }
  };
  const hostState = () => {
    if (!host || host.isDestroyed?.()) return null;
    const bounds = boundsOf(host);
    if (!validArea(bounds)) return null;
    // Use the native outer bounds for the ratio. BrowserWindow content bounds
    // can change once while a hidden parent is attached, even when the user
    // has not resized it; outer bounds stay stable and represent the user's
    // actual application window size.
    return { bounds, content: { width: bounds.width, height: bounds.height } };
  };
  const captureHostAnchor = () => {
    const state = hostState(), popup = boundsOf(win);
    if (!state || !validArea(popup)) return;
    if (!hostBase) hostBase = { ...state.content };
    if (!hostAnchor) hostAnchor = {
      x: (popup.x - state.bounds.x) / Math.max(1, state.bounds.width),
      y: (popup.y - state.bounds.y) / Math.max(1, state.bounds.height)
    };
  };
  const hostScale = () => {
    const state = hostState();
    if (!state) return 1;
    if (!hostBase) hostBase = { ...state.content };
    const widthRatio = state.content.width / Math.max(1, hostBase.width);
    const heightRatio = state.content.height / Math.max(1, hostBase.height);
    return clamp(Math.min(widthRatio, heightRatio), HOST_SCALE_MIN, HOST_SCALE_MAX);
  };
  const applyHostZoom = scale => {
    if (!host || typeof contents.getZoomFactor !== 'function' || typeof contents.setZoomFactor !== 'function') {
      appliedHostScale = scale;
      return;
    }
    try {
      const current = Number(contents.getZoomFactor());
      const userZoom = positive(current) ? current / Math.max(ZOOM_EPSILON, appliedHostScale) : 1;
      const wanted = clamp(userZoom * scale, 0.25, 5);
      if (Math.abs(current - wanted) > ZOOM_EPSILON) contents.setZoomFactor(wanted);
      appliedHostScale = scale;
    } catch { /* Some test/embedded webContents do not expose zoom controls. */ }
  };

  function apply() {
    if (!alive() || win.isMaximized?.() || win.isFullScreen?.() || win.isMinimized?.()) return;
    try {
      captureHostAnchor();
      const scale = hostScale();
      if (!manual) applyHostZoom(scale);
      const current = win.getBounds(), content = win.getContentSize(), monitor = display();
      displayKey = key(monitor);
      if (!manual) {
        const wanted = popupContentSize(preferred || { width: 360, height: 480 }, {
          width: current.width - content[0], height: current.height - content[1]
        }, monitor?.workArea);
        if (wanted) {
          // Account for Windows fractional-DPI rounding without chasing a 1–2 DIP
          // oscillation. A genuinely undersized client area still gets expanded.
          const tooSmall = preferred && (content[0] < Math.min(preferred.width, wanted.width) || content[1] < Math.min(preferred.height, wanted.height));
          if (tooSmall || Math.abs(content[0] - wanted.width) > ROUNDING_TOLERANCE || Math.abs(content[1] - wanted.height) > ROUNDING_TOLERANCE) {
            win.setContentSize(wanted.width, wanted.height);
          }
        }
      }
      const resized = win.getBounds();
      let position = resized;
      const state = hostState();
      if (state && hostAnchor) {
        position = { ...resized,
          x: Math.round(state.bounds.x + hostAnchor.x * state.bounds.width),
          y: Math.round(state.bounds.y + hostAnchor.y * state.bounds.height)
        };
      }
      position = { ...position, ...popupPosition(position, monitor?.workArea) };
      if (position.x !== resized.x || position.y !== resized.y) {
        positioning = true;
        try { win.setPosition(position.x, position.y); } finally { positioning = false; }
      }
    } catch { /* A missing/closing native view must not prevent the popup opening. */ }
  }
  function schedule() {
    if (disposed || pending !== null) return;
    pending = setTimeout(() => {
      pending = null; apply();
      if (preferred) settle();
    }, debounceMs);
  }
  function dispose() {
    if (disposed) return;
    disposed = true; clearTimeout(pending); pending = null; settle();
    for (const [target, name, listener] of listeners) target.removeListener(name, listener);
    listeners.length = 0;
  }
  on(contents, 'preferred-size-changed', (_event, size) => {
    if (!validSize(size)) return;
    preferred = { width: size.width, height: size.height }; schedule();
  });
  on(contents, 'did-finish-load', schedule);
  // Only interactive OS resizing emits will-resize; our setContentSize does not.
  // Let the user keep an intentional manual size for this window's lifetime.
  on(win, 'will-resize', () => { manual = true; clearTimeout(pending); pending = null; settle(); });
  on(win, 'move', () => {
    if (!alive() || positioning) return;
    if (host) captureHostAnchor();
    if (key(display()) !== displayKey) schedule();
  });
  for (const event of ['restore', 'unmaximize', 'leave-full-screen']) on(win, event, schedule);
  on(screen, 'display-metrics-changed', schedule);
  on(screen, 'display-removed', schedule);
  for (const event of ['resize', 'move', 'restore', 'unmaximize', 'leave-full-screen', 'maximize', 'enter-full-screen']) on(host, event, schedule);
  on(host, 'closed', dispose);
  on(win, 'closed', dispose);
  on(contents, 'destroyed', dispose);
  readyTimer = setTimeout(() => { apply(); settle(); }, initialWait);
  apply(); // Ensure even an empty/failing page's fallback window fits the screen.
  return { ready, dispose };
}
module.exports = { extensionWindowOptions, popupContentSize, popupPosition, attachPopupSizing };
