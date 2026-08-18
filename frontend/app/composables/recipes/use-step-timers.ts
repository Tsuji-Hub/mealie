/**
 * Step timers: detect durations in instruction text ("simmer 15 minutes") and run one-tap
 * countdown timers against them. Same philosophy as the note scaler — display-time text
 * parsing, the DB is never touched, nothing persists, no API writes.
 *
 * Engine rules (each one is a known bug class):
 * - Countdown is TIMESTAMP-based: a running timer stores its target epoch and every render
 *   derives the remainder. Never decrement a counter on an interval — background tabs
 *   throttle timers to ~1/min and a decremented count drifts by however long the tab slept.
 * - `visibilitychange` re-derives immediately; a timer that expired while the tab was hidden
 *   fires its done state on return, and the strip shows how long ago it actually finished.
 * - Timers are per-recipe-session state keyed by slug: they survive the view↔cook-mode
 *   transition (separate component instances since the cook sheets went v-if) and die when
 *   the recipe page unmounts (clearStepTimers in RecipePage's onUnmounted).
 * - Timers do NOT scale with the ¼/½/2× chips — half a batch does not simmer for half the
 *   time. The written duration is always used; the two features never exchange data.
 */

export interface StepDuration {
  /** The matched text exactly as written ("10-15 minutes") — the chip's idle label. */
  label: string;
  /** Timer seconds. Ranges use the LOWER bound: set short and check early — you can always
   * add time; you cannot un-overcook. */
  seconds: number;
}

const UNIT_SECONDS: Record<string, number> = {
  hour: 3600, hours: 3600, hr: 3600, hrs: 3600,
  minute: 60, minutes: 60, min: 60, mins: 60,
  second: 1, seconds: 1, sec: 1, secs: 1,
};

const UNIT = "(hours?|hrs?|minutes?|mins?|seconds?|secs?)";
const NUM = "(\\d+(?:\\.\\d+)?)";
// A time unit is REQUIRED ("350 F", "step 3", "5 cloves", "Season 03" never match), and the
// number must not be glued to a word/path ("0304" in "Season 0304" via prefix guard).
const COMPOUND_RE = new RegExp(`(^|[^\\w./])${NUM}\\s*(hours?|hrs?)(?:\\s+and)?\\s+${NUM}\\s*(minutes?|mins?)\\b`, "gi");
const RANGE_RE = new RegExp(`(^|[^\\w./])${NUM}\\s*(?:-|–|—|to\\s)\\s*${NUM}\\s*${UNIT}\\b`, "gi");
const SINGLE_RE = new RegExp(`(^|[^\\w./])${NUM}\\s*${UNIT}\\b`, "gi");

const MAX_SECONDS = 24 * 3600;

function unitSeconds(unit: string): number {
  return UNIT_SECONDS[unit.toLowerCase()] ?? 0;
}

/** All durations in one step's text, in order. Pure; memoize at the call site (computed). */
export function findStepDurations(text: string): StepDuration[] {
  if (!text) {
    return [];
  }

  type Span = { start: number; end: number; label: string; seconds: number };
  const spans: Span[] = [];
  const overlaps = (start: number, end: number) => spans.some(s => start < s.end && end > s.start);

  // Compound first ("1 hour 30 minutes"), then ranges, then singles — later passes skip
  // anything inside an earlier span, so "30 minutes" is not double-counted.
  for (const m of text.matchAll(COMPOUND_RE)) {
    const start = m.index! + m[1]!.length;
    const seconds = parseFloat(m[2]!) * unitSeconds(m[3]!) + parseFloat(m[4]!) * unitSeconds(m[5]!);
    spans.push({ start, end: m.index! + m[0].length, label: m[0].slice(m[1]!.length), seconds });
  }
  for (const m of text.matchAll(RANGE_RE)) {
    const start = m.index! + m[1]!.length;
    const end = m.index! + m[0].length;
    if (overlaps(start, end)) {
      continue;
    }
    const seconds = Math.min(parseFloat(m[2]!), parseFloat(m[3]!)) * unitSeconds(m[4]!);
    spans.push({ start, end, label: m[0].slice(m[1]!.length), seconds });
  }
  for (const m of text.matchAll(SINGLE_RE)) {
    const start = m.index! + m[1]!.length;
    const end = m.index! + m[0].length;
    if (overlaps(start, end)) {
      continue;
    }
    spans.push({ start, end, label: m[0].slice(m[1]!.length), seconds: parseFloat(m[2]!) * unitSeconds(m[3]!) });
  }

  return spans
    .filter(s => s.seconds > 0 && s.seconds <= MAX_SECONDS)
    .sort((a, b) => a.start - b.start)
    .map(s => ({ label: s.label, seconds: Math.round(s.seconds) }));
}

/** ============================================================= */

export interface StepTimer {
  /** `${slug}:${stepIndex}:${durationIndex}` — one timer per chip. */
  id: string;
  slug: string;
  stepIndex: number;
  label: string;
  durationMs: number;
  /** Epoch ms when a RUNNING timer fires. Null while paused/done. */
  targetAt: number | null;
  /** Authoritative remainder while PAUSED. */
  remainingMs: number;
  state: "running" | "paused" | "done";
  /** Epoch ms the timer actually hit zero (may be while the tab was hidden). */
  finishedAt: number | null;
}

const timers = ref<StepTimer[]>([]);
const now = ref(Date.now());
let ticker: ReturnType<typeof setInterval> | null = null;
let listenerInstalled = false;

function settle() {
  now.value = Date.now();
  for (const timer of timers.value) {
    if (timer.state === "running" && timer.targetAt !== null && timer.targetAt <= now.value) {
      timer.state = "done";
      timer.finishedAt = timer.targetAt;
      timer.targetAt = null;
      timer.remainingMs = 0;
      chime();
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate([200, 100, 200, 100, 400]);
      }
    }
  }
  syncTicker();
}

function syncTicker() {
  const anyRunning = timers.value.some(t => t.state === "running");
  if (anyRunning && !ticker) {
    ticker = setInterval(settle, 500);
  }
  else if (!anyRunning && ticker) {
    clearInterval(ticker);
    ticker = null;
  }
}

function installVisibilityListener() {
  if (listenerInstalled || typeof document === "undefined") {
    return;
  }
  listenerInstalled = true;
  // Re-derive the moment the tab comes back: a throttled background tab may not have ticked
  // for minutes, and any timer that expired meanwhile fires its done state right here.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      settle();
    }
  });
}

export function useStepTimers() {
  installVisibilityListener();

  function startTimer(slug: string, stepIndex: number, durationIndex: number, duration: StepDuration) {
    unlockAudio(); // inside the tap gesture — after this, the done-chime is allowed to sound
    const id = `${slug}:${stepIndex}:${durationIndex}`;
    timers.value = timers.value.filter(t => t.id !== id);
    timers.value.push({
      id,
      slug,
      stepIndex,
      label: duration.label,
      durationMs: duration.seconds * 1000,
      targetAt: Date.now() + duration.seconds * 1000,
      remainingMs: duration.seconds * 1000,
      state: "running",
      finishedAt: null,
    });
    settle();
  }

  function togglePause(id: string) {
    const timer = timers.value.find(t => t.id === id);
    if (!timer) {
      return;
    }
    if (timer.state === "running" && timer.targetAt !== null) {
      timer.remainingMs = Math.max(0, timer.targetAt - Date.now());
      timer.targetAt = null;
      timer.state = "paused";
    }
    else if (timer.state === "paused") {
      timer.targetAt = Date.now() + timer.remainingMs;
      timer.state = "running";
    }
    settle();
  }

  function cancelTimer(id: string) {
    timers.value = timers.value.filter(t => t.id !== id);
    syncTicker();
  }

  function timerFor(slug: string, stepIndex: number, durationIndex: number): StepTimer | undefined {
    return timers.value.find(t => t.id === `${slug}:${stepIndex}:${durationIndex}`);
  }

  const timersForSlug = (slug: string) => computed(() => timers.value.filter(t => t.slug === slug));

  return { timers, now, startTimer, togglePause, cancelTimer, timerFor, timersForSlug };
}

/** Kill a recipe's timers — called from RecipePage's unmount. Session state only, by design. */
export function clearStepTimers(slug: string) {
  timers.value = timers.value.filter(t => t.slug !== slug);
  syncTicker();
}

export function remainingMs(timer: StepTimer, nowMs: number): number {
  if (timer.state === "running" && timer.targetAt !== null) {
    return Math.max(0, timer.targetAt - nowMs);
  }
  return timer.remainingMs;
}

export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** "finished 3m ago" for a timer that expired while the tab was hidden. */
export function finishedAgo(timer: StepTimer, nowMs: number): string {
  if (timer.finishedAt === null) {
    return "";
  }
  const seconds = Math.max(0, Math.round((nowMs - timer.finishedAt) / 1000));
  if (seconds < 60) {
    return "just now";
  }
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes}m ago` : `${Math.floor(minutes / 60)}h ${minutes % 60}m ago`;
}

/** ============================================================= */

// WebAudio chime — an oscillator, not an audio asset. The AudioContext is created inside the
// user's start-timer tap (autoplay policy: a context created outside a gesture stays
// suspended and the done-chime would be silent).
let audioCtx: AudioContext | null = null;

function unlockAudio() {
  if (typeof window === "undefined" || !("AudioContext" in window)) {
    return;
  }
  try {
    audioCtx = audioCtx ?? new AudioContext();
    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }
  }
  catch { /* no audio is not an error */ }
}

function chime() {
  if (!audioCtx || audioCtx.state !== "running") {
    return;
  }
  try {
    const t0 = audioCtx.currentTime;
    const notes: [number, number][] = [[880, 0], [1318.5, 0.18], [880, 0.5], [1318.5, 0.68]];
    for (const [frequency, at] of notes) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, t0 + at);
      gain.gain.exponentialRampToValueAtTime(0.3, t0 + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.16);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t0 + at);
      osc.stop(t0 + at + 0.2);
    }
  }
  catch { /* no audio is not an error */ }
}
