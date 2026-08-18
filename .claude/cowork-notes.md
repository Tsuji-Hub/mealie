# Cowork notes — PROMPTS N + O shipped back-to-back (both awaiting your acceptance)

# PROMPT N — cook mode round: `daa8b9e4` (fractions/wake-lock) + `7ca3dab8` (step timers)

CI: commit 1's own run shows "cancelled" — that is cancel-in-progress when commit 2 pushed,
not a failure; the combined run for `7ca3dab8` went green through Build Tagged Release /
publish and is the image to deploy.

## Commit 1 findings
- Odd sixteenths render ascii (`1/16`, `3/16`, `1 3/16`); even ones reduce to the vulgar
  table. Below 1/16 with a tsp unit, quantity + tsp word collapse to `pinch` (single values
  only; ranges keep numbers; non-tsp keeps the decimal fallback).
- **Wake-lock verified, ZERO code changed:** WakelockSwitch stays MOUNTED in cook mode (its
  container is v-show), default preference `lockScreen: true`, and VueUse re-acquires after
  visibilitychange (confirmed from installed source). Nothing standalone-gated. If on-device
  acceptance fails, check the "screen awake" toggle first — a persisted false preference is
  the only path to a dropped lock.

## Commit 2 — step timers, what matters for verification
- Number + REQUIRED time unit; compound = one timer; ranges time the LOWER bound, label as
  written. Negatives pinned: `350 F`, `step 3`, `5 cloves`, `Season 03`, `minsteel`.
- Timestamp-based: target epoch + derived remainder — background throttling cannot drift
  it; expired-while-hidden fires done on return with "finished Xm ago" (tested across a
  simulated 10-minute gap).
- State module-keyed by slug: survives view↔cook (verified live, chips + bottom strip),
  dies on RecipePage unmount (verified live). No persistence, no API writes.
- Chips render AFTER each step's text block (SafeMarkdown v-html can't host live
  components inline — deliberate deviation, acceptance semantics unchanged). All taps
  @click.stop (the step card's click checks steps off). Timers ignore the scale chips.
- Done = gold pulse + oscillator chime (AudioContext created in the start tap) + vibrate.

## N acceptance (BROWSER TAB — Ethan is off the installed PWA)
1. `1/4 tsp` at ¼ → `1/16 tsp`; `⅛ tsp` at ½ → `1/16 tsp`; at ¼ → `pinch`.
2. Cook mode holds the screen awake (toggle on) through a background/foreground cycle.
3. "15 minutes" step → chip → countdown; two concurrent; strip shows both in cook mode;
   pause + cancel from chip and strip.
4. Background 2+ min mid-countdown → return → time correct; expired shows "Xm ago".
5. Done → chime + vibrate + gold pulse; "350 F"/"step N" produce zero chips library-wide.
6. sha256 unchanged: recipes_ingredients AND recipes_instructions.

---

# PROMPT O — Send to AnyList (fork side): `837e1f4d`

## Deploy order (your half first)
1. Bridge: kevdliu's anylist server standalone on CT 100, pinned 172.18.0.32 on
   servarr_servarrnetwork (external), LAN-only — no Caddy route, no published port. Ethan
   pastes AnyList EMAIL/PASSWORD into the stack env via Portainer himself; credentials
   never transit chat and never enter the fork.
2. Mealie stack env: `ANYLIST_BRIDGE_URL=http://172.18.0.32:<port>`.
3. Deploy the fork image (CI watch was running at handoff — verify publish first).

## What shipped
- **Backend proxy** (`controller_anylist.py`): authenticated household routes; browser
  never touches the bridge. Env unset → 404 (the frontend probe's "not configured" signal,
  distinct from 502 "bridge unreachable"). Send fans out server-side (ThreadPool ×4, 3s/8s
  timeouts), per-item ok/error; all-unreachable collapses to one 502. `/lists` normalizes
  plain names AND `{name}` objects. Errors attributable by design: "bridge unreachable" vs
  "AnyList rejected (status)" — a future protocol breakage is a five-minute diagnosis.
- **Frontend:** idle-time availability probe (once per session, off the launch path) gates
  a "Send to AnyList" button in the macro-bar row — zero residue when disabled. Sheet =
  every ingredient line AS CURRENTLY SCALED, verbatim (no clever splitting), all
  pre-checked, per-line uncheck, list picker with localStorage last-used, failures stay
  visible and Retry sends ONLY those. resetAnyList wired into clearComposableCaches.

## Verified locally end-to-end (fake bridge speaking the real API)
Sauce at ½ → sheet showed all 8 lines exactly as the ingredient list renders them; one
unchecked; send → 7 items arrived at the bridge with `list: "Groceries"`; toast
`7 items → Groceries`; last-used persisted. My in-page fetch to the bridge was
CORS-blocked — the architecture doing its job (only the backend reaches it). 7 backend
route tests (success/partial/down/disabled/auth/validation), 3 sheet tests, 301 frontend
tests, ruff (CI scope) + mypy + full build green.

## O acceptance (after both deploys)
1. `GET /api/households/anylist/lists` (Ethan's token) returns his real lists via Mealie.
2. Garlic-parm at ½ → sheet shows scaled strings → send 3 checked → they appear in the
   AnyList app on the shared list.
3. Tick one off in AnyList → nothing breaks (we only add).
4. Bridge container stopped → clean "bridge unreachable", no hang; env unset → button
   never renders.
5. recipes_ingredients sha256 unchanged.

NOTE for your bridge compose: the fork POSTs `{name, list}` to `/add` and GETs `/lists`.
If your bridge version wants different shapes, tell me and I adjust the proxy — 10 minutes
by design.
