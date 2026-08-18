import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  clearStepTimers,
  findStepDurations,
  finishedAgo,
  formatClock,
  remainingMs,
  useStepTimers,
} from "./use-step-timers";

describe("findStepDurations — the parser table", () => {
  test("plain durations in every supported unit", () => {
    expect(findStepDurations("Simmer 15 minutes, stirring.")).toEqual([{ label: "15 minutes", seconds: 900 }]);
    expect(findStepDurations("Microwave 45 sec")).toEqual([{ label: "45 sec", seconds: 45 }]);
    expect(findStepDurations("Proof 1 hour in a warm spot")).toEqual([{ label: "1 hour", seconds: 3600 }]);
    expect(findStepDurations("Rest 10 min")).toEqual([{ label: "10 min", seconds: 600 }]);
    expect(findStepDurations("Blanch 30 seconds")).toEqual([{ label: "30 seconds", seconds: 30 }]);
  });

  test("compound '1 hour 30 minutes' is ONE timer, not two", () => {
    expect(findStepDurations("Braise 1 hour 30 minutes covered")).toEqual([
      { label: "1 hour 30 minutes", seconds: 5400 },
    ]);
    expect(findStepDurations("Slow cook 2 hrs and 15 mins")).toEqual([
      { label: "2 hrs and 15 mins", seconds: 8100 },
    ]);
  });

  test("ranges keep their written label but time the LOWER bound", () => {
    expect(findStepDurations("Simmer 10-15 minutes")).toEqual([{ label: "10-15 minutes", seconds: 600 }]);
    expect(findStepDurations("Bake 10 to 15 minutes")).toEqual([{ label: "10 to 15 minutes", seconds: 600 }]);
    expect(findStepDurations("Sear 45-60 seconds per side")).toEqual([{ label: "45-60 seconds", seconds: 45 }]);
  });

  test("a time UNIT is required — the brief's negative table", () => {
    expect(findStepDurations("Preheat the oven to 350 F")).toEqual([]);
    expect(findStepDurations("Repeat step 3 with the second batch")).toEqual([]);
    expect(findStepDurations("Add 5 cloves garlic")).toEqual([]);
    expect(findStepDurations("Season 03 of prep continues")).toEqual([]);
    expect(findStepDurations("")).toEqual([]);
  });

  test("multiple independent durations in one step, in order", () => {
    const found = findStepDurations("Boil 8 minutes, drain, then bake 20 minutes.");
    expect(found).toEqual([
      { label: "8 minutes", seconds: 480 },
      { label: "20 minutes", seconds: 1200 },
    ]);
  });

  test("decimals and word boundaries", () => {
    expect(findStepDurations("Ferment 1.5 hours")).toEqual([{ label: "1.5 hours", seconds: 5400 }]);
    // "mins" inside a longer word must not match
    expect(findStepDurations("Use the 5 minsteel pan")).toEqual([]);
  });
});

describe("timer engine — timestamp math, not counters", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-18T18:00:00Z"));
  });

  afterEach(() => {
    clearStepTimers("test-recipe");
    vi.useRealTimers();
  });

  const duration = { label: "15 minutes", seconds: 900 };

  test("a 10-minute BACKGROUND GAP does not drift the countdown", () => {
    const { startTimer, timerFor, now } = useStepTimers();
    startTimer("test-recipe", 2, 0, duration);
    const timer = timerFor("test-recipe", 2, 0)!;

    // Simulate a throttled background tab: 10 minutes pass with NO ticks delivered.
    vi.setSystemTime(new Date("2026-08-18T18:10:00Z"));
    // visibilitychange handler path: settle() re-derives from the timestamp
    document.dispatchEvent(new Event("visibilitychange"));
    now.value = Date.now();

    expect(remainingMs(timer, Date.now())).toBe(5 * 60 * 1000); // exactly 5:00 left — no drift
    expect(formatClock(remainingMs(timer, Date.now()))).toBe("05:00");
  });

  test("expired while hidden -> done on return, with how long ago it finished", () => {
    const { startTimer, timerFor } = useStepTimers();
    startTimer("test-recipe", 1, 0, { label: "2 minutes", seconds: 120 });

    // Tab hidden for 10 minutes; the timer expired 8 minutes ago.
    vi.setSystemTime(new Date("2026-08-18T18:10:00Z"));
    document.dispatchEvent(new Event("visibilitychange"));

    const timer = timerFor("test-recipe", 1, 0)!;
    expect(timer.state).toBe("done");
    expect(finishedAgo(timer, Date.now())).toBe("8m ago");
  });

  test("pause stores the remainder; resume re-anchors the target epoch", () => {
    const { startTimer, togglePause, timerFor } = useStepTimers();
    startTimer("test-recipe", 0, 0, duration);
    const timer = timerFor("test-recipe", 0, 0)!;

    vi.setSystemTime(new Date("2026-08-18T18:05:00Z"));
    togglePause(timer.id); // pause at 10:00 remaining
    expect(timer.state).toBe("paused");
    expect(remainingMs(timer, Date.now())).toBe(10 * 60 * 1000);

    // An hour passes paused — remainder must not move.
    vi.setSystemTime(new Date("2026-08-18T19:05:00Z"));
    expect(remainingMs(timer, Date.now())).toBe(10 * 60 * 1000);

    togglePause(timer.id); // resume
    expect(timer.state).toBe("running");
    vi.setSystemTime(new Date("2026-08-18T19:06:00Z"));
    expect(remainingMs(timer, Date.now())).toBe(9 * 60 * 1000);
  });

  test("cancel removes; clearStepTimers kills only the given recipe's timers", () => {
    const { startTimer, cancelTimer, timerFor, timersForSlug } = useStepTimers();
    startTimer("test-recipe", 0, 0, duration);
    startTimer("test-recipe", 3, 0, duration);
    startTimer("other-recipe", 0, 0, duration);

    cancelTimer("test-recipe:0:0");
    expect(timerFor("test-recipe", 0, 0)).toBeUndefined();
    expect(timersForSlug("test-recipe").value).toHaveLength(1);

    clearStepTimers("test-recipe");
    expect(timersForSlug("test-recipe").value).toHaveLength(0);
    expect(timersForSlug("other-recipe").value).toHaveLength(1);
    clearStepTimers("other-recipe");
  });
});

describe("formatClock", () => {
  test("MM:SS under an hour, H:MM:SS above", () => {
    expect(formatClock(75 * 1000)).toBe("01:15");
    expect(formatClock(5400 * 1000)).toBe("1:30:00");
    expect(formatClock(0)).toBe("00:00");
  });
});
