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

/**
 * Recipe-page budgets (PROMPT J round). Entry used to carry a 395 ms long task and leave a
 * 0.25–1.05 s teardown gap — the page mounted the instruction/ingredient trees FOUR times
 * (view + two hidden cook-mode sheets + the print duplicate), every copy running
 * marked + DOMPurify per step, and tore all four down again on leave. After the fix the page
 * mounts one copy (print mounts at idle, cook mode on demand).
 */
const RECIPE_BUDGETS = { entryContentMs: 800, entryLongTaskMs: 250, backSwapMs: 800, backLongTaskMs: 250 };

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

/**
 * Standalone (installed PWA) cold-start probe — the configuration that was invisible to every
 * measurement before 2026-08-10. The installed app cold-starts a fresh renderer per launch, so
 * module-scoped caches begin empty: pre-fix the drawer's cookbook links appeared at ~1,070ms
 * and the first cookbook tap paid skeletons until ~1,030ms with a 345ms grid-mount long task
 * (all measured over CDP on the real WebappActivity on the Fold — display-mode EMULATION does
 * not reproduce this; attach to the real installed app).
 *
 * Run over CDP as soon after a force-stopped cold launch as possible, from /g/home:
 *   await standaloneColdProbe()
 *
 * Budgets assume the persisted-warmth fix (localStorage-seeded SWR list cache + cookbook
 * store): drawer links paint once the session resolves, and a persisted-cache tap goes
 * straight to cards — a skeletons phase on a repeat visit means the persistence regressed.
 * The 400ms long-task budget is honest, not aspirational: the 64-card grid mount measures
 * ~345ms on Fold silicon; getting under the navProbe 200ms needs virtualization, out of scope.
 */
const STANDALONE_BUDGETS = { drawerLinksMs: 1200, tapCardsMs: 800, tapLongTaskMs: 400 };

export async function standaloneColdProbe({ settleMs = 3500 } = {}) {
  if (!matchMedia("(display-mode: standalone)").matches) {
    throw new Error("Not in standalone display mode — this probe must run in the INSTALLED app, not a tab.");
  }
  if (document.visibilityState !== "visible") {
    throw new Error("App is backgrounded — foreground it first.");
  }

  // Phase 1: how long until the drawer has cookbook links (persisted warmth => with first
  // paint). Reported as absolute performance.now() — time since the launch navigation started.
  const linkSelector = ".v-navigation-drawer a[href*='/cookbooks/']";
  const drawerLinksMs = await new Promise((resolve) => {
    if (document.querySelector(linkSelector)) return resolve(Math.round(performance.now()));
    const mo = new MutationObserver(() => {
      if (document.querySelector(linkSelector)) {
        mo.disconnect();
        resolve(Math.round(performance.now()));
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { mo.disconnect(); resolve(null); }, 20000);
  });

  // Phase 2: first cookbook tap — straight to cards, no skeleton phase, bounded long task.
  const link = document.querySelector(linkSelector);
  if (!link) throw new Error("No cookbook link ever appeared in the drawer.");
  const timeline = [];
  const longTasks = [];
  const tapT0 = performance.now();
  const po = new PerformanceObserver(list => longTasks.push(...list.getEntries().map(e => Math.round(e.duration))));
  po.observe({ entryTypes: ["longtask"] });
  let last = "";
  const classify = () => {
    const cards = document.querySelectorAll(".fork-tile").length;
    const skels = document.querySelectorAll(".fork-skel").length;
    const state = cards > 0 ? `cards(${cards})` : skels > 0 ? "skeletons" : "other";
    if (state !== last) { timeline.push({ t: Math.round(performance.now() - tapT0), state }); last = state; }
  };
  const mo = new MutationObserver(classify);
  mo.observe(document.body, { childList: true, subtree: true });
  classify();
  link.click();
  await new Promise(r => setTimeout(r, settleMs));
  mo.disconnect();
  po.disconnect();

  const firstCards = timeline.find(s => s.state.startsWith("cards"));
  const sawSkeletons = timeline.some(s => s.state === "skeletons");
  const worstTask = Math.max(0, ...longTasks);
  const result = {
    budgets: STANDALONE_BUDGETS,
    drawerLinksMs,
    tap: { timeline, cardsMs: firstCards?.t ?? null, sawSkeletons, worstLongTaskMs: worstTask },
    pass:
      drawerLinksMs != null && drawerLinksMs < STANDALONE_BUDGETS.drawerLinksMs
      && firstCards != null && firstCards.t < STANDALONE_BUDGETS.tapCardsMs
      && !sawSkeletons
      && worstTask < STANDALONE_BUDGETS.tapLongTaskMs,
  };
  console.table([{ drawerLinksMs, cardsMs: result.tap.cardsMs, sawSkeletons, worstLongTaskMs: worstTask, pass: result.pass }]);
  return result;
}

/**
 * Recipe-page entry + teardown probe. Run from /g/home, logged in:  await recipeProbe()
 * Measures click -> recipe hero visible (entry, with worst long task), then history.back()
 * -> grid cards visible again (the teardown gap, with worst long task). Same rules as
 * navProbe: MutationObserver classification, visible tab required.
 */
export async function recipeProbe({ recipeHref = null, settleMs = 3000 } = {}) {
  if (document.visibilityState !== "visible") {
    throw new Error("Tab is backgrounded — foreground it first.");
  }

  const href = recipeHref ?? [...document.querySelectorAll("a[href*='/r/']")].map(a => a.getAttribute("href")).find(Boolean);
  const link = href && document.querySelector(`a[href="${href}"]`);
  if (!link) {
    throw new Error("No recipe link found — run from /g/home while logged in.");
  }

  const phase = (t0) => {
    const timeline = [];
    const longTasks = [];
    let last = "";
    const classify = () => {
      const cards = document.querySelectorAll(".fork-tile").length;
      const hero = !!document.querySelector(".fork-hero-title, .fork-macros");
      const state = hero ? "recipe" : cards > 0 ? `cards(${cards})` : "other";
      if (state !== last) {
        timeline.push({ t: Math.round(performance.now() - t0), state });
        last = state;
      }
    };
    const po = new PerformanceObserver(list => longTasks.push(...list.getEntries().map(e => Math.round(e.duration))));
    po.observe({ entryTypes: ["longtask"] });
    const mo = new MutationObserver(classify);
    mo.observe(document.body, { childList: true, subtree: true });
    classify();
    return { timeline, longTasks, stop: () => { mo.disconnect(); po.disconnect(); } };
  };

  // Entry: click -> recipe hero
  let t0 = performance.now();
  const entry = phase(t0);
  link.click();
  await new Promise(r => setTimeout(r, settleMs));
  entry.stop();
  const entryContent = entry.timeline.find(s => s.state === "recipe");
  const entryWorst = Math.max(0, ...entry.longTasks);

  // Teardown: back -> grid cards
  t0 = performance.now();
  const back = phase(t0);
  history.back();
  await new Promise(r => setTimeout(r, settleMs));
  back.stop();
  const backCards = back.timeline.find(s => s.state.startsWith("cards"));
  const backWorst = Math.max(0, ...back.longTasks);

  const result = {
    budgets: RECIPE_BUDGETS,
    route: href,
    entry: { timeline: entry.timeline, contentMs: entryContent?.t ?? null, worstLongTaskMs: entryWorst },
    back: { timeline: back.timeline, cardsMs: backCards?.t ?? null, worstLongTaskMs: backWorst },
    pass:
      entryContent != null && entryContent.t < RECIPE_BUDGETS.entryContentMs
      && entryWorst < RECIPE_BUDGETS.entryLongTaskMs
      && backCards != null && backCards.t < RECIPE_BUDGETS.backSwapMs
      && backWorst < RECIPE_BUDGETS.backLongTaskMs,
  };
  console.table([
    { phase: "entry", ms: result.entry.contentMs, worstLongTask: entryWorst },
    { phase: "back", ms: result.back.cardsMs, worstLongTask: backWorst },
  ]);
  return result;
}
