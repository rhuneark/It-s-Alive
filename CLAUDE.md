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

From Oct 31 (owner's request) it is MULTIPLAYER FIRST. Home is only the creature and one button,
Awaken, which offers a live BATTLE (3 minutes, up to 8 creatures, bots in the empty seats; the
player brings the village's creature or their own Sketchbook build; biggest mass at the bell wins)
or the STORY run (the village's creature alone in the day's place, with upgrades). Big numbers
(`numbers.ts`, K/M/B/T… like RUN's Big Numbers API) everywhere; power-ups on the map in both modes;
upgrades in the story only ("multiplayer runs differently so only powerups on the map matter").
Fonts: Rubik for reading (the owner found the gothic fonts unreadable), and since the PIXEL SKIN
(below) Pixelify Sans for titles, buttons, labels and numbers.
PIXEL UI (owner's request, Oct 31: "make the UI pixel graphics"): every frame is a tiny 9-slice PNG
of pixel art (`src/assets/ui`, made by `tools/art/ui_frames.py`, inlined by Vite) scaled 3x with
`border-image` and `image-rendering: pixelated`, so one art pixel is 3 CSS px everywhere: buttons
and tiles 9px (`btn-dark`, `btn-red`, `btn-gold`, `tile-red`, `tile-violet`, `pick-on` for a chosen
option), panels 12px (`panel`: sheet, modals, toast, end card), wells and rows 6px (`well`,
`well-gold` for your own row / a lit part). Stepped corners, no rounded ones, hard 2-3px text
shadows. It all lives in the PIXEL SKIN section at the end of style.css (it overrides the older
rules above it). The mode tiles' icons are pixel bitmaps (`PixelArt` in App.tsx).

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
- From Halloween the title AND the in-game hub are one screen, `RampageMenu` (App.tsx): ONLY the
  creature and one button, AWAKEN (`awaken-open`, `components/AwakenButton.tsx`; owner: "make it
  oozing with power"): drawn as pixel art on a canvas (3 CSS px per art pixel, 15 fps): a slab of
  dark stitched hide with a neck bolt at each end, glowing ooze in the creature's spark colour
  (`AURA`) capping its top, hanging in fat drips and dripping off its bottom (drops fall and
  splash), cracks and letters lighting up on a heartbeat, lightning arcing off the bolts and now
  and then surging from bolt to bolt over the top. Still for reduced-motion players and while the
  sheet or a run covers it. The picture (`LooseScene`) is a PixelLab
  painting (`public/art/home.png`, 240x400, pixflux seed 37, candidates in art/raw/bg, original in
  art/picked/home.png; the owner called the old code-drawn sky and rows "crappy"): a gothic street
  at night, lit windows, a tower under a huge blood moon, covering the screen. The community's
  creature stands in the street (feet at `FEET_Y` 0.8 of the painting), ALIVE through `RigCanvas`
  (breathing, tail lashing, rearing up when lightning in its spark colour splits the sky), bigger
  the taller the community made it, its head against the moon; rain, embers and villagers with
  torches fleeing along the road. The first time a player sees it, the BREAKOUT plays: the ground
  shakes, the night flashes, rubble flies, it rises, IT'S LOOSE! (white, red glow, above the moon),
  then `markBrokeOut`. Awaken opens a dark glass sheet (`mode-sheet`, "Choose your hunt"): two big
  tiles, Battle (`mode-battle`, starts at once) and Story (`mode-story`, opens the story panel), "Battle
  as" the village's creature or the player's own (`pick-village` / `pick-mine`; "Build my own" opens
  the Sketchbook), then Sketchbook, Chronicle and Replay (`awaken-replay`), the jam button and the
  music row. The story panel (‹ back): "Rampage · day N", "Loose in <place>", its blurb and stats
  (`rampage-card`), Start the rampage (`rampage-start`), your best (`rampage-best`), today's
  bounties (`bounty-board`) and the upgrades (`upgrades`, `buy-<id>`). The scene is not mounted
  while the waking scene, a run or a battle covers the home (`covered`), so the breakout is never
  played unseen.
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
    (`layoutMonster` of the winners), cropped to the body, plus one canvas per slot (`parts`, `order`).
    `app/creatureRig.ts` (`drawRig`, a `Pose`) animates each part on the husk's own joints: legs stride,
    arms swing and claw (`clawSwing`: raised wide, slashed across), the third arm writhes, wings beat
    (hard in a leap), the tail lashes, the head bobs and rears back to roar with arms spread; whatever
    is painted on the head or chest moves with it. The rig is drawn on a small canvas, its glow (spark
    colour, `AURA`) blurred there (cheap) and the whole scaled up; it faces front and is flipped to face
    where it walks or what it claws, and swells as parts wake.
  - A run (`RUN_SECONDS` 60): drag anywhere (a floating stick) or arrow keys/WASD. It smashes anything
    up to `SMASH_RATIO` 0.75 of its height and is stopped by bigger things ("Too big to smash yet").
    CLAWS (owner's request: auto attack): every `CLAW_EVERY` 0.9 s (0.6 once its arms wake) it rakes
    the nearest smashable thing within 2× its reach on its own (event `attack`, arms in turn, smash by
    `claw`). Growth is by area (`sizeAfter`, `GROWTH` 0.2, mass = 0.6 h²); speed grows with
    sqrt(size × start). It starts SMALL on screen (`FILL_START` 14% of the screen's height) and looms
    larger with every part woken (+`FILL_PER_POWER` 2.8%) while the camera zooms out as it grows.
    Villagers and chickens flee (`mover`) and get flung off screen, never killed. Every run starts at
    `BASE_SIZE`: the community's growth is shown as its real height (`communitySize` → ft, the HUD's
    scale) and each day's place is a new challenge rather than an easier one.
  - Scenes (owner's request: "each one feels like a cinematic of it growing… a horror shot"). Intro
    (`INTRO_SECONDS` 2.8): black, a heartbeat, lightning strikes it in the ruins of its lab, it rears
    and roars, RAMPAGE!, the camera pulls back. Each power that wakes is a 2.1 s scene (`CINE_SECONDS`;
    the run is paused, so no time is lost; a tap after 0.8 s cuts it short): close-up, the night closes
    in, lightning onto it, it swells and roars, its parts glow, the heart pounds red at the edges, and
    a blood-red title (`WAKES`: "It strides / reaches / hungers / lashes / leaps / rages") under "<the
    community's parts> awaken". The end: one more roar in close-up (`OUTRO_SECONDS` 1.6) before the
    panel. Something 120+ tall coming down plays in slow motion (0.3× for 0.45 s).
  - Chains and bounties (Oct 31, "spruce it up"). Smashes less than `CHAIN_GAP` 0.8 s apart build a
    CHAIN; every `CHAIN_STEP` 20 of it adds ×0.25 to the rubble each smash earns (`chainMultiplier`,
    up to ×2; `RampageRun.liveChain`, `bestChain`). Three BOUNTIES a day (`src/game/bounty.ts`,
    `bountiesFor(seed, world)`, the same for everyone): easy (smash N of a small thing the place is
    full of, +150), middling (send N villagers flying, or a chain of 100, +250) and hard (topple a
    house or tavern, wake all six parts, or grow four times taller, +400). A run that completes one
    gets its bonus rubble (event `bounty`, `done`); the save keeps the day's done ids
    (`rampage.bounties`, reset each day by `recordRun`). rampage.test.ts: the bot always does the
    easy one, does most overall, and not every day all three. RANKS by how many times taller a run
    grew ("A Stirring Thing" … "The End of All Things", `rankFor`).
  - The run's screen: a dark HUD band (rubble, a blood-red clock that pounds in the last 10 s,
    height), "Next to wake" with that part's own painted layer (`PartIcon.tsx`: `layerKey` of the
    community's parts; the spark's icon) over a stitched seam filling with blood; the chain meter
    (hotter colours per ×0.25); the bounties ticked off at the bottom left; floating "+N" rubble over
    anything worth 20+; a gold "Bounty!" pop-up; "<The church> falls!" with a roar and slow motion
    when a landmark comes down (`LANDMARKS`). The end card: the place, "The rampage rests", the rank,
    the rubble (a "New best!" stamp), the six parts as icons (lit if woken), height and longest
    chain, the bounties with ticks, whether it counted, and the buttons.
  - The night: darkness (`NIGHT` 0.7) on a quarter-resolution canvas with pools of light cut out of it:
    the creature's own glow, lamps, lit windows, jack-o'-lanterns, the torches every third villager
    carries, and the fires left burning (9 s) where it smashed buildings, haystacks and carts; rubble
    stays on the ground. The vignette, the heartbeat (red, pounding in the last 10 s with its sound and
    in every scene) and lightning flashes are drawn into that small canvas too (full-screen fills were
    the cost). A storm: a strike every 6-14 s (two flickers: under 3 flashes a second), thunder, rain.
    Reduced-motion players get no flashes, shaking, slow motion, rain or storm strikes.
  - Townsfolk: idle sway, a stroll, or a panicked sprint (leaning in, bouncing, squashing); a red "!"
    when one starts to flee, screams over their heads ("AAAH!", "RUN!", "MONSTER!", "HELP!"…), and the
    flung ones shriek.
  - THEY FIGHT BACK (owner's request, Oct 31; `braveWith`, `Field.step` in rampageRun.ts, tests in
    rampage.test.ts): every third villager carries a torch and every other farmer a pitchfork. Against
    a creature up to `BRAVE_RATIO` 4.5x their height they stand their ground instead of fleeing,
    keep `THROW_RANGE` 3.8 reaches away and throw every `THROW_EVERY` 1.8 s. A missile flies to where
    the creature WAS (so moving dodges it); a hit knocks off `HIT_SHARE` 3% of its mass (at least
    300) and staggers it (`STAGGER` 0.35 s at 0.4 speed); Iron Hide shrugs it off. Events `throw`
    and `hit`; the story shows a red flash, a red "-N", battle cries over the braves and, the first
    time, "The villagers fight back! Keep moving to dodge."; battles get them on the wire (`t`, `h`).
    Once the creature outgrows them, they flee like everyone else.
  - Powers (`POWERS`, woken at a multiple of the start size, named after the community's parts via
    `powerParts`): legs 1.12× faster; arms 1.3× reach; maw/head/second head 1.5× swallow small things
    nearby; tail/spine 1.75× sweep; wings 2.05× leap and crush on landing; spark/heart/brain 2.4×
    frenzy and lightning on the biggest thing nearby. Balance (rampage.test.ts, a "decent player"
    bot that steers around what it cannot smash, `clearPath`; the middle of three tries): every place
    gives a full minute, wakes ≥4 parts and never flattens ≥60% of it. Re-run the tests after any
    tuning; the powers and claws compound, so small changes snowball.
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
    `markBrokeOut`). Runs start from the menu with the intro scene (no breakout in runs).
  - Art: village props are PixelLab pixflux sprites (`tools/art/props.py gen|sheet|pick`, picks in
    `art/props.json`, shipped in `public/art/props/<kind>.png`, trimmed). Small figures drew a moon
    behind themselves with "night" in the prompt: those use `PLAIN`. Debris colours come from each sprite.
  - Emergence storyboard (owner's request, Oct 31): 8 shots with ChatGPT prompts and reference renders
    of the real creature, a private claude.ai artifact (https://claude.ai/artifact/EzyonHTDkPjBQBvAgVnC6s).
    Frames the owner sends back (shot-1..shot-8, 1080x1920) are meant for the breakout (`LooseScene`).
  - Sounds (`sfx.ts`): `thud` per smash (weighted) and heavy footsteps once it is big, `swipe` per
    claw, `roar` (breakout, intro, every waking, the end), `chime` when a part wakes, `heartbeat`.
  - Mock only: `?runSeconds=N` shortens runs; `window.__rampage` is the live run and `window.__steer`
    steers it (tests and screenshot scripts drive a greedy player with these).
- THE BATTLE (multiplayer; rules `src/game/arena.ts`, host `battleHost.ts`, wire `battleWire.ts`,
  server `src/rooms/BattleRoom.ts`, screen `components/Battle.tsx`; tests arena.test.ts and
  battleHost.test.ts).
  - Live rooms are RUN's realtime multiplayer (beta, server-authoritative `GameRoom`; signed-in
    players only, RUN prompts a guest). `rundot/realtime.config.json` registers room type `battle`
    (max 8, reconnect 15 s); `rundotMultiplayerPlugin()` in vite.config.ts bundles `src/rooms` into
    `dist/server-bundle.js` (+ `dist/rooms.config.json`, uploaded by `rundot deploy`) and, in
    `npm run dev`, runs a local room server on :9001 where every browser tab is its own fake player
    (two tabs = a real two-player battle). Server code may only import pure `src/game` modules (no
    Node built-ins, no DOM). `run.joinBattle()` = `realtime.joinOrCreateRoom('battle')` (12 s
    timeout); private messages (`sendTo`: the match) arrive through `onPrivateMessage`, which
    run.ts routes to the same handler.
  - `BattleHost` (pure, used by the server room AND `app/localBattle.ts`): players `hello` with
    name and parts (`cleanSketch`ed) and `steer`; a `LOBBY_SECONDS` 5 lobby after the first
    arrives, then bots (`botSeat`: random parts, a monster name) fill the 8 seats; a late player
    takes a bot's seat until `JOIN_UNTIL` 60 s are left (then the room locks); a player who leaves
    is played by a bot. Ticks every `TICK_MS` 50; a snapshot every 2nd tick (fighters packed 6
    numbers each, power-ups, packed events incl. every smash, what was rebuilt); `over` with the
    standings. If the live join fails (guest, offline, service down) the battle is OFFLINE vs bots
    on the phone with the same host (`localBattle`), and says so.
  - `Arena` (`BATTLE_SECONDS` 180): each creature is a `Beast` on one shared `Field` (rampageRun.ts:
    the story's own creature code, so claws, powers and growth match). A creature devours another up
    to `EAT_RATIO` 0.8 of its might when it reaches it (gains 60% of its mass); the devoured comes
    back small after 3 s at the `safeSpot` farthest from anything that could eat it, shielded
    (`SPAWN_SHIELD` 3 s of Iron Hide). Battle tuning (`BATTLE_TUNE`): speed grows only as
    size^0.12 (a giant is barely faster than a newborn), growth 0.45 of a smash's mass; past 3× its
    start a creature sheds 0.6%/s of its mass; smashed things are rebuilt after 30 s (`regrow`, not
    under a creature), so the place lasts the 3 minutes (arena.test.ts: 25-40% stands at the end,
    the winner reaches hundreds of thousands of mass). Ranked by mass. Bots (`think`, 4×/s): flee
    what could devour them, chase what they could devour, grab power-ups, else smash the nearest.
  - The screen: others drawn ~110 ms in the past between snapshots, your own creature extrapolated
    with your steering (it answers at once); camera on you; name tags with mass (big numbers);
    HUD: your mass and rank, the clock, the top five; power-up chips; a feed of who devoured whom;
    banners (power woken, power-up taken, "You devoured X!"); "Devoured!" while you wait to come
    back; the standings at the end ("Battle again" / Home). Mock only: `?offline=1` skips the live
    room, `?battleSeconds=N` shortens it (offline); `window.__battle` exposes `me`, `pickups`, `props`
    and `window.__steer` steers (screenshot scripts).
- POWER-UPS (`src/game/powerup.ts`, both modes; on the map as glowing orbs with a mark, taken by
  walking over, back 6 s later elsewhere): Surge (much faster, 6 s), Hunger (sucks in small things,
  7 s), Monster Serum (×1.35 might: smash and devour bigger, 6 s), Blood Moon (double growth and
  rubble, 8 s), Iron Hide (cannot be devoured, 8 s; battle only), Thunder Stomp (smashes all around,
  at once). Story runs have 8 (`STORY_PICKUPS`), battles 18.
- STORY UPGRADES (`src/game/upgrades.ts`, story only): every run's rubble goes into the purse
  (`save.rampage.purse`); levels (`save.rampage.levels`) cost `base × growth^level`: Rubble Value
  (×1.5 everything a run earns, 40 levels: the numbers run into the billions), Sharper Claws, Longer
  Stride, Born Bigger, More Time (+5 s). `storyRun(levels)` gives the run's start size, seconds and
  `Boost`. The village's tally counts a run's `baseRubble` (before Rubble Value), so upgrades never
  inflate the community's growth.
- Build stamp (`__BUILD__`, set in vite.config.ts) shows at the bottom of every screen. Tapping it 5 times
  opens the hidden Diagnostics panel: sign-in, music file/player/output and the last music error, plus
  Sign in / Try music again buttons. Use it to debug on a phone.
## Layout

```
src/game/      pure rules, no SDK/DOM: catalog (questions + options), schedule, tally, state (save reducers),
               layout (which husk pieces + painted layers to draw, back to front), crowd (stand-in tallies),
               sketch (Sketchbook designs), reveal (last night's stitching), awakening (Halloween scene),
               rampage + rampageRun (the rampage: places, powers, growth, one run; rampage.test.ts),
               bounty (the day's three bounties), powerup, upgrades (story), numbers (big numbers),
               arena + battleHost + battleWire (the multiplayer battle: rules, host, wire format),
               reminders (daily notifications), rng; rules.test.ts, stitch.test.ts (every layer exists, joins its body, shows on a full monster)
src/sdk/run.ts the ONLY module that imports the RUN SDK (init wait, error catching, saves, votes, ads, clock,
               live battle rooms)
src/rooms/     BattleRoom: the live battle's GameRoom on RUN's server (a thin shell over BattleHost)
src/app/       useGame: controller wiring rules <-> SDK, persists the save after every change; useMusic: theme;
               useStorm: the vigil's lightning; sfx: synthesized storm and rampage sounds;
               creatureSprite: the community's creature as one sprite (plus glow and per-part canvases);
               creatureRig: its parts animated on their joints (`drawRig`, and `RigCanvas` to draw
               it posed and glowing), for the rampage, the battle and the home; drawing: shared glow
               colours (`AURA`), light sprites, ground tiles; localBattle: an offline battle
src/components Monster (the husk in the lab with its painted layers), Voting (options + results), Chronicle,
               PartIcon (a part as the village painted it, for the rampage's HUD and end card),
               Sketchbook (players design their own monster), Reveal (last night's stitching),
               Awakening (the Halloween waking scene), Rampage (the canvas run, HUD, end panel),
               Battle (the multiplayer battle; Rampage and Battle are lazy-loaded chunks),
               LooseScene (the rampage menu's picture and the breakout), AwakenButton (the home's
               pixel-art button),
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
               props.py (rampage props), ui_frames.py (the pixel UI's 9-slice frames)
src/assets/ui/ the pixel UI's frames (tiny PNGs, inlined into the CSS)
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
  >=44px tall, text >=14px. Fonts (Google Fonts): Pixelify Sans for titles, buttons, labels, numbers; Rubik for longer text.
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
  Diagnostics panel shows "Test mode (owner only)" when `run.canPreview()` allows it: always in local
  dev; on RUN when `app.getMyRole()` says owner or editor (raced against 4 s: inside the app it has
  hung or said "none" for the owner, on Oct 10 and again Oct 31), or the signed-in account is the
  owner's handle `rhuneark`, or after tapping the panel's "Diagnostics" title 5 times (a hand unlock
  for this session; harmless, test mode cannot change anything real). The panel's "Owner check" row
  shows what the role check answered. Jumps: the vigil (19), Halloween
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
- `npm run dev` also runs the local room server for live battles on :9001 (two browser tabs = two
  players). The e2e tests start their own on :9199 (`MP_DEV_PORT` in playwright.config.ts), so they
  can run while `npm run dev` does.
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
- Public: version 1.29.0 (commit a37a0c7: multiplayer battles, power-ups, story upgrades, big numbers,
  Rubik, the creature + Awaken home, on top of 1.24.0's vigil storm, awakening and rampage) was
  submitted with the publish workflow on Oct 31, 04:28 UTC, half an hour before Halloween began in
  Central (1.24.0 on Oct 30, 1.20.0 on Oct 23, 1.16.0 on Oct 13, 1.14.0 on Oct 11); RUN reviews it
  and makes it public on approval. 1.30.0 (commit ba1c7ff: the painted home street and the cleaner
  Awaken sheet) was submitted the same way at 05:07 UTC, and 1.31.0 (commit 66da254: villagers who
  fight back, the pixel UI and the oozing Awaken button) at 18:51 UTC. Pushes after that deploy NEW private versions only: a fix
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
