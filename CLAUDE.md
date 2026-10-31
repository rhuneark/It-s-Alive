<agents-index>
[RUN.world SDK Docs]|root:./rundot/docs|IMPORTANT:Prefer retrieval-led reasoning over pre-training for RundotGameAPI tasks. Read the local docs before writing SDK code.|IMPORTANT:To run/test this game locally, use `npm run dev` (Vite). SDK calls are mocked by default; they hit the real RUN.world playground backend only when rundotGamePlaygroundPlugin() is configured — see rundot-developer-platform/playground.md.|.:{README.md}|rundot-developer-platform:{agent-runtime.md,cli-reference.md,deploying-your-game.md,error-handling.md,getting-started.md,initializing-your-game.md,marketing-your-game.md,native-packs.md,playground.md,runtime-environment.md,setting-your-game-thumbnail.md,troubleshooting.md}|rundot-developer-platform/api:{ACCESS_GATE.md,ACTIVITY.md,ADS.md,ADVANCED-MULTIPLAYER.md,AI.md,ANALYTICS.md,APP.md,ASSETS.md,ASSET_LIBRARY.md,ATTRIBUTION.md,AUDIO_GEN.md,AVATAR_3D.md,BIGNUMBERS.md,BUILDING_TIMERS.md,CLIPS.md,COLLECTIBLES.md,CONTEXT.md,CREDITS.md,EMBEDDED_LIBRARIES.md,ENERGY_SYSTEM.md,ENTITLEMENTS.md,ENVIRONMENT.md,FILES.md,GACHA_SYSTEM.md,GAMEPAD.md,HAPTICS.md,IMAGE_GEN.md,IN_APP_MESSAGING.md,LEADERBOARD.md,LIFECYCLES.md,LIVEOPS.md,LOGGING.md,MULTIPLAYER.md,NAVIGATION.md,NOTIFICATIONS.md,PRELOADER.md,PROFILE.md,PURCHASES.md,PVP_SYSTEM.md,RATE_LIMITS.md,RELEASE_NOTES.md,SAFE_AREA.md,SERVER_AUTHORITATIVE.md,SHARED_ASSETS.md,SHARING.md,SHOP.md,SIMULATION_CONFIG.md,SPRITE_GEN.md,STATS.md,STORAGE.md,SYNCPLAY-ACTORS-AI.md,SYNCPLAY-ANIMATION.md,SYNCPLAY-BOTS.md,SYNCPLAY-CHARACTER-3D.md,SYNCPLAY-COMBAT.md,SYNCPLAY-COMPONENTS.md,SYNCPLAY-EDITOR.md,SYNCPLAY-ENTITY-REGISTRY.md,SYNCPLAY-FIREARM.md,SYNCPLAY-GAMEPLAY-EFFECTS.md,SYNCPLAY-INVENTORY-EQUIPMENT.md,SYNCPLAY-LAG-COMPENSATION.md,SYNCPLAY-MODULE-CERTIFICATION.md,SYNCPLAY-MOVEMENT.md,SYNCPLAY-PATHFINDING.md,SYNCPLAY-PHYSICS.md,SYNCPLAY-PLATFORMER-2D.md,SYNCPLAY-RTS.md,SYNCPLAY-RUNTIME-COMPOSITIONS.md,SYNCPLAY-SECRETS.md,SYNCPLAY-SPATIAL-INTERACTION.md,SYNCPLAY-STATS-ABILITIES.md,SYNCPLAY-UNIT-CONTROL.md,SYNCPLAY.md,SYSTEM.md,THREE_D_GEN.md,TIME.md,UGC.md,VIDEO.md,VIDEO_GEN.md}</agents-index>

# It's Alive! — project guide

A RUN.world game (React + Vite + TypeScript, from series-ai/run-template-2d-react).
The monster starts as a whole human husk standing in the lab. Every day all players vote on one
body part; at midnight US Central time (`DAY_TIME_ZONE`, America/Chicago) the most-voted option is
painted into the husk. Night 1 is always the HEAD; the season ends with the BRAIN and the SPARK of life,
and at midnight Central that begins Halloween (Oct 31) it wakes. The whole 2026 season is in CDT
(UTC-5), so every day is 24 h and starts at 05:00 UTC (rules.test.ts checks every boundary).
The 2026 season (id `s2026b`) starts Oct 11: 19 parts voted Oct 11-29, then the VIGIL on Oct 30
(`VIGIL_DAYS` = 1, always the last day before Halloween: no vote, the finished creature waits with a
countdown; phase `vigil` in schedule.ts, `Vigil` screen in App.tsx). `seasonSchedule()` builds the nights;
with fewer nights than parts `buildSchedule` drops from `DROP_ORDER` (this season: the jaw). An Oct 10
trial run used id `s2026`; a new season id starts fresh tallies and saves, but `parseSave` carries over
the player's music settings, Sketchbook and "started". Once the season is live, never reorder the parts
already played (rules.test.ts pins the opening nights); only later nights may change. If the clock ever
moves back mid-season, `parseSave` drops cached results of days open again and `rollToDay` gives back a
day's vote from `myPicks`, so nobody votes twice on a night.

From Halloween on it is a different game: THE RAMPAGE. The creature everyone built breaks out of the
laboratory and stomps through a new place every day, hole.io-style, in 60-second runs; it grows as it
smashes, its parts wake one by one with powers during a run, and every midnight it grows for good by
everything the whole community smashed that day. It runs on with no end date (the city goes on).

- **Share link (private):** https://w.run/u/GORVjkIRThUz5n2tmAms/private?k=0323a614aedba0310dd367d914d009a5
  (game id `GORVjkIRThUz5n2tmAms`; end every update to the owner with this link)
- The owner also works from a LOCAL CLONE of this branch (README "Work on it from your computer") and
  pushes from it. Before starting work and again before pushing, `git pull origin claude/blissful-keller-ybbygh`
  (merge, never rebase or force-push over their commits).
- Season config: `SEASON` in `src/game/schedule.ts` (id, first day, Halloween). Changing `id` starts fresh tallies.
  The first day must be the launch day so night 1 (HEAD) is playable; a later start drops middle questions
  (`buildSchedule`), never the head, brain or spark.
- One free vote per day; a player on a STREAK (voted the night before: `stats.lastVotedDay === day - 1`)
  gets `RETURN_BONUS_VOTES` = 1 more that night (`bonusVotes` in the save, set by `rollToDay`; vote kind
  `bonus`); skip a night and it is gone until they vote again. It is announced by a slim ribbon
  (`BonusBanner`, "Streak bonus! +1 vote tonight", not a card) on the title and vote screens until it is
  used, and after voting the "tomorrow" line says the streak earns +1 vote tomorrow. Plus
  `MAX_AD_VOTES_PER_DAY` = 2 extra votes from rewarded ads (the owner's choices, `src/game/state.ts`).
  `npm run simulate` checks a maxed-out player (bonus + ads) flips at most 15% of 100-voter days
  (1 + 2 extra: 14.7%, counting ordinary voters without a bonus); re-run it if you change any cap.
- Percentages are hidden until the player has voted.
- Sketchbook (every screen, every player): a private sandbox to try any option for any part and see the
  creature it makes. Nothing in it is a vote. Rules in `src/game/sketch.ts`; the design is kept in the save
  (`sketch`, saved 800 ms after the last change) and "My votes" rebuilds the monster from `myPicks`
  (night -> the player's latest pick, recorded by `recordVote`) plus the real winners of nights they skipped.
  An add-on without its base part (horns with no chosen head) is not drawn: `layoutMonster` skips it.
- Main theme: "The Assembly" by the owner (`public/cdn-assets/audio/theme.mp3`, on RUN's CDN). `run.loadTheme()`
  tries cdn.fetchAsset, then fetching the resolved CDN URL, then the same-origin cdn-assets path (all as a
  same-origin blob URL), and last streams the CDN URL directly (no Web Audio routing then). Don't add a copy
  outside cdn-assets: preflight warns (asset-unhosted-cdn). `src/app/useMusic.ts` holds ONE shared `ThemePlayer`: it preloads on the title screen
  (music on), unlocks audio on every tap (capture-phase listener, plus "Enter the Laboratory" starts it inside
  the tap), plays the element directly until the Web Audio context is confirmed `running`, then routes it
  through a GainNode (iOS ignores `audio.volume`; a suspended context would play silence). Loops with a soft
  fade at the seam, follows the saved volume (`musicVolume`, 0..1, slider in the ♫ sound panel) and on/off
  (`musicOn`), and goes quiet on host pause/sleep or a hidden tab.
- Title screen (until Halloween): the real creature so far, a "Tonight" card (night N, tonight's part,
  countdown, whether you voted, streak), then only Enter/Continue, the October Jam vote button,
  Sketchbook and a music row (on/off + volume, `MusicBar`); touching the music row starts the theme there.
- The vigil (Oct 30) has a STORM (`app/useStorm.ts`, timing `stormGap` in awakening.ts): lightning strikes
  at random, more often as midnight nears (7-12 s apart with 6 h left, down to 1.2-2 s in the last
  minute); each strike draws a bolt in the lab's window behind the creature (`StormStrike` in
  Monster.tsx, clipped to `WINDOW`), lights the room, flashes the page (`.storm-flash`), jolts the
  creature (Web Animations) and rolls thunder (near strikes sooner and louder). Rain falls behind the
  page (`.storm-rain`; `.app` sits above it). Two flickers per strike, strikes ≥ 1.2 s apart: under
  3 flashes a second. Nothing strikes for reduced-motion players.
- From Halloween the title AND the in-game hub are one screen, `RampageMenu` (App.tsx): `LooseScene`
  (canvas: the community's creature looming over the night village of the day's place, bigger the
  taller the community made it, lightning in its spark colour; the first time a player sees it, the
  BREAKOUT plays there: the laboratory tower shakes, bursts, the creature rises, IT'S LOOSE!, then
  `markBrokeOut`), "Loose in <place>" and its blurb, the big glowing "Rampage! ⚡" (`.btn-rampage`), the
  `RampageCard` (rampage day, place, height in ft, growth last night, countdown to the next growth,
  everyone's rubble today, your best), the jam button, "Watch it wake again", Sketchbook and the music
  row. The scene is not mounted while the waking scene or a run covers the menu (`covered`), so the
  breakout is never played unseen. The lore panel shows to
  first-time players only. In game the ♫ button opens the same controls.
- October Jam vote button (`JamButton`, owner's request; glowing pumpkin-to-violet `.btn-jam`): a link to
  `JAM_VOTE_URL` (useGame.ts, from `rundot jam promo`). Games cannot open outside pages: RUN's frame is
  sandboxed `allow-scripts allow-downloads` (no popups, no top navigation), so `window.open` fails preflight
  (critical `sandbox-blocked-modals`, which blocks the deploy) and `target="_blank"` is blocked too. A tap
  copies the link (`run.copyText`, clipboard is allowed) and a toast says to paste it in a browser; the
  href still serves a long-press / right-click "open in new tab". Remove it when jam voting closes.
- Coming back: the first thing a returning player sees after a stitching is the Reveal (`src/game/reveal.ts`,
  `components/Reveal.tsx`): the new part glowing on the creature, the winner's share, how their own pick
  placed, and missed nights. `seenNight` in the save marks what was shown; a first visit marks every closed
  night seen (no reveal). After voting, the vote screen says what comes tomorrow (and the streak vote).
- Daily reminders: tapping Continue/Enter, opening the Sketchbook, or voting arms them (`armReminders` in
  useGame): `reminderPlan()` (`src/game/reminders.ts`) gives one local notification a day at 6 pm Central
  naming that night's part ("Night 5: the third eye" and the question; "Your streak bonus vote is waiting too"
  only on a night the bonus is certain: tonight if it is waiting, tomorrow once voted today), then the
  vigil and Halloween morning, then every rampage day at 6 pm ("Rampage day 3: The Market Town" and the
  place's blurb), for the next 7 days (the platform's limit), skipping tonight once voted.
  `run.setReminders` cancels our earlier ones (payload tag `itsAliveReminder`) and schedules the plan with
  a stable id per night, so re-arming never stacks duplicates. On run.world they land in the bell inbox.
  Skipped in local dev (mock).
- The awakening (Halloween, `components/Awakening.tsx`, rules in `src/game/awakening.ts`): a full-screen scene
  every player sees ONCE, the first time they open the game from midnight Central that begins Oct 31
  (`awakeningDue`: phase `awakened` and not `save.sawAwakening`; it also pops up for a player who has the
  game open across midnight). Intro card "Midnight has come" with "Witness the awakening" (the tap lets
  phones play sound; it waits for every night to be tallied, `allStitched`, so the creature is exactly
  the one everyone built: useGame retries failed tallies every 4 s from Halloween on, and the rampage
  waits for it too), then ~7.6 s on `TIMELINE`:
  dark grey creature in the rain with the season's totals ("19 nights. N votes.", `seasonTotals`), the
  chosen spark gathering (its line in `SPARK_LINES`, two soft flickers, generator crackle), the strike (a
  bolt from the sky onto the head in the spark's `--aura` colour, one flash, quake, thunderclap, heavy
  haptic), colour flooding back with jolts, then breathing and IT'S ALIVE! slamming in, and "It breaks
  out! ⚡" (later: "See your creature") into the rampage menu, where the breakout plays. Skip at any point. `markAwakened` also marks every night seen, so
  no stale Reveal follows. "Watch it wake again" on the Awakened screen replays it. Each stage's resting
  style is its end state (animations only add motion), reduced-motion goes straight to the end, and
  flashes stay under 3 a second. Storm sounds are synthesized noise (`src/app/sfx.ts`) through the
  theme's unlocked AudioContext (`theme.output()`), at the music volume, silent with music off.
- THE RAMPAGE (from Halloween; rules `src/game/rampage.ts` + `rampageRun.ts`, tests `rampage.test.ts`,
  canvas `components/Rampage.tsx`). Rampage day = `phase.daysSinceAwakening` (0 = Halloween).
  - The creature is the community's: `app/creatureSprite.ts` composites its real painted layers
    (`layoutMonster` of the winners) onto one canvas, cropped to the body, with a glow in the spark's
    colour (`AURA`) and one canvas per slot so a part lights up when it wakes. It faces front; it is
    flipped to face where it walks, bobs and squashes as it stomps.
  - A run (`RUN_SECONDS` 60): drag anywhere (a floating stick) or arrow keys/WASD. It smashes anything
    up to `SMASH_RATIO` 0.75 of its height and is stopped by bigger things ("Too big to smash yet").
    Growth is by area (`sizeAfter`, `GROWTH` 0.2, mass = 0.6 h²); speed grows with sqrt(size × start),
    the camera keeps it at `SCREEN_FILL` 27% of the screen height and zooms out as it grows (hole.io).
    Villagers and chickens flee (`mover`) and get flung off screen, never killed. Every run starts at
    `BASE_SIZE`: the community's growth is shown as its real height (`communitySize` → ft, the HUD's
    scale) and each day's place is a new challenge rather than an easier one.
  - Powers (`POWERS`, woken at a multiple of the start size, banner names the community's parts via
    `powerParts`): legs 1.12× faster; arms 1.3× reach; maw/head/second head 1.5× swallow small things
    nearby; tail/spine 1.75× sweep; wings 2.05× leap and crush on landing; spark/heart/brain 2.4×
    frenzy and lightning on the biggest thing nearby. Balance (rampage.test.ts, a "decent player"
    bot): every place gives a full minute, wakes ≥4 parts and never flattens ≥60% of it. Re-run the
    tests after any tuning; the powers compound, so small changes snowball.
  - Places (`STAGES`, `stageFor(day)`): the Village, the Farmlands, the Market Town, Graveyard Hill,
    the Baron's Estate, then the City for ever. `buildWorld(seed, stage)` (seed `<season>:r<day>`, the
    same for everyone that day) lays out roads, houses with clutter, landmarks on 7 plots, farms,
    graveyards, pumpkin patches, woods and crowds; the laboratory sits at the start, already rubble.
  - Community: one shared-tally entry per run, filed under its rubble band (`r_<season>_d<day>_b<band>`,
    `rubbleBand`, 12 bands, `bandValue`) because counts are all the tally does; a day's total is
    `totalFromBands` of 12 counts. Closed days are cached in `save.rampage.totals`; the creature's height
    today is `communitySize(sum of past days)` (logarithmic). Guests are NOT prompted after every run:
    the end panel offers "Sign in to count it" (`run.isGuest`, `countAsSignedIn`).
  - Save: `rampage` {best, runs, day, today, brokeOut, totals} (`recordRun`, `rememberRubble`,
    `markBrokeOut`). Runs start from the menu with a short "RAMPAGE!" intro (no breakout in runs).
  - Art: village props are PixelLab pixflux sprites (`tools/art/props.py gen|sheet|pick`, picks in
    `art/props.json`, shipped in `public/art/props/<kind>.png`, trimmed). Small figures drew a moon
    behind themselves with "night" in the prompt: those use `PLAIN`. Debris colours come from each sprite.
  - Sounds (`sfx.ts`): `thud` per smash (weighted), `roar` at the breakout, `chime` when a part wakes.
  - Mock only: `?runSeconds=N` shortens runs; `window.__rampage` is the live run and `window.__steer`
    steers it (tests and screenshot scripts drive a greedy player with these).
- Build stamp (`__BUILD__`, set in vite.config.ts) shows at the bottom of every screen. Tapping it 5 times
  opens the hidden Diagnostics panel: sign-in, music file/player/output and the last music error, plus
  Sign in / Try music again buttons. Use it to debug on a phone.
## Layout

```
src/game/      pure rules, no SDK/DOM: catalog (questions + options), schedule, tally, state (save reducers),
               layout (which husk pieces + painted layers to draw, back to front), crowd (stand-in tallies),
               sketch (Sketchbook designs), reveal (last night's stitching), awakening (Halloween scene),
               rampage + rampageRun (the rampage: places, powers, growth, one run; rampage.test.ts),
               reminders (daily notifications), rng; rules.test.ts, stitch.test.ts (every layer exists, joins its body, shows on a full monster)
src/sdk/run.ts the ONLY module that imports the RUN SDK (init wait, error catching, saves, votes, ads, clock)
src/app/       useGame: controller wiring rules <-> SDK, persists the save after every change; useMusic: theme;
               useStorm: the vigil's lightning; sfx: synthesized storm and rampage sounds;
               creatureSprite: the community's creature
               as one sprite (plus glow and per-part canvases) for the rampage
src/components Monster (the husk in the lab with its painted layers), Voting (options + results), Chronicle,
               Sketchbook (players design their own monster), Reveal (last night's stitching),
               Awakening (the Halloween waking scene), Rampage (the canvas run, HUD, end panel),
               LooseScene (the rampage menu's picture and the breakout),
               SoundPanel (in-game music popover and
               the title's MusicBar), Diagnostics
src/App.tsx    screens: title/continue, vote, preseason, vigil, and from Halloween the rampage menu
public/art/    shipped art: husk/<region>.png, parts/<key>.png (painted layers, also the card art),
               props/<kind>.png (the rampage's village),
               icons/spark_*.png (the spark is an effect), lab.png (room with its props painted in)
public/cdn-assets/  uploaded to RUN's CDN on deploy (large files, >100 KB): audio/theme.mp3
art/           NOT shipped: picks.json, picked/ (chosen scene-sized paintings, husk.png, bg_lab.png),
               raw/ (git-ignored candidates)
tools/art/     husk.py (inpaint/edit parts into the husk), process.py (layers), pixellab.py, prompts.py,
               props.py (rampage props)
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

## The monster: one husk with parts painted into it (PixelLab: the cloud proxy adds auth; on a local clone set `PIXELLAB_API_KEY`)

Night 1 (and before launch) shows a whole human husk (`art/picked/husk.png`) standing in the lab. Every
part is PAINTED INTO that body by PixelLab, never pasted on as a separate sprite, so all parts share the
husk's scale, pose, outline and light, and sit on the same neck, shoulders, waist and floor:
- One coordinate system: the 224x200 lab scene, husk at `HUSK_AT` (60, 26), feet on `FLOOR_Y` 192.
  `husk.py regions()` splits the husk into head / torso / loincloth / armR / armL / legR / legL.
  `mask_for(slot)` says where each slot may paint (a head may grow above the neck, an arm outward, etc.).
- The six big parts (head, torso, arms, legs) are Pro inpaints (`/inpaint-v3`, ~9 generations each) of
  the husk region. The loincloth is never replaced: it ties the waist together.
- Heads must stay head-sized: about 24-36 px wide, centred on x 111.5 like the husk's own head. Heads the
  model blows up (wig, beak) paint only inside `HEAD_BOX` (`SIZED`); the werewolf gets an oval with room
  for its ears. Changing a head means repainting all 25 head add-ons on it:
  `husk.py edit <slot> --on=<head> --seed=7` for horns, browEye, ears, jaw and brain, then re-pick.
  husk.py paints onto the base named in picks.json (art/raw), not the stale art/picked/ copy.
- Add-ons that sit on a chosen part (third eye, horns, ears, jaw, brain on each HEAD; chest eye, heart,
  belly mouth, second head on each TORSO) are made with `edit-images-v2`: one job
  (~10 generations) paints an option onto all 5 bases; `added()` keeps only the new/clearly changed pixels
  inside the slot mask, so the base keeps its own colours. Their layer key is `<option>@<base>`.
- Behind-the-body parts (wings, spine, tail, third arm) are Pro inpaints around the husk, drawn behind it.
- The cheap `/inpaint` (1 generation) was tried and is too weak for add-ons (lost horns, no third eye).
- The inpaint model fills the area it is given right to its edge, so a part bigger than its area comes
  out sliced flat (the old blacksmith's arm, dragonfly wings). Parts with a telling outline are painted
  inside that outline (`SHAPES`: dragonfly and moth wings as long ellipses, the quills as a spiky fan,
  the lightning rods as three rods with ball tips, the crab's arm and pincer, the mole's arm and claw);
  other broad shapes get an oval (`OVAL`). `paint_mask()` is the exact area a Pro inpaint paints in.
  `process.py` refuses a layer cut along a straight edge of its area for more than `CUT_RUN` px
  (feet on the floor and `SHAPES` parts excepted). It checks against the CURRENT areas, so after
  widening one, look at the older parts painted in it by eye.
- Chest eyes are mirrored to the other pectoral (`MIRROR`, the edit model puts them where the heart
  goes). Faint generator pixels are dropped (`solid`).
- Nothing floats, by construction: `process.py rooted()` keeps only the pieces of a layer that touch
  what it grows from (its base part, the shoulder for a second head, the body for the rest).
- An add-on keeps only pixels that are really new (`only_new`, `STRONG` per base: 110 on heads, 70 on
  torsos where dark add-ons sit on dark chests): where it lies on its base it must differ clearly from
  the base, otherwise it is the edit model re-rendering the base (greyer croc). A brain keeps only the
  top rows of the head under it (`TOP_BAND`): the edit model also redraws the face lower down, which
  showed as a second pair of eyes. (Until Oct 2026 `only_new` silently did nothing: it edited a copy.)
- Draw order (`Z` in husk.py and layout.ts, keep them equal): heart over chest eye and mouth; third eye
  over brain over horns (their layers carry a little redrawn skull); spine over the third arm. One
  option breaks its slot's order (`Z_OF_OPTION`, both files): the unicorn horn rises through the brain.

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
rooted in the body, a foot misses the floor, or a part is buried on a finished monster (thin
lightning rods may show as little as 8%: their glowing tips stand clear).

The lab (`public/art/lab.png`, 224x200) is one painting: room `bg_lab__s14` (upright blood-stained
operating slab behind the husk) with the surgical cart and the generator INPAINTED onto its floor, so
the props share its perspective. Never composite props onto the room: they float.

## Testing nights

- Local dev: `?day=N` (below). It is ignored on RUN (live mode), and RUN does not pass the page's
  query to the game anyway.
- On the deployed build: OWNER TEST MODE (owner's request, Oct 31). Tap the build stamp 5 times; the
  Diagnostics panel shows "Test mode (owner only)" when `run.canPreview()` (RUN's server-verified
  `app.getMyRole()` is owner or editor; always in local dev) with jumps to the vigil (19), Halloween
  (20) and rampage days 2, 3 and 6 (21, 22, 25). `run.setPreview(day)` switches the clock
  (`devDayOverride`) and the save key (`save_preview`, a fresh throwaway save each jump; the real
  `save` is never touched) at once. In test mode the past nights are read from the REAL tallies (the
  real creature), but every write is fake (`fakeWrites`: votes and rubble stay on the device), the
  rampage's community numbers are simulated, and reminders and analytics are not sent. A yellow
  "TEST MODE · <day> · nothing counts · Exit" pill shows while it is on. useGame's `setPreview` pauses
  saving while it switches (`switching`) and drops work started before a switch (`epoch`), so nothing
  from one save lands in the other. The old Test Lab's keys (`testLab`, `save_test`, `testVotes`) are
  still deleted on boot.

## Dev

- `npm run dev` — mock SDK. Add `?day=N` to time-travel to voting day N (`?day=19` = the vigil,
  `?day=20` = Halloween = rampage day 0, `?day=21` = rampage day 1, ...); mock only. `&runSeconds=6`
  for short rampage runs.
- `node scripts/shot.mjs "?day=5" out.png 375 667 start` — screenshot with the dev server on :5173.
- Playwright (e2e, shot.mjs) uses the sandbox's `/opt/pw-browsers/chromium` when it exists, else its
  own browser (`npx playwright install chromium` on a local clone). `.gitattributes` keeps LF endings.

## Checks — run ALL before every push, fix every warning

`npm run check` runs all of them in this order and stops at the first failure.

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
- Public: version 1.24.0 (commit b4bc1d2: the vigil storm, the awakening at midnight Central Oct 31, the
  rampage menu and the rampage, on top of 1.20.0's jam button, 1.16.0's reminders and streak vote and
  1.14.0's season, thumbnail and name) was submitted with the publish workflow on Oct 30, 20:41 UTC
  (1.20.0 on Oct 23, 1.16.0 on Oct 13, 1.14.0 on Oct 11); RUN reviews it and makes it public on approval. Pushes after that deploy NEW private versions only: a fix
  reaches public players only when the owner asks to publish again (each submission must be a higher
  version and goes through review). Name, tags and description are set game-wide on each deploy.
- `.github/workflows/publish.yml`: hand-run only. `publish` runs `rundot game set-public --version X.Y.Z`
  (newest from `rundot game list-versions` when blank — the CLI rejects "latest"); `unpublish` runs
  `rundot game set-private`. Only run it when the owner asks.
- One-time setup by the owner (never paste keys into chat or code):
  1. `rundot login`
  2. `rundot init --name "It's Alive!" --description "..." --orientation Portrait --build-path ./dist`, commit `game.config.prod.json`
  3. `rundot game api-keys create --label "GitHub Actions"` and save the secret as the `RUNDOT_API_KEY` repo secret
- `public/thumbnail.jpg` must be exactly 512x512 and under ~150 KB. It is the owner's own art (full size in
  `art/thumbnail-source.jpg`, not shipped): never replace it with a render. Name ("It's Alive!"), description and
  tags (including the `October-Jam` and `Monster-Mash` jam tags) are the env lines at the top of
  deploy.yml, applied game-wide on every deploy.
- `.github/workflows/jam-promo.yml`: hand-run, read-only. `rundot jam promo` prints the game's jam entries
  (October Jam) with their vote/play links, caption and social share URLs; read them in the run's log.
- No leaderboard in this game.
- `rundot/textGen.config.json` is `{"disabled": true}`: the game uses no AI, and `rundot deploy` otherwise
  auto-creates an uncapped config. Keep it disabled unless a feature needs it (then set caps).
- The cloud sandbox cannot reach w.run (network policy), so live checks on the deployed build are done by the owner.
