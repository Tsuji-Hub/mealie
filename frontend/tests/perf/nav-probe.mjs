/**
 * Navigation performance probe — the frame-classifying click→first-card measurement used for
 * every perf fix in this fork, committed so budgets are checked instead of remembered.
 *
 * HOW TO RUN
 *   In a browser (console or CDP Runtime.evaluate — works over adb on the real phone):
 *     1. Load the app at /g/home, logged in as the real user.
 *     2. Paste this file's contents, then:  await navProbe()
 *   It clears the service worker FIRST and reloads once — measuring without that measures the
 *   previous deploy (this exact mistake has cost hours three separate times).
 *
 * RULES BAKED IN (each one bought with lost time)
 *   - MutationObserver classification, never setTimeout polling: timer starvation during chunk
 *     eval hides whole phases and reports false blanks.
 *   - Frames classify as cards / skeletons / previous-page / TRULY-BLANK: during a transition
 *     the old page legitimately stays painted, and counting only cards+skeletons calls that a
 *     blank when it isn't.
 *   - A backgrounded tab never fires the lazy image loader; visibilityState must be "visible"
 *     or every card looks broken.
 *
 * BUDGETS (from the 2026-08 perf round; fail = investigate, not tune the budget)
 *   skeletons or cards visible  <  300 ms after click
 *   cards (warm/kept-alive)     <  800 ms after click
 *   longest main-thread task    <  200 ms during the transition
 *   TRULY-BLANK frames          =  0
 */

const BUDGETS = { firstPaintMs: 300, cardsMs: 800, longTaskMs: 200 };

export async function navProbe({ routes = null, settleMs = 2500 } = {}) {
  if (document.visibilityState !== "visible") {
    throw new Error("Tab is backgrounded — lazy image loading and rAF are suspended; foreground it first.");
  }

  // Fresh bundle, or the numbers describe the previous deploy.
  const regs = await navigator.serviceWorker.getRegistrations();
  if (regs.length) {
    for (const r of regs) await r.update();
  }

  const targets = routes
    ?? [...new Set([...document.querySelectorAll("a[href*='/cookbooks/']")].map(a => a.getAttribute("href")))].slice(0, 3);
  if (!targets.length) {
    throw new Error("No cookbook links found — run from /g/home while logged in.");
  }

  const results = [];
  for (const href of targets) {
    const link = document.querySelector(`a[href="${href}"]`);
    if (!link) continue;

    const timeline = [];
    const longTasks = [];
    const t0 = performance.now();

    const po = new PerformanceObserver(list => longTasks.push(...list.getEntries().map(e => Math.round(e.duration))));
    po.observe({ entryTypes: ["longtask"] });

    let last = "";
    const classify = () => {
      const cards = document.querySelectorAll(".fork-tile").length;
      const skels = document.querySelectorAll(".fork-skel").length;
      const prev = !!document.querySelector(".fork-macros, .fork-hero-title");
      const state = cards > 0 ? `cards(${cards})` : skels > 0 ? "skeletons" : prev ? "previous-page" : "TRULY-BLANK";
      if (state !== last) {
        timeline.push({ t: Math.round(performance.now() - t0), state });
        last = state;
      }
    };
    const mo = new MutationObserver(classify);
    mo.observe(document.body, { childList: true, subtree: true });
    classify();
    link.click();

    await new Promise(r => setTimeout(r, settleMs));
    mo.disconnect();
    po.disconnect();

    const firstContent = timeline.find(s => s.state.startsWith("cards") || s.state === "skeletons");
    const firstCards = timeline.find(s => s.state.startsWith("cards"));
    const worstTask = Math.max(0, ...longTasks);
    const blanks = timeline.filter(s => s.state === "TRULY-BLANK").length;

    results.push({
      route: href,
      timeline,
      firstPaintMs: firstContent?.t ?? null,
      cardsMs: firstCards?.t ?? null,
      worstLongTaskMs: worstTask,
      blankFrames: blanks,
      pass:
        blanks === 0
        && firstContent != null && firstContent.t < BUDGETS.firstPaintMs
        && firstCards != null && firstCards.t < BUDGETS.cardsMs
        && worstTask < BUDGETS.longTaskMs,
    });

    history.back();
    await new Promise(r => setTimeout(r, 1200));
  }

  const failed = results.filter(r => !r.pass);

  console.table(results.map(({ route, firstPaintMs, cardsMs, worstLongTaskMs, blankFrames, pass }) =>
    ({ route, firstPaintMs, cardsMs, worstLongTaskMs, blankFrames, pass })));
  return { budgets: BUDGETS, results, pass: failed.length === 0 };
}
