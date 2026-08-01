# Mealie Fork — HANDOFF

**Repo:** `Tsuji-Hub/mealie` (fork of `mealie-recipes/mealie`)
**Branch:** `mealie-next` (upstream's default — kept, so syncing stays trivial)
**Image:** `ghcr.io/tsuji-hub/mealie:nightly`
**Deployed:** CT 100, Portainer stack `mealie` (id 4), `192.168.5.85:9925`

Same model as Makimono: own the code so "I wish it had X" becomes a thing you just do.

---

## Why this fork exists

Ethan is migrating ~300 recipes off ReciMe. ReciMe has two structural failures: **search indexes the title only** (searching `Worcestershire` returns 0 results) and **there is no nutrition field anywhere in its data model**. Mealie has both. See `CLAUDE OUTPUTS/Self-hosted/Self-hosted_Mealie-Spike-Results_v1.md`.

**The discipline that keeps this cheap:**

- **Upstream the generic.** Calorie sorting, the `recipeYield "0.0"` bug — these are broadly useful. If merged, you carry them forever at zero cost.
- **Fork-carry the opinionated.** Macro-first UI, MacroFactor-shaped exports, the FDL import pipeline. Upstream would never take these, and they're the reason the fork exists.

Keep fork-only patches small and rebasable. That's the lesson Makimono already taught (*"hashes rewritten on every upstream sync"*).

---

## The fork patches (what diverges from upstream, and why)

Upstream's CI is built for upstream. **None of it works on a fork out of the box.** Four separate things had to be fixed:

### 1. `nightly.yml` — the silent killer

```yaml
if: github.repository == 'mealie-recipes/mealie'   # upstream
```

The publish job was **hard-gated to the upstream repo**. On a fork it's skipped, the run goes **green**, and no image is ever built. Repointed to `Tsuji-Hub/mealie`.

Also added `workflow_dispatch` so you can kick a build from the Actions tab without an empty commit.

### 2. `publish.yml` — Depot.dev

Upstream builds via **Depot.dev** (a paid build service, project `srzjb6mhzm`). A fork has no token. Swapped for stock `docker/setup-buildx-action` + `docker/build-push-action`, with GHA layer caching.

### 3. `publish.yml` — Docker Hub

Upstream pushes to **`hkotel/mealie`** — the maintainer's namespace. Permission denied on a fork. Removed; we push to GHCR only.

The `DOCKERHUB_*` secrets are still **declared but unused**, so the other callers (`release.yml`, `pull-requests.yml`) don't blow up on an undefined secret. Minimal diff.

### 4. `publish.yml` — GHCR requires lowercase

`github.repository` is **`Tsuji-Hub/mealie`** — capitals. GHCR rejects uppercase image names (`repository name must be lowercase`). The name is now lowercased explicitly:

```yaml
- id: repo
  run: echo "name=${GITHUB_REPOSITORY,,}" >> "$GITHUB_OUTPUT"
```

Also dropped `linux/arm64` — CT 100 is x86, and arm64 was doubling build time for an architecture we don't run.

---

## Build + deploy loop

1. Commit to `mealie-next`, push.
2. `nightly.yml` runs tests, builds, pushes `ghcr.io/tsuji-hub/mealie:nightly`.
3. Pull it on CT 100 — Portainer stack `mealie`, "Update the stack" with re-pull enabled.

**One-time GitHub setup (both are required):**

- **Actions are DISABLED on forks by default.** Actions tab → *"I understand my workflows, go ahead and enable them."* Until you click this, nothing runs.
- **The GHCR package is private by default.** After the first successful build: Profile → Packages → `mealie` → Package settings → change visibility, or grant CT 100 a read token. Otherwise `docker pull` gets a 403.

---

## Syncing with upstream

```bash
git fetch upstream
git merge upstream/mealie-next      # or rebase, but merge is safer with a modified CI
```

**Expect conflicts in `.github/workflows/`** — that's where all our divergence lives, and upstream touches it. Everything else should merge clean until we start changing app code.

The repo was cloned with `--filter=blob:none` (partial clone) to survive a slow network. It behaves normally; blobs fetch on demand. `git fetch --unshallow` isn't needed — it isn't shallow, just blobless.

---

## Live deployment

| | |
|---|---|
| Stack | `mealie`, Portainer id **4**, standalone — **`servarr` is not touched** |
| DB | SQLite (spike-grade; revisit if it gets slow) |
| Data | `/docker/mealie` on CT 100 — already covered by vzdump (`/docker` has `backup=1`) |
| Port | `9925` -> 9000 |
| `BASE_URL` | `https://justicerecipes.duckdns.org` — **baked into the schema.org image + canonical URLs.** Must match the real public hostname or MacroFactor imports break. |

**Currently still running the upstream image** (`ghcr.io/mealie-recipes/mealie:latest`, v3.20.1). Repoint to `ghcr.io/tsuji-hub/mealie:nightly` once the first fork build is green.

---

## Known issues / first candidate changes

**`recipeYield` emits `"0.0 4 servings"`.** Mealie concatenates a zero yield-*quantity* with the yield *text*. If MacroFactor parses servings out of that, **per-serving macros come out wrong** — which is the entire point of the workflow. Set `recipe_yield_quantity` properly on import; consider a display fix upstream.

**Calorie sort is API-only.** `orderBy=nutrition.calories` works (verified: asc/desc genuinely reorder). But:
- The UI sort menu offers only: Alphabetical · Rating · Created · Updated · Last Made · Random
- The recipe **list** endpoint returns **no `nutrition` key at all**, so you can sort by calories but not *display* them without an N+1 fetch

**First real change (exercises the whole pipeline on something you actually want):**
1. `mealie/schema/recipe/recipe.py` — add `nutrition` to `RecipeSummary` (it's on `Recipe` at line ~185, absent from the summary)
2. `frontend/app/components/Domain/Recipe/RecipeCardSection.vue` — add a `Calories` entry to `EVENTS` + the sort menu (the six existing options are around lines 46–86)

Both are generic and worth a PR upstream, not fork-carry.

**Untested lead, 5 minutes, might make the UI change unnecessary:** `RecipeCardSection.vue` does `props.query?.orderBy || preferences.value.orderBy`. A bookmarkable **`?orderBy=nutrition.calories`** URL may pass straight through to the API with zero code.

---

## Homelab landmines (from the spike brief — still apply)

- **Cluster firewall trap:** the datacenter firewall is OFF, but CT 100's and Caddy's NICs have `firewall=1` with **no rules**. Enabling the datacenter firewall would DROP-block them and take the stack down. Harden inside the guest. Do not "helpfully" turn it on.
- **LXC mountpoint backup trap:** LXC mountpoints default to `backup=0` and are silently excluded from vzdump. This already bit CT 100's `/docker` once. We reused `/docker` (already `backup=1`), so Mealie's data is covered — but any *new* volume needs the flag set.

---

## Shipped log

*(one paragraph max per change — keep this file a working doc, not an archive)*

- **2026-07-12 — fork bootstrapped, and the whole loop is closed.** Cloned, `upstream` wired, CI rewritten to actually build on a fork (repo gate, Depot, Docker Hub, GHCR lowercase). First build green in 27 min; CT 100 now runs `ghcr.io/tsuji-hub/mealie:nightly` (sha `7d4008c23b07`, amd64). Caddy vhost `recipes.justicemedia.duckdns.org` live with valid TLS, and **Gate A passes over the public internet on our own build** — 6/6 ingredients + nutrition in the server-rendered JSON-LD. No app code changed yet.

- **2026-07-14 — calories on the list, and the lesson that shaped everything after.** `nutrition` added to `RecipeSummary` so cards can show kcal without an N+1. First attempt used a `RecipeCardSummary` subclass to avoid loading nutrition on nested summaries; it **dropped nutrition from `/api/recipes` in prod** (`40db8ca1`, reverted in `a981ba4b`). The verified shape is nutrition on the base class + `selectinload` in `loader_options`, accepting one batched query per row on nested summaries. Rule that came out of it and still holds: **no blind backend changes** — either verify locally or make the failure mode boring. Upstreamed the generic half as PR #7881.

- **2026-07-14/15 — the redesign, in fork-owned components.** Rejected two theme-only rounds ("still old and blocky, cards square, tags no color"); landed a soft/rounded editorial direction. ReciMe/Makimono-style **2-up image tiles** (`RecipeCard.vue`) with corner badges — category pill left, calories right, in a flex top row (absolute positioning collided on narrow cards), plus time and servings. Hero **macro bar** (`RecipePageMacroBar.vue`): "Macros for 1 {unit}" / "Makes N {yield}" over four hairline-divided cells, because "208" was reading as the whole batch. Includes the `IE_SINGULARS` set (cookie/brownie/pie…) checked *before* `ies→y` — without it the Dessert import ships "Macros for 1 Cooky" — and an `extras.servingUnit` escape hatch. Share is Web Share API, **URL-only, never `text`**: iOS maps both to competing UIActivityViewController items and MacroFactor's link field lands empty. Gate B (MacroFactor import) passes.

- **2026-07-15 — cookbooks: live counts, quick-file, and the unfile vanish.** Cookbook counts are computed server-side as **N scalar subqueries in ONE select** (`count_by_cookbooks`), mirroring `page_all` so `QueryFilterBuilder` stays the only interpreter of a filter string; `.distinct()` is load-bearing (joins duplicate rows → silent overcount). Stitched onto `get_all` inside try/except so a bad filter degrades to no counts, never a 500. `RecipeCardCategoryMenu` is the one additive read-modify-write and is **reused everywhere via its activator slot** — a second implementation is where a destructive overwrite creeps back in. Chip renamed to "Cookbooks" by binding the existing `cookbook.cookbooks` locale key: a bulk rename of "categor" matches 32 strings and would have put "Require All Cookbooks" inside the cookbook editor. Unfiling vanishes the card, decided by the page from server-parsed `queryFilter.parts` matched on `recipe_category.name` (`.id` finds nothing and, because the predicate fails safe, would have silently never fired).

- **2026-07-15 — the fail-safe guard lesson, now pinned.** The vanish shipped dead: a `recipeCount == null` guard looked reasonable but `recipeCount` is only stitched onto the LIST route, so on the cookbook page (`getOne`) it is always null. Fixed by **deleting the condition, not stitching the symptom** (`3897b923`). Then `3269e5f0` extracted `isScopedByCategory` to a pure `(cookbook, category) => boolean` — it had closed over the page's `book` ref, so nothing could reach it, so nothing could contradict it — and pinned it with 14 tests, verified **both directions** (re-adding the guard turns the named regression test red). Every early return now `console.debug`s which branch declined. The pattern, twice in one day: **fail-safe guards fail silently** — right for user data, terrible as a debugging surface.

- **2026-08-01 — rating made discoverable, and possible on touch (`144b4d68`).** 271 recipes, daily use, zero ratings — two stacked gates hid the feature. The interactive stars were hover-revealed (`userRating || isHovering || !ratingsLoaded`), invisible on desktop and mouseenter-dependent (≈impossible) on the PWA; and the fork's only live rating surface (`RecipePageHero`) mounted RecipeRating `v-if="recipe.rating"`, so at 0 ratings the control never existed anywhere — the live probe caught that second gate after the component fix surfaced nothing. Now: own group always renders the interactive row (empty accent stars ARE the affordance), public views get an explicitly `readonly` group row, hero mounts it when `isOwnGroup || recipe.rating`. `clearable`, same-value-clears, and the `hideGroupRating` stale-fallback guard preserved and pinned. First real Vuetify mount tests in the fork (7) — `server.deps.inline: ["vuetify"]` in vitest.config.js is the unlock.

- **2026-07-17/18 — the TikTok transcription hotfixes, ported (`dddd4dde`).** yt-dlp answers "Unsupported URL" for TikTok's `/photo/` slideshow form while the `/video/` form of the same post id downloads its audio fine, so `_ytdlp_url()` now resolves short links and swaps the form **keeping the handle** (the handle-less `/@/video/` rebuild is oEmbed-verified only); the pure transform lives in `scraper/tiktok.py` beside the oEmbed rules so the two paths can't drift. That fix exposed a worse one: a slideshow whose audio is only the backing song transcribes to song lyrics, the model returns a Recipe named after the caption with zero ingredients and zero steps, and the strategy logged it as a *success* and saved it — now `_is_empty_recipe` declines it so remaining strategies run. Guard deliberately NOT added to `RecipeScraperOpenAI` (different empty-shape semantics through the recipe_scrapers parse; unverified). 12 new tests, both DB engines green, published.
