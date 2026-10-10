<agents-index>
[RUN.world SDK Docs]|root:./rundot/docs|IMPORTANT:Prefer retrieval-led reasoning over pre-training for RundotGameAPI tasks. Read the local docs before writing SDK code.|IMPORTANT:To run/test this game locally, use `npm run dev` (Vite). SDK calls are mocked by default; they hit the real RUN.world playground backend only when rundotGamePlaygroundPlugin() is configured — see rundot-developer-platform/playground.md.|.:{README.md}|rundot-developer-platform:{agent-runtime.md,cli-reference.md,deploying-your-game.md,error-handling.md,getting-started.md,initializing-your-game.md,marketing-your-game.md,native-packs.md,playground.md,runtime-environment.md,setting-your-game-thumbnail.md,troubleshooting.md}|rundot-developer-platform/api:{ACCESS_GATE.md,ACTIVITY.md,ADS.md,ADVANCED-MULTIPLAYER.md,AI.md,ANALYTICS.md,APP.md,ASSETS.md,ASSET_LIBRARY.md,ATTRIBUTION.md,AUDIO_GEN.md,AVATAR_3D.md,BIGNUMBERS.md,BUILDING_TIMERS.md,CLIPS.md,COLLECTIBLES.md,CONTEXT.md,CREDITS.md,EMBEDDED_LIBRARIES.md,ENERGY_SYSTEM.md,ENTITLEMENTS.md,ENVIRONMENT.md,FILES.md,GACHA_SYSTEM.md,GAMEPAD.md,HAPTICS.md,IMAGE_GEN.md,IN_APP_MESSAGING.md,LEADERBOARD.md,LIFECYCLES.md,LIVEOPS.md,LOGGING.md,MULTIPLAYER.md,NAVIGATION.md,NOTIFICATIONS.md,PRELOADER.md,PROFILE.md,PURCHASES.md,PVP_SYSTEM.md,RATE_LIMITS.md,RELEASE_NOTES.md,SAFE_AREA.md,SERVER_AUTHORITATIVE.md,SHARED_ASSETS.md,SHARING.md,SHOP.md,SIMULATION_CONFIG.md,SPRITE_GEN.md,STATS.md,STORAGE.md,SYNCPLAY-ACTORS-AI.md,SYNCPLAY-ANIMATION.md,SYNCPLAY-BOTS.md,SYNCPLAY-CHARACTER-3D.md,SYNCPLAY-COMBAT.md,SYNCPLAY-COMPONENTS.md,SYNCPLAY-EDITOR.md,SYNCPLAY-ENTITY-REGISTRY.md,SYNCPLAY-FIREARM.md,SYNCPLAY-GAMEPLAY-EFFECTS.md,SYNCPLAY-INVENTORY-EQUIPMENT.md,SYNCPLAY-LAG-COMPENSATION.md,SYNCPLAY-MODULE-CERTIFICATION.md,SYNCPLAY-MOVEMENT.md,SYNCPLAY-PATHFINDING.md,SYNCPLAY-PHYSICS.md,SYNCPLAY-PLATFORMER-2D.md,SYNCPLAY-RTS.md,SYNCPLAY-RUNTIME-COMPOSITIONS.md,SYNCPLAY-SECRETS.md,SYNCPLAY-SPATIAL-INTERACTION.md,SYNCPLAY-STATS-ABILITIES.md,SYNCPLAY-UNIT-CONTROL.md,SYNCPLAY.md,SYSTEM.md,THREE_D_GEN.md,TIME.md,UGC.md,VIDEO.md,VIDEO_GEN.md}</agents-index>

# It's Alive! — project guide

A RUN.world game (React + Vite + TypeScript, from series-ai/run-template-2d-react).
The monster starts as a whole human husk standing in the lab. Every UTC day all players vote
on one body part; at midnight the most-voted option is painted into the husk. Night 1 is always
the HEAD; the season ends with the BRAIN and the SPARK of life, and on Halloween (Oct 31 UTC) it wakes.

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
               layout (which husk pieces + painted layers to draw, back to front), crowd (stand-in tallies),
               rng; rules.test.ts, stitch.test.ts (every layer exists, joins its body, shows on a full monster)
src/sdk/run.ts the ONLY module that imports the RUN SDK (init wait, error catching, saves, votes, ads, clock)
src/app/       useGame: controller wiring rules <-> SDK, persists the save after every change; useMusic: theme
src/components Monster (the husk in the lab with its painted layers), Voting (options + results), Chronicle,
               TestLab (owner-only sandbox controls), SoundPanel (music on/off + volume), Diagnostics
src/App.tsx    screens: title/continue, vote, preseason, awakened
public/art/    shipped art: husk/<region>.png, parts/<key>.png (painted layers, also the card art),
               icons/spark_*.png (the spark is an effect), lab.png (room with its props painted in)
public/cdn-assets/  uploaded to RUN's CDN on deploy (large files, >100 KB): audio/theme.mp3
art/           NOT shipped: picks.json, picked/ (chosen scene-sized paintings, husk.png, bg_lab.png),
               raw/ (git-ignored candidates)
tools/art/     husk.py (inpaint/edit parts into the husk), process.py (layers), pixellab.py, prompts.py
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
- Pixel art: `image-rendering: pixelated`, palette-quantized (all monster layers share one 256-colour palette;
  96 was too few for 300+ layers and turned the croc grey).
  Everything in `public/` ships — keep unreleased art in `art/`.

## The monster: one husk with parts painted into it (PixelLab, connected via the environment proxy)

Night 1 (and before launch) shows a whole human husk (`art/picked/husk.png`) standing in the lab. Every
part is PAINTED INTO that body by PixelLab, never pasted on as a separate sprite, so all parts share the
husk's scale, pose, outline and light, and sit on the same neck, shoulders, waist and floor:
- One coordinate system: the 224x200 lab scene, husk at `HUSK_AT` (60, 26), feet on `FLOOR_Y` 192.
  `husk.py regions()` splits the husk into head / torso / loincloth / armR / armL / legR / legL.
  `mask_for(slot)` says where each slot may paint (a head may grow above the neck, an arm outward, etc.).
- The six big parts (head, torso, arms, legs) are Pro inpaints (`/inpaint-v3`, ~9 generations each) of
  the husk region. The loincloth is never replaced: it ties the waist together.
- Add-ons that sit on a chosen part (third eye, horns, ears, jaw, brain on each HEAD; chest eye, heart,
  belly mouth, second head on each TORSO; hide on each right LEG) are made with `edit-images-v2`: one job
  (~10 generations) paints an option onto all 5 bases; `added()` keeps only the new/clearly changed pixels
  inside the slot mask, so the base keeps its own colours. Their layer key is `<option>@<base>`.
- Behind-the-body parts (wings, spine, tail, third arm) are Pro inpaints around the husk, drawn behind it.
- The cheap `/inpaint` (1 generation) was tried and is too weak for add-ons (lost horns, no third eye).
- Shapes that fill a box to its edges get an oval painting area (`OVAL`); a fin that would hide behind
  the head keeps clear of it (`KEEP_CLEAR`); chest eyes are mirrored to the other pectoral (`MIRROR`,
  the edit model puts them where the heart goes). Faint generator pixels are dropped (`solid`).
- Nothing floats, by construction: `process.py rooted()` keeps only the pieces of a layer that touch
  what it grows from (its base part, the shoulder for a second head, the body for the rest).
- An add-on keeps only pixels that are really new (`only_new`, `STRONG`): where it lies on its base it
  must differ clearly from the base, otherwise it is the edit model re-rendering the base (greyer croc).
- Draw order (`Z` in husk.py and layout.ts, keep them equal): heart over chest eye and mouth; third eye
  over brain over horns (their layers carry a little redrawn skull); spine over the third arm.

```
python3 tools/art/husk.py gen <slot> [ids] [--seed=7,21] [--par=4]     # Pro inpaints -> art/raw/<key>__iN.png
python3 tools/art/husk.py edit <slot> [ids] [--seed=7]                 # add-on on all 5 bases -> __eN.png
python3 tools/art/husk.py sheet <prefix,...> out.png x0,y0,x1,y1        # review candidates in place
# set art/picks.json (key -> raw file), then:
python3 tools/art/process.py [--partial]     # cut, crop, quantize -> public/art + src/game/layers.json
```
Option descriptions live in `tools/art/prompts.py` (`PARTS`); slot wording in `TEMPLATES` / `EDITS`.
`layout.ts` mirrors husk.py's `Z` (draw order) and `BASE_OF` (which add-ons are painted per base).
`src/game/stitch.test.ts` reads the real PNGs and fails if a layer is missing for any option x base, a
head/arm/leg/torso does not meet its neighbours, an add-on does not touch its base, a behind part is not
rooted in the body, a foot misses the floor, or a part is buried on a finished monster.

The lab (`public/art/lab.png`, 224x200) is one painting: room `bg_lab__s14` (upright blood-stained
operating slab behind the husk) with the surgical cart and the generator INPAINTED onto its floor, so
the props share its perspective. Never composite props onto the room: they float.

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
