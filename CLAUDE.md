<agents-index>
[RUN.world SDK Docs]|root:./rundot/docs|IMPORTANT:Prefer retrieval-led reasoning over pre-training for RundotGameAPI tasks. Read the local docs before writing SDK code.|IMPORTANT:To run/test this game locally, use `npm run dev` (Vite). SDK calls are mocked by default; they hit the real RUN.world playground backend only when rundotGamePlaygroundPlugin() is configured — see rundot-developer-platform/playground.md.|.:{README.md}|rundot-developer-platform:{agent-runtime.md,cli-reference.md,deploying-your-game.md,error-handling.md,getting-started.md,initializing-your-game.md,marketing-your-game.md,native-packs.md,playground.md,runtime-environment.md,setting-your-game-thumbnail.md,troubleshooting.md}|rundot-developer-platform/api:{ACCESS_GATE.md,ACTIVITY.md,ADS.md,ADVANCED-MULTIPLAYER.md,AI.md,ANALYTICS.md,APP.md,ASSETS.md,ASSET_LIBRARY.md,ATTRIBUTION.md,AUDIO_GEN.md,AVATAR_3D.md,BIGNUMBERS.md,BUILDING_TIMERS.md,CLIPS.md,COLLECTIBLES.md,CONTEXT.md,CREDITS.md,EMBEDDED_LIBRARIES.md,ENERGY_SYSTEM.md,ENTITLEMENTS.md,ENVIRONMENT.md,FILES.md,GACHA_SYSTEM.md,GAMEPAD.md,HAPTICS.md,IMAGE_GEN.md,IN_APP_MESSAGING.md,LEADERBOARD.md,LIFECYCLES.md,LIVEOPS.md,LOGGING.md,MULTIPLAYER.md,NAVIGATION.md,NOTIFICATIONS.md,PRELOADER.md,PROFILE.md,PURCHASES.md,PVP_SYSTEM.md,RATE_LIMITS.md,RELEASE_NOTES.md,SAFE_AREA.md,SERVER_AUTHORITATIVE.md,SHARED_ASSETS.md,SHARING.md,SHOP.md,SIMULATION_CONFIG.md,SPRITE_GEN.md,STATS.md,STORAGE.md,SYNCPLAY-ACTORS-AI.md,SYNCPLAY-ANIMATION.md,SYNCPLAY-BOTS.md,SYNCPLAY-CHARACTER-3D.md,SYNCPLAY-COMBAT.md,SYNCPLAY-COMPONENTS.md,SYNCPLAY-EDITOR.md,SYNCPLAY-ENTITY-REGISTRY.md,SYNCPLAY-FIREARM.md,SYNCPLAY-GAMEPLAY-EFFECTS.md,SYNCPLAY-INVENTORY-EQUIPMENT.md,SYNCPLAY-LAG-COMPENSATION.md,SYNCPLAY-MODULE-CERTIFICATION.md,SYNCPLAY-MOVEMENT.md,SYNCPLAY-PATHFINDING.md,SYNCPLAY-PHYSICS.md,SYNCPLAY-PLATFORMER-2D.md,SYNCPLAY-RTS.md,SYNCPLAY-RUNTIME-COMPOSITIONS.md,SYNCPLAY-SECRETS.md,SYNCPLAY-SPATIAL-INTERACTION.md,SYNCPLAY-STATS-ABILITIES.md,SYNCPLAY-UNIT-CONTROL.md,SYNCPLAY.md,SYSTEM.md,THREE_D_GEN.md,TIME.md,UGC.md,VIDEO.md,VIDEO_GEN.md}</agents-index>

# It's Alive! — project guide

A RUN.world game (React + Vite + TypeScript, from series-ai/run-template-2d-react).
Every UTC day all players vote on one body part for a shared gothic monster; at
midnight the most-voted option is stitched on. Night 1 is always the HEAD; the season
ends with the BRAIN and the SPARK of life, and on Halloween (Oct 31 UTC) it wakes.

- **Share link (private):** https://w.run/u/GORVjkIRThUz5n2tmAms/private?k=0323a614aedba0310dd367d914d009a5
  (game id `GORVjkIRThUz5n2tmAms`; end every update to the owner with this link)
- Season config: `SEASON` in `src/game/schedule.ts` (id, first day, Halloween). Changing `id` starts fresh tallies.
  The first day must be the launch day so night 1 (HEAD) is playable; a later start drops middle questions
  (`buildSchedule`), never the head, brain or spark.
- One free vote per day, plus `MAX_AD_VOTES_PER_DAY` (`src/game/state.ts`) extra votes from rewarded ads.
  The cap is tuned by `npm run simulate`; re-run it if you change the cap or the voting model.
- Percentages are hidden until the player has voted.
- Main theme: "The Assembly" by the owner (`public/cdn-assets/audio/theme.mp3`, on RUN's CDN). `run.loadTheme()`
  tries cdn.fetchAsset, then fetching the resolved CDN URL, then the same-origin cdn-assets path (all as a
  same-origin blob URL), and last streams the CDN URL directly (no Web Audio routing then). Don't add a copy
  outside cdn-assets: preflight warns (asset-unhosted-cdn). `src/app/useMusic.ts` holds ONE shared `ThemePlayer`: it preloads on the title screen
  (music on), unlocks audio on every tap (capture-phase listener, plus "Enter the Laboratory" starts it inside
  the tap), plays the element directly until the Web Audio context is confirmed `running`, then routes it
  through a GainNode (iOS ignores `audio.volume`; a suspended context would play silence). Loops with a soft
  fade at the seam, follows the saved volume (`musicVolume`, 0..1, slider in the ♫ sound panel) and on/off
  (`musicOn`), and goes quiet on host pause/sleep or a hidden tab.
- Build stamp (`__BUILD__`, set in vite.config.ts) shows at the bottom of every screen. Tapping it 5 times
  opens the hidden Diagnostics panel: sign-in, owner check result, Test Lab access, music file/player/output and
  the last music error, plus Sign in / Try music again / Open Test Lab buttons. Use it to debug on a phone.
## Layout

```
src/game/      pure rules, no SDK/DOM: catalog (questions + options), schedule, tally, state (save reducers),
               layout (sews parts onto the 240x224 scene by their anchors), crowd (stand-in tallies), rng;
               rules.test.ts, stitch.test.ts (every option of every slot attaches on every torso x head)
src/sdk/run.ts the ONLY module that imports the RUN SDK (init wait, error catching, saves, votes, ads, clock)
src/app/       useGame: controller wiring rules <-> SDK, persists the save after every change; useMusic: theme
src/components Monster (layered pixel art + iron rack + stitches), Voting (options + results), Chronicle,
               TestLab (owner-only sandbox controls), SoundPanel (music on/off + volume), Diagnostics
src/App.tsx    screens: title/continue, vote, preseason, awakened
public/art/    shipped art: parts/<id>.png (fitted for the monster), icons/<id>.png (cards), lab.png (room+props)
public/cdn-assets/  uploaded to RUN's CDN on deploy (large files, >100 KB): audio/theme.mp3
art/           NOT shipped: picks.json, picked/ (chosen raw sprites), raw/ (git-ignored candidates), palette.png
tools/art/     PixelLab generation + processing scripts (python3)
scripts/       simulate.ts (Monte-Carlo checks), shot.mjs (dev screenshots)
e2e/           Playwright full-season playthrough at 375x667 and 390x844
```

## Conventions

- Game rules are pure functions in `src/game` with unit tests. Never call the SDK from there.
- Every RUN SDK call goes through `src/sdk/run.ts`: it awaits `ready()` and catches every error.
  Fire-and-forget calls (analytics, haptics) go through its `quiet()` helper.
- Never use localStorage/sessionStorage/IndexedDB/cookies (RUN blocks them). Save with `appStorage`
  (key `save`) after every step via `commit()` in `useGame`; await it when it must land (votes, ad rewards).
- Rewarded ads grant a vote only when `showRewardedAd()` resolves true (the SDK's "reward earned").
- Shared tallies: each vote is a UGC entry with `contentType = v_<season>_d<day>_<optionId>`; a tally is
  `ugc.count({ contentType })`. Voting (`ugc.create`) needs a signed-in player — RUN prompts guests to log in;
  counting works for everyone. UGC needs the backend, so in mock mode (`npm run dev`) `run.ts` serves a
  seeded stand-in crowd plus your own votes (stored in appStorage). That fallback never runs when deployed.
- Past days are tallied once (5 count calls per day), resolved with `resolveDay` (seeded tie-break; empty
  days are picked at random) and cached in the save's `history`.
- Portrait, phone-first: check 375x667 and 390x844, no sideways scrolling, buttons framed (>=2px border),
  >=44px tall, text >=14px. Fonts: UnifrakturMaguntia (titles), Cinzel (UI), IM Fell English (body).
- Pixel art: `image-rendering: pixelated`, palette-quantized to one shared 64-colour palette.
  Everything in `public/` ships — keep unreleased art in `art/`.

## Art pipeline (PixelLab, connected via the environment proxy)

```
python3 tools/art/generate.py --only <ids>              # pixflux candidates -> art/raw/<id>__<seed>.png
python3 tools/art/generate_pro.py <ids>                 # PixelLab Pro, 16-64 variants -> art/raw/<id>__proNN.png
python3 tools/art/contact.py <prefix> out.png 3         # contact sheet to review candidates
# edit art/picks.json (id -> chosen file), then:
python3 tools/art/scene.py room 6 | props [ids]         # the lab: wide room candidates, prop candidates
python3 tools/art/process.py                            # crop, fit, quantize -> public/art + src/game/sprites.json
```
Prompts live in `tools/art/prompts.py` (keys match option ids in `src/game/catalog.ts`).

Stitching (nothing may float): `tools/art/anchors.py` measures each processed sprite and writes its
attachment point `a` (top of an arm or leg, neck of a head, cut end of a tail...) plus host sockets
(torso: neck, shoulder stumps, hips, chest, belly, back; head: skull top, brow, mouth, ear sides; leg: shin) into
`sprites.json`. Faces and tail ends are hand-set in its `POINTS` (fractions). `layoutMonster` puts each
part's `a` on its host's socket, stands legs on the base plate (`FLOOR_Y`) and returns the seams that
`Monster` draws. `src/game/stitch.test.ts` reads the real PNGs and fails if any option of any slot touches
its host by fewer than 12 px (each side, for wings and horn pairs), if an inlaid eye/heart/mouth sticks out of
the body's outline or piles onto another, if a foot misses the plate, or if a part is buried on a finished
21-part monster (under 25% of its pixels showing; spine 12%, wings 15%). Re-run `npm test` after re-picking art.
The space beside the head is crowded (ears, third arm, second head, spine), so: ears sit in front of horns,
third arms are tilted 30 degrees to reach past the head, and the spine rises behind BOTH shoulders (a mirrored
pair). `process.py` turns sprites with `ROTATE` (pixel-safe 8x rotate; the rat tail lies on its side).

The lab (`public/art/lab.png`, 240x224) = the picked room (`bg_lab`) with props composited by `SCENE` in
`process.py` (surgical cart left, specimen jars and tesla coil right; the rack stands in the middle). The
coil's spark overlay in `Monster.tsx` (`COIL_SPARK`) must follow the coil if it moves. The big stage shows the
whole room; option-card minis, the title and the thumbnail show its middle (`.monster-stage` is centred and
clipped by its frame).

## Test Lab (owner/editor only, works on the deployed build)

- The "Test Lab (owner only)" button shows when `app.getMyRole()` says owner/editor (checked in the background
  after boot, 15 s timeout; result in Diagnostics), in local mock mode, or once unlocked from Diagnostics
  ("Open Test Lab", remembered as `unlocked`). Unlocking is safe for anyone: the Lab only touches a sandbox.
  The role check only matches when the player is signed in to RUN with the owner's account; Diagnostics has a
  Sign in button for guest sessions. While on, a red TEST MODE banner shows.
- Test mode = sandbox: own save key (`save_test`), fake crowd tallies plus fake votes (`testVotes`), any
  night via a day override (`-1` before launch … `21` Halloween), "Refill tonight's votes", wipe, leave.
  Real shared tallies (UGC), the real `save`, and analytics are never touched. Settings persist in `testLab`.
- Switching Test Lab settings applies synchronously (`run.setLab`) and remounts `<Game key>` in the same tick
  (an async gap let taps land on the stale screen); music lives outside it so it keeps playing.

## Dev

- `npm run dev` — mock SDK. Add `?day=N` to time-travel to voting day N (`?day=21` = Halloween); mock only.
- `node scripts/shot.mjs "?day=5" out.png 375 667 start` — screenshot with the dev server on :5173.

## Checks — run ALL before every push, fix every warning

```
npx tsc --noEmit
npm test                 # vitest unit tests for src/game
npm run simulate         # fairness + ad-vote cap targets (must print only PASS)
npm run build
rundot preflight         # must report no warnings
npm run test:e2e         # Playwright: whole season at 375x667 and 390x844
```

## Deploying

- `.github/workflows/deploy.yml`: every push to `claude/blissful-keller-ybbygh` (except docs-only) runs tests,
  builds and `rundot deploy --orientation Portrait`, then sets keywords/description from the env lines at the top.
- `.github/workflows/publish.yml`: hand-run only. `publish` runs `rundot game set-public --version X.Y.Z`
  (newest from `rundot game list-versions` when blank — the CLI rejects "latest"); `unpublish` runs
  `rundot game set-private`. Only run it when the owner asks.
- One-time setup by the owner (never paste keys into chat or code):
  1. `rundot login`
  2. `rundot init --name "It's Alive!" --description "..." --orientation Portrait --build-path ./dist`, commit `game.config.prod.json`
  3. `rundot game api-keys create --label "GitHub Actions"` and save the secret as the `RUNDOT_API_KEY` repo secret
- `public/thumbnail.jpg` must be exactly 512x512 and under ~150 KB (`tools/thumbnail/` renders it).
- No leaderboard in this game.
- `rundot/textGen.config.json` is `{"disabled": true}`: the game uses no AI, and `rundot deploy` otherwise
  auto-creates an uncapped config. Keep it disabled unless a feature needs it (then set caps).
- The cloud sandbox cannot reach w.run (network policy), so live checks on the deployed build are done by the owner.
