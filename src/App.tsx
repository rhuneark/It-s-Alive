import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { JAM_VOTE_URL, useGame, type GameModel } from './app/useGame';
import { theme, useMusic } from './app/useMusic';
import { useStorm, type Strike } from './app/useStorm';
import { Awakening } from './components/Awakening';
import { Chronicle } from './components/Chronicle';
import { Sketchbook } from './components/Sketchbook';
import { Diagnostics } from './components/Diagnostics';
import { MusicBar, SoundPanel } from './components/SoundPanel';
import { Monster } from './components/Monster';
import { Reveal } from './components/Reveal';
import { AwakenButton } from './components/AwakenButton';
import { DayBoard } from './components/DayBoard';
import { DailyReward } from './components/DailyReward';
import { LooseScene } from './components/LooseScene';
import { OptionGrid, Results } from './components/Voting';
import { findOption, questionForSlot } from './game/catalog';
import { formatCountdown } from './game/schedule';
import { BASE_SIZE, feet } from './game/rampage';
import { big } from './game/numbers';
import { UPGRADES, cost, level, storyRun } from './game/upgrades';
import type { Parts } from './game/sketch';
import {
  DEFAULT_MUSIC_VOLUME,
  MAX_AD_VOTES_PER_DAY,
  bonusVoteWaiting,
  canEarnAdVote,
  votesAllowed,
  votesRemaining,
} from './game/state';
import * as run from './sdk/run';

// The rampage and the battle load when first played (they are most of the code).
const Rampage = lazy(() => import('./components/Rampage').then((m) => ({ default: m.Rampage })));
const Battle = lazy(() => import('./components/Battle').then((m) => ({ default: m.Battle })));

export default function App() {
  const [inGame, setInGame] = useState(false);
  // Music may play once the player has tapped into the lab or touched the music controls.
  const [listening, setListening] = useState(false);
  const [music, setMusic] = useState<MusicPrefs>({
    loaded: false,
    on: false,
    volume: DEFAULT_MUSIC_VOLUME,
  });
  // Downloaded on the title screen; audible from the first tap into the laboratory.
  useMusic({
    prefetch: music.loaded && music.on,
    on: (inGame || listening) && music.on,
    volume: music.volume,
  });

  // Keep content clear of the host toolbar and device notches.
  useEffect(() => {
    void run.ready().then(() => {
      const s = run.safeArea();
      const root = document.documentElement.style;
      root.setProperty('--safe-top', `${s.top}px`);
      root.setProperty('--safe-bottom', `${s.bottom}px`);
    });
  }, []);

  const onEnter = useCallback(() => setInGame(true), []);
  const onLeave = useCallback(() => setInGame(false), []);
  const onListen = useCallback(() => setListening(true), []);

  return (
    <Game
      inGame={inGame}
      onEnter={onEnter}
      onLeave={onLeave}
      onListen={onListen}
      onMusic={setMusic}
    />
  );
}

interface MusicPrefs {
  loaded: boolean;
  on: boolean;
  volume: number;
}

function Game({
  inGame,
  onEnter,
  onLeave,
  onListen,
  onMusic,
}: {
  inGame: boolean;
  onEnter: () => void;
  onLeave: () => void;
  onListen: () => void;
  onMusic: (prefs: MusicPrefs) => void;
}) {
  const game = useGame();
  const [chronicle, setChronicle] = useState(false);
  const [sketchOpen, setSketchOpen] = useState(false);
  const openSketch = () => {
    setSketchOpen(true);
    game.armReminders();
    run.track('sketchbook_open');
  };
  const [diagOpen, setDiagOpen] = useState(false);
  // Halloween: the waking scene plays once for everyone; the Awakened screen can replay it.
  const [replay, setReplay] = useState(false);
  const showAwakening = !game.loading && (game.awakening || replay);
  // The vigil: a storm gathers over the tower, wilder as midnight nears.
  const vigil = !game.loading && game.phase.kind === 'vigil';
  const strike = useStorm(
    vigil,
    game.phase.kind === 'vigil' ? game.phase.wakesInMs : 0,
    game.save.musicOn ? game.save.musicVolume : 0,
  );
  // The rampage: one mounted run at a time (a new key starts a fresh run).
  const [rampageRun, setRampageRun] = useState<{ key: number; best: number } | null>(null);
  const [counted, setCounted] = useState<'pending' | run.RubbleResult | null>(null);
  // A battle: one mounted at a time, with the creature the player chose.
  const [battle, setBattle] = useState<{ key: number; parts: Parts } | null>(null);
  const startBattle = (creature: 'village' | 'mine') => {
    if (!game.rampage || !game.stitched) return;
    if (!inGame) enter();
    const parts = creature === 'mine' && game.save.sketch ? game.save.sketch : game.parts;
    setRampageRun(null);
    setBattle((b) => ({ key: (b?.key ?? 0) + 1, parts }));
    run.track('battle_start', { creature });
  };
  const startRampage = () => {
    // Only ever the creature everyone built: wait until every night is tallied.
    if (!game.rampage || !game.stitched) return;
    if (!inGame) enter();
    setCounted(null);
    setRampageRun((r) => ({ key: (r?.key ?? 0) + 1, best: game.save.rampage.best }));
    run.track('rampage_start', { day: game.rampage.day });
  };

  /** Owner test mode: jump to a day (or back), starting from its title screen. */
  const preview = async (day: number | null) => {
    setDiagOpen(false);
    setReplay(false);
    setRampageRun(null);
    setBattle(null);
    setChronicle(false);
    setSketchOpen(false);
    onLeave();
    await game.setPreview(day);
  };

  /** Into the laboratory (Continue, or the end of the waking scene). */
  const enter = () => {
    // Start the theme inside this tap: phones only allow sound to begin from a gesture.
    if (game.save.musicOn) theme.setWanted(true);
    game.begin();
    onEnter();
  };

  useEffect(() => {
    if (!game.loading)
      onMusic({ loaded: true, on: game.save.musicOn, volume: game.save.musicVolume });
  }, [game.loading, game.save.musicOn, game.save.musicVolume, onMusic]);

  let screen;
  if (game.loading) screen = <Loading />;
  // From midnight Central that begins Halloween: the rampage menu, title and hub in one.
  else if (game.phase.kind === 'awakened')
    screen = (
      <RampageMenu
        game={game}
        covered={showAwakening || rampageRun !== null || battle !== null}
        onRampage={startRampage}
        onBattle={startBattle}
        onChronicle={() => setChronicle(true)}
        onSketch={openSketch}
        onReplay={() => setReplay(true)}
        onListen={onListen}
      />
    );
  else if (!inGame)
    screen = (
      <Title
        game={game}
        strike={strike}
        onStart={enter}
        onSketch={openSketch}
        onListen={onListen}
      />
    );
  else if (game.phase.kind === 'vigil')
    screen = (
      <Vigil
        game={game}
        strike={strike}
        onChronicle={() => setChronicle(true)}
        onSketch={openSketch}
      />
    );
  else if (game.phase.kind === 'preseason')
    screen = <Preseason game={game} onSketch={openSketch} />;
  else screen = <Vote game={game} onChronicle={() => setChronicle(true)} onSketch={openSketch} />;

  const today =
    game.phase.kind === 'voting'
      ? game.phase.day
      : game.phase.kind === 'vigil' || game.phase.kind === 'awakened'
        ? 999
        : -1;

  return (
    <>
      <div className="landscape-warning">
        <p className="title-sm">Turn your device upright</p>
        <p className="muted">The laboratory only fits in portrait.</p>
      </div>
      {vigil && <div className="storm-rain" aria-hidden="true" />}
      {strike && (
        <div
          key={strike.id}
          className={`storm-flash ${strike.near ? 'near' : ''}`}
          aria-hidden="true"
        />
      )}
      <main className="app">
        {screen}
        <BuildStamp onSecret={() => setDiagOpen(true)} />
      </main>
      {chronicle && (
        <Chronicle save={game.save} today={today} onClose={() => setChronicle(false)} />
      )}
      {sketchOpen && (
        <Sketchbook
          sketch={game.save.sketch}
          real={game.parts}
          myPicks={game.save.myPicks}
          history={game.save.history}
          schedule={game.schedule}
          onChange={game.setSketch}
          onClose={() => setSketchOpen(false)}
        />
      )}
      {showAwakening && (
        <Awakening
          parts={game.parts}
          spark={game.parts.spark ?? null}
          totals={game.totals}
          ready={game.stitched}
          autoStart={replay}
          volume={game.save.musicOn ? game.save.musicVolume : 0}
          onBegin={() => {
            if (game.save.musicOn) theme.setWanted(true);
            onListen();
          }}
          doneLabel={game.save.rampage.brokeOut ? 'See your creature' : 'It breaks out! ⚡'}
          onDone={() => {
            setReplay(false);
            game.markAwake();
            if (!inGame) enter();
            // Then the rampage menu: the first time, it breaks out of the laboratory there.
          }}
        />
      )}
      {rampageRun && game.rampage && (
        <Suspense fallback={<Stirring />}>
          <Rampage
            key={rampageRun.key}
            parts={game.parts}
            venue={game.rampage.venue}
            seed={game.rampage.seed}
            scale={game.rampage.size / BASE_SIZE}
            bounties={game.rampage.bounties}
            upgrades={storyRun(game.save.rampage.levels)}
            volume={game.save.musicOn ? game.save.musicVolume : 0}
            best={rampageRun.best}
            board={game.board}
            contribution={counted}
            onEnd={(result) => {
              setCounted('pending');
              void game.finishRun(result).then(setCounted);
            }}
            onSignIn={(result) => {
              setCounted('pending');
              void game.countAsSignedIn(result).then(setCounted);
            }}
            onAgain={startRampage}
            onQuit={() => setRampageRun(null)}
          />
        </Suspense>
      )}
      {battle && (
        <Suspense fallback={<Stirring />}>
          <Battle
            key={battle.key}
            parts={battle.parts}
            name={run.playerName()}
            volume={game.save.musicOn ? game.save.musicVolume : 0}
            onQuit={() => setBattle(null)}
            onAgain={() => setBattle((b) => (b ? { key: b.key + 1, parts: b.parts } : b))}
          />
        </Suspense>
      )}
      {inGame && game.reveal && !game.resolving && !chronicle && !sketchOpen && !showAwakening && (
        <Reveal
          reveal={game.reveal}
          parts={game.parts}
          phase={game.phase}
          onChronicle={() => {
            game.dismissReveal();
            setChronicle(true);
          }}
          onClose={game.dismissReveal}
        />
      )}
      {diagOpen && (
        <Diagnostics
          preview={game.preview}
          onPreview={(day) => void preview(day)}
          onClose={() => setDiagOpen(false)}
        />
      )}
      {game.preview !== null && (
        <div className="preview-bar" data-testid="preview-bar">
          <span>TEST MODE · {dayLabel(game.preview)} · nothing counts</span>
          <button className="btn btn-secondary btn-small" onClick={() => void preview(null)}>
            Exit
          </button>
        </div>
      )}
      {game.toast && (
        <div key={game.toast.id} className={`toast toast-${game.toast.tone}`} role="status">
          {game.toast.text}
        </div>
      )}
    </>
  );
}

/** Build stamp; tapping it 5 times quickly opens the hidden diagnostics panel. */
function BuildStamp({ onSecret }: { onSecret: () => void }) {
  const taps = useRef<number[]>([]);
  return (
    <p
      className="build-stamp"
      onClick={() => {
        const now = Date.now();
        taps.current = [...taps.current.filter((t) => now - t < 3000), now];
        if (taps.current.length >= 5) {
          taps.current = [];
          onSecret();
        }
      }}
      data-testid="build-stamp"
    >
      build {__BUILD__}
    </p>
  );
}

/** While the rampage or the battle loads. */
function Stirring() {
  return (
    <div className="rampage">
      <p className="rampage-loading">The creature stirs…</p>
    </div>
  );
}

function Loading() {
  return (
    <div className="screen center">
      <h1 className="logo">It's Alive!</h1>
      <p className="muted">Lighting the candles…</p>
    </div>
  );
}

function Title({
  game,
  strike,
  onStart,
  onSketch,
  onListen,
}: {
  game: GameModel;
  strike: Strike | null;
  onStart: () => void;
  onSketch: () => void;
  onListen: () => void;
}) {
  const { phase, save } = game;
  const returning = save.started;
  return (
    <div className="screen title-screen">
      <h1 className="logo">It's Alive!</h1>
      {!returning && (
        <p className="tagline">A monster stitched together by everyone, one vote a night.</p>
      )}
      <Monster
        parts={game.parts}
        spark={phase.kind === 'voting' ? null : (game.parts.spark ?? null)}
        alive={phase.kind === 'awakened'}
        strike={strike}
        className="monster-title"
      />
      {phase.kind === 'voting' && bonusVoteWaiting(save) && (
        <BonusBanner voted={save.votes.length > 0} />
      )}
      <Tonight game={game} />
      {!returning && (
        <div className="panel lore">
          <p>
            Each night the village votes on <b>one body part</b>. At midnight (Central time) the
            most wanted part is stitched onto the creature.
          </p>
          <p>
            On <b>Halloween</b>, lightning will strike… and it will wake.
          </p>
        </div>
      )}
      <button className="btn btn-primary btn-wide" onClick={onStart} data-testid="start">
        {returning ? 'Continue' : 'Enter the Laboratory'}
      </button>
      <JamButton onVote={game.voteInJam} />
      <SketchButton onClick={onSketch} />
      <MusicBar
        on={save.musicOn}
        volume={save.musicVolume}
        onToggle={() => {
          // A tap: phones allow the theme to start right here.
          if (!save.musicOn) theme.setWanted(true);
          onListen();
          game.toggleMusic();
        }}
        onVolume={(v) => {
          onListen();
          game.setVolume(v);
        }}
      />
    </div>
  );
}

/** Where the creature stands tonight: the part being chosen, the clock, and the player's vote. */
function Tonight({ game }: { game: GameModel }) {
  const { phase, save } = game;
  const built = Object.keys(game.parts).length;
  const streak =
    phase.kind === 'voting' && save.stats.lastVotedDay >= phase.day - 1 ? save.stats.streak : 0;
  let body;
  if (phase.kind === 'voting') {
    const mine = save.votes.at(-1);
    body = (
      <>
        <p className="eyebrow">
          Night {phase.day + 1} of {phase.dayCount} · {built} stitched
        </p>
        <p className="tonight-part">
          Tonight: the <b>{phase.question.part}</b>
        </p>
        <p className="tonight-clock">
          Stitched on in <b>{formatCountdown(phase.endsInMs)}</b>
        </p>
        <p className={`tonight-status ${mine ? 'done' : 'todo'}`}>
          {mine
            ? `✓ You voted: ${findOption(mine.optionId)?.option.name ?? mine.optionId}`
            : 'Your vote is waiting.'}
        </p>
        {streak > 1 && <p className="streak">{streak} nights in a row</p>}
      </>
    );
  } else if (phase.kind === 'vigil') {
    body = (
      <>
        <p className="eyebrow">The vigil · all {built} parts stitched</p>
        <p className="tonight-clock">
          It wakes in <b>{formatCountdown(phase.wakesInMs)}</b>
        </p>
        <p className="tonight-status storm">A storm is gathering over the tower…</p>
      </>
    );
  } else if (phase.kind === 'awakened') {
    body = game.rampage ? <RampageCard game={game} /> : null;
  } else {
    body = (
      <>
        <p className="eyebrow">The first night: the head</p>
        <p className="tonight-clock">
          The laboratory opens in <b>{formatCountdown(phase.opensInMs)}</b>
        </p>
      </>
    );
  }
  return (
    <section className="panel tonight" data-testid="tonight">
      {body}
    </section>
  );
}

function Vote({
  game,
  onChronicle,
  onSketch,
}: {
  game: GameModel;
  onChronicle: () => void;
  onSketch: () => void;
}) {
  if (game.phase.kind !== 'voting') return null;
  const { question, day, dayCount, endsInMs } = game.phase;
  const { save } = game;
  const remaining = votesRemaining(save);
  const voted = save.votes.length > 0;
  const pending =
    save.pending && question.options.some((o) => o.id === save.pending) ? save.pending : null;
  const pendingName = pending ? findOption(pending)?.option.name : null;
  const sparkChosen = game.parts.spark ?? null;
  const nextSlot = game.schedule[day + 1];
  const next = nextSlot ? questionForSlot(nextSlot) : null;

  return (
    <div className="screen game">
      <TopBar game={game} onChronicle={onChronicle} subtitle={`Night ${day + 1} of ${dayCount}`} />
      {bonusVoteWaiting(save) && <BonusBanner voted={voted} />}

      <Monster
        parts={game.parts}
        preview={pending ? { slot: question.slot, id: pending } : null}
        nextSlot={question.slot}
        spark={sparkChosen}
      />

      <ProgressRail total={dayCount} today={day} done={Object.keys(save.history).length} />

      <div className="countdown" aria-label="Time until the next stitching">
        <span className="muted">Tonight's part is stitched on in</span>{' '}
        <b>{formatCountdown(endsInMs)}</b>
      </div>
      {game.resolving && (
        <p className="muted small center-text">
          Exhuming past nights… {game.resolving.done}/{game.resolving.total}
        </p>
      )}

      <section className="panel question">
        <p className="eyebrow">Tonight's part · {question.part}</p>
        <h2 className="prompt">{question.prompt}</h2>

        {remaining > 0 ? (
          <>
            {voted && (
              <p className="notice">
                Your extra vote is ready. Pick any part, even the same one again.
              </p>
            )}
            <OptionGrid
              question={question}
              parts={game.parts}
              selected={pending}
              myVotes={save.votes}
              disabled={game.casting}
              onSelect={(id) => game.select(id)}
            />
            <button
              className={`btn btn-primary btn-wide ${pending ? 'sticky-cta' : ''}`}
              disabled={!pending || game.casting}
              onClick={() => void game.cast()}
              data-testid="cast"
            >
              {game.casting
                ? 'Stitching…'
                : pendingName
                  ? `Vote: ${pendingName}`
                  : 'Choose a part above'}
            </button>
          </>
        ) : (
          <>
            <Results
              question={question}
              parts={game.parts}
              counts={game.todayCounts}
              loading={game.countsLoading}
              myVotes={save.votes}
              onRefresh={() => void game.refreshCounts()}
            />
            {canEarnAdVote(save) ? (
              <button
                className="btn btn-ad btn-wide"
                onClick={() => void game.watchAdForVote()}
                disabled={game.adBusy}
                data-testid="ad-vote"
              >
                {game.adBusy
                  ? 'Summoning…'
                  : `Watch an ad to vote again (${MAX_AD_VOTES_PER_DAY - save.adVotesEarned} left)`}
              </button>
            ) : (
              <p className="muted center-text small">
                You've cast all {votesAllowed(save)} of tonight's votes.
              </p>
            )}
            <p className="tomorrow" data-testid="tomorrow">
              {next ? (
                <>
                  Come back after midnight (Central) to see which {question.part.toLowerCase()} is
                  stitched on, and to choose the <b>{next.part.toLowerCase()}</b>. Your streak earns
                  you <b>+1 vote</b> tomorrow.
                </>
              ) : (
                <>
                  This is the last part. Tomorrow the creature lies complete for the vigil, and on{' '}
                  <b>Halloween</b> it wakes.
                </>
              )}
            </p>
          </>
        )}
      </section>
      {voted && remaining > 0 && (
        <section className="panel">
          <p className="eyebrow">The tally so far</p>
          <Results
            question={question}
            parts={game.parts}
            counts={game.todayCounts}
            loading={game.countsLoading}
            myVotes={save.votes}
            onRefresh={() => void game.refreshCounts()}
          />
        </section>
      )}
      <SketchButton onClick={onSketch} />
      {save.stats.streak > 1 && (
        <p className="muted small center-text">You've voted {save.stats.streak} nights in a row.</p>
      )}
    </div>
  );
}

function TopBar({
  game,
  onChronicle,
  subtitle,
}: {
  game: GameModel;
  onChronicle: () => void;
  subtitle?: string;
}) {
  const on = game.save.musicOn;
  const [sound, setSound] = useState(false);
  return (
    <header className="topbar">
      <div>
        <div className="brand">It's Alive!</div>
        {subtitle && <div className="dayline">{subtitle}</div>}
      </div>
      <div className="topbar-actions">
        <button
          className={`btn btn-secondary btn-icon ${on ? '' : 'muted-icon'}`}
          onClick={() => setSound((v) => !v)}
          aria-expanded={sound}
          aria-label={`Sound settings (music ${on ? 'on' : 'off'})`}
          data-testid="music"
        >
          <svg
            viewBox="0 0 24 24"
            width="24"
            height="24"
            aria-hidden="true"
            fill="currentColor"
            style={{ flex: 'none' }}
          >
            <path d="M9 4.5 20 2v13.2a3 3 0 1 1-2-2.83V6.6l-7 1.6v9a3 3 0 1 1-2-2.83Z" />
          </svg>
        </button>
        <button
          className="btn btn-secondary btn-small"
          onClick={onChronicle}
          data-testid="chronicle"
        >
          Chronicle
        </button>
      </div>
      {sound && (
        <SoundPanel
          on={on}
          volume={game.save.musicVolume}
          onToggle={() => {
            // Turning music on is a tap, so start it right here.
            if (!on) theme.setWanted(true);
            game.toggleMusic();
          }}
          onVolume={game.setVolume}
          onClose={() => setSound(false)}
        />
      )}
    </header>
  );
}

/** One notch per night: stitched, tonight, and still to come. */
function ProgressRail({ total, today, done }: { total: number; today: number; done: number }) {
  return (
    <div
      className="rail"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      aria-label={`${done} of ${total} parts stitched`}
    >
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`notch ${i < today ? 'notch-done' : i === today ? 'notch-now' : ''}`}
        />
      ))}
      <span className="rail-label">
        {done} / {total} parts
      </span>
    </div>
  );
}

function Preseason({ game, onSketch }: { game: GameModel; onSketch: () => void }) {
  if (game.phase.kind !== 'preseason') return null;
  return (
    <div className="screen center">
      <h1 className="logo">It's Alive!</h1>
      <Monster parts={{}} nextSlot="head" />
      <p className="prompt">The laboratory opens in</p>
      <p className="big-count">{formatCountdown(game.phase.opensInMs)}</p>
      <p className="muted">The first question: whose head shall crown our creation?</p>
      <SketchButton onClick={onSketch} />
    </div>
  );
}

/** The night before Halloween: every part is chosen, nothing to vote on, the creature waits. */
function Vigil({
  game,
  strike,
  onChronicle,
  onSketch,
}: {
  game: GameModel;
  strike: Strike | null;
  onChronicle: () => void;
  onSketch: () => void;
}) {
  if (game.phase.kind !== 'vigil') return null;
  const { dayCount, wakesInMs } = game.phase;
  const done = Object.keys(game.save.history).length;
  return (
    <div className="screen game">
      <TopBar game={game} onChronicle={onChronicle} subtitle="The vigil" />
      <Monster parts={game.parts} spark={game.parts.spark ?? null} strike={strike} />
      <ProgressRail total={dayCount} today={dayCount} done={done} />
      <div className="countdown" aria-label="Time until it wakes">
        <span className="muted">It wakes in</span> <b>{formatCountdown(wakesInMs)}</b>
      </div>
      {game.resolving && (
        <p className="muted small center-text">
          Exhuming past nights… {game.resolving.done}/{game.resolving.total}
        </p>
      )}
      <section className="panel lore" data-testid="vigil">
        <p className="eyebrow">The night before Halloween</p>
        <p>
          Every part is stitched, and a storm is gathering over the tower. There is no vote tonight:
          keep watch over the slab. When midnight (Central time) strikes and <b>Halloween</b>{' '}
          begins, the lightning comes, and it wakes.
        </p>
      </section>
      <SketchButton onClick={onSketch} />
    </div>
  );
}

/** The rampage today: where it is loose, how tall the village has made it, when it grows next. */
function RampageCard({ game }: { game: GameModel }) {
  const r = game.rampage!;
  const scale = (n: number) => feet(n);
  return (
    <>
      <p className="eyebrow">
        Rampage day {r.day + 1} · {r.stage.name}
      </p>
      <p className="tonight-part">
        It stands <b data-testid="creature-height">{scale(r.size)} ft</b> tall
      </p>
      {r.grewBy > 0 && <p className="streak">It grew {scale(r.grewBy)} ft last night</p>}
      <p className="tonight-clock">
        It grows again in <b>{formatCountdown(r.growsInMs)}</b>
      </p>
      <p className="tonight-status done">
        {r.today === null
          ? 'Counting the rubble…'
          : `${r.today.toLocaleString('en-US')} rubble smashed by everyone today`}
      </p>
    </>
  );
}

/**
 * From Halloween on, home is only the creature, alive over the burning village (it breaks out of
 * the laboratory the first time), and one button: Awaken. That opens the choice: a live Battle
 * (with the village's creature or the player's own build) or the Story run in the day's place,
 * with the rest tucked underneath.
 */
function RampageMenu({
  game,
  covered,
  onRampage,
  onBattle,
  onChronicle,
  onSketch,
  onReplay,
  onListen,
}: {
  game: GameModel;
  /** The waking scene, a run or a battle is on top: the scene waits (and its breakout is not wasted). */
  covered: boolean;
  onRampage: () => void;
  onBattle: (creature: 'village' | 'mine') => void;
  onChronicle: () => void;
  onSketch: () => void;
  onReplay: () => void;
  onListen: () => void;
}) {
  const r = game.rampage;
  const { save } = game;
  const [sheet, setSheet] = useState(false);
  const own = save.sketch !== null && Object.keys(save.sketch).length > 0;
  const [pick, setPick] = useState<'village' | 'mine'>('village');
  const [panel, setPanel] = useState<'main' | 'story'>('main');
  const today = r && save.rampage.day === r.day ? save.rampage.today : 0;
  // The daily reward waits until the creature has broken out (and IT'S LOOSE! has faded) and the
  // home has settled a moment.
  const [settled, setSettled] = useState(false);
  const brokeOutAtStart = useRef(save.rampage.brokeOut);
  useEffect(() => {
    if (!save.rampage.brokeOut) return;
    const t = setTimeout(() => setSettled(true), brokeOutAtStart.current ? 1200 : 4600);
    return () => clearTimeout(t);
  }, [save.rampage.brokeOut]);
  return (
    <div className="home" data-testid="rampage-menu">
      {r && game.stitched && !covered ? (
        <LooseScene
          key={r.stage.id}
          parts={game.parts}
          stage={r.stage}
          size={r.size}
          breakout={!save.rampage.brokeOut}
          volume={save.musicOn ? save.musicVolume : 0}
          onBrokeOut={game.markBrokeOut}
        />
      ) : (
        <div className="loose-scene loose-wait">
          <p className="muted">{game.stitched ? '' : 'Gathering the parts…'}</p>
        </div>
      )}
      {game.rewardWaiting && settled && !covered && !sheet && (
        <DailyReward
          streak={game.rewardStreak}
          best={save.rampage.best}
          onClaim={() => {
            onListen();
            game.claimReward();
          }}
        />
      )}
      <div className="home-foot">
        <AwakenButton
          spark={game.parts.spark}
          ready={game.stitched && !!r}
          still={covered || sheet}
          label={game.stitched ? 'Awaken' : 'Gathering the parts…'}
          onClick={() => {
            onListen();
            setPanel('main');
            setSheet(true);
          }}
        />
      </div>
      {sheet && r && (
        <div className="sheet-backdrop" onClick={() => setSheet(false)}>
          <section
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-label="How it wakes"
            data-testid="mode-sheet"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="sheet-head">
              {panel === 'story' ? (
                <button className="sheet-icon" aria-label="Back" onClick={() => setPanel('main')}>
                  ‹
                </button>
              ) : (
                <span className="sheet-icon" aria-hidden="true" />
              )}
              <h2>{panel === 'story' ? 'Story' : 'Choose your hunt'}</h2>
              <button className="sheet-icon" aria-label="Close" onClick={() => setSheet(false)}>
                ×
              </button>
            </header>
            {panel === 'main' ? (
              <>
                <div className="modes">
                  <button
                    className="mode mode-battle"
                    onClick={() => onBattle(pick === 'mine' && own ? 'mine' : 'village')}
                    data-testid="mode-battle"
                  >
                    <ClawIcon />
                    <b>Battle</b>
                    <span className="mode-tag">Live · 1 min</span>
                    <span className="mode-text">Up to 8 creatures. Biggest at the bell wins.</span>
                  </button>
                  <button
                    className="mode mode-story"
                    onClick={() => {
                      setPanel('story');
                      void game.refreshBoard();
                    }}
                    data-testid="mode-story"
                  >
                    <MoonIcon />
                    <b>Story</b>
                    <span className="mode-tag">Day {r.day + 1} · 1 min</span>
                    <span className="mode-text">Loose in {r.stage.name}</span>
                  </button>
                </div>
                <div className="pick" role="radiogroup" aria-label="Your creature in battle">
                  <span>Battle as</span>
                  <button
                    role="radio"
                    aria-checked={pick === 'village'}
                    className={pick === 'village' ? 'on' : ''}
                    onClick={() => setPick('village')}
                    data-testid="pick-village"
                  >
                    The village's
                  </button>
                  <button
                    role="radio"
                    aria-checked={pick === 'mine'}
                    className={pick === 'mine' ? 'on' : ''}
                    onClick={() => (own ? setPick('mine') : onSketch())}
                    data-testid="pick-mine"
                  >
                    {own ? 'My own' : 'Build my own'}
                  </button>
                </div>
                <div className="sheet-row">
                  <button
                    className="btn btn-secondary"
                    onClick={onSketch}
                    data-testid="sketch-open"
                  >
                    Sketchbook
                  </button>
                  <button className="btn btn-secondary" onClick={onChronicle}>
                    Chronicle
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={onReplay}
                    data-testid="awaken-replay"
                  >
                    Replay
                  </button>
                </div>
                <JamButton onVote={game.voteInJam} />
                <MusicBar
                  on={save.musicOn}
                  volume={save.musicVolume}
                  onToggle={() => {
                    if (!save.musicOn) theme.setWanted(true);
                    onListen();
                    game.toggleMusic();
                  }}
                  onVolume={(v) => {
                    onListen();
                    game.setVolume(v);
                  }}
                />
              </>
            ) : (
              <>
                <div className="story-head">
                  <p className="story-day">Rampage · day {r.day + 1}</p>
                  <h3>Loose in {r.stage.name}</h3>
                  <p className="story-blurb">
                    {r.stage.blurb} It breaks in from the {r.venue.gate}.
                  </p>
                  <div className="story-facts" data-testid="rampage-card">
                    <span>
                      <b data-testid="creature-height">{feet(r.size)} ft</b> tall
                    </span>
                    {r.grewBy > 0 && (
                      <span>
                        <b className="grew">+{feet(r.grewBy)} ft</b> grew last night
                      </span>
                    )}
                    <span>
                      grows in <b>{formatCountdown(r.growsInMs)}</b> · then{' '}
                      <b>{r.next.stage.name}</b>
                    </span>
                  </div>
                </div>
                <button
                  className="btn btn-primary btn-wide"
                  onClick={onRampage}
                  data-testid="rampage-start"
                >
                  Start the rampage
                </button>
                <DayBoard board={game.board} yesterday={game.yesterday} />
                {save.rampage.runs > 0 && (
                  <p className="story-best" data-testid="rampage-best">
                    Your best <b>{big(save.rampage.best)}</b> · today <b>{big(today)}</b> rubble
                  </p>
                )}
                {r.bounties.length > 0 && (
                  <section className="block" data-testid="bounty-board">
                    <h4>Today's bounties</h4>
                    <ul className="checklist">
                      {r.bounties.map((b) => {
                        const done = r.done.includes(b.id);
                        return (
                          <li key={b.id} className={done ? 'done' : ''}>
                            <i aria-hidden="true">{done ? '✓' : ''}</i>
                            <span>{b.text}</span>
                            <em>+{b.bonus}</em>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                )}
                <section className="block upgrades" data-testid="upgrades">
                  <h4>
                    Upgrades <span>{big(save.rampage.purse)} rubble to spend</span>
                  </h4>
                  <ul>
                    {UPGRADES.map((u) => {
                      const at = level(save.rampage.levels, u.id);
                      const price = cost(u, at);
                      return (
                        <li key={u.id}>
                          <div>
                            <b>{u.name}</b>
                            <i>{at >= u.max ? 'max' : `level ${at}`}</i>
                            <span>{u.text}</span>
                          </div>
                          <button
                            className="btn btn-secondary btn-small"
                            disabled={price > save.rampage.purse}
                            onClick={() => game.buyUpgrade(u.id)}
                            data-testid={`buy-${u.id}`}
                          >
                            {at >= u.max ? 'Max' : big(price)}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  <p>Story only: in battle, only the power-ups on the map count.</p>
                </section>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

/** Three claw marks: the battle. */
function ClawIcon() {
  return (
    <PixelArt
      className="mode-icon"
      palette={{ a: '#ffffff', b: '#ffd2bd', c: '#7a1018' }}
      rows={[
        '................',
        '.......a...a...a',
        '......ac..ac..ac',
        '......ac..ac..ac',
        '......ac..ac..ac',
        '......ac..ac..ac',
        '.....ac..ac..ac.',
        '.....ac..ac..ac.',
        '....abc.abc.abc.',
        '....ac..ac..ac..',
        '...abc.abc.abc..',
        '..abc.abc.abc...',
        '..ac..ac..ac....',
        '.ac..ac..ac.....',
        '.a...a...a......',
        '................',
      ]}
    />
  );
}

/** The moon over the village: the story. */
function MoonIcon() {
  return (
    <PixelArt
      className="mode-icon"
      palette={{ a: '#ffc2b0', b: '#ff4a4a', c: '#8a1420' }}
      rows={[
        '................',
        '.....aaa........',
        '...aaaa.........',
        '..aaabb.........',
        '..aabbb.........',
        '.aabbbb.........',
        '.aabbbb.........',
        '.aabbbb.........',
        '.aabbbbb........',
        '.abbbbbbb.......',
        '.bbbbbbbbbbbbbc.',
        '..bbbbbbbbbbbc..',
        '..bbbbbbbbbbcc..',
        '...ccbbbbbbcc...',
        '.....cccccc.....',
        '................',
      ]}
    />
  );
}

/** A little pixel picture: one character per pixel, coloured by `palette` ('.' is clear). */
function PixelArt({
  rows,
  palette,
  className,
}: {
  rows: string[];
  palette: Record<string, string>;
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox={`0 0 ${rows[0]!.length} ${rows.length}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {rows.flatMap((row, y) =>
        [...row].map((c, x) =>
          palette[c] ? (
            <rect key={`${x},${y}`} x={x} y={y} width={1} height={1} fill={palette[c]} />
          ) : null,
        ),
      )}
    </svg>
  );
}

/** A slim ribbon (not a card) telling a player on a streak (voted last night) about their extra vote. */
function BonusBanner({ voted }: { voted: boolean }) {
  return (
    <p className="bonus-banner" role="status" data-testid="bonus-banner">
      <span aria-hidden="true">⚡</span>
      {voted ? 'Your streak vote is waiting' : 'Streak bonus! +1 vote tonight'}
      <span aria-hidden="true">⚡</span>
    </p>
  );
}

/**
 * The October Jam vote: an eye-catching link to the jam page. RUN's sandbox blocks new tabs, so a
 * tap copies the link (the href still serves a long-press or right-click "open in new tab").
 */
function JamButton({ onVote }: { onVote: () => void }) {
  return (
    <a
      className="btn btn-jam btn-wide"
      href={JAM_VOTE_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        e.preventDefault();
        onVote();
      }}
      data-testid="jam-vote"
    >
      <span className="jam-icon" aria-hidden="true">
        🎃
      </span>
      <span className="jam-text">
        <span className="jam-main">Vote in October Jam</span>
        <span className="jam-sub">Tap to copy the vote link 🔗</span>
      </span>
    </a>
  );
}

/** Opens the Sketchbook, where a player can try any parts on their own monster. */
function SketchButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="btn btn-secondary btn-wide" onClick={onClick} data-testid="sketch-open">
      Sketchbook: try any parts
    </button>
  );
}

/** Test mode's label for a day: the vigil, Halloween, or a day of the rampage. */
function dayLabel(day: number): string {
  if (day < 19) return `Night ${day + 1}`;
  if (day === 19) return 'The vigil';
  if (day === 20) return 'Halloween';
  return `Rampage day ${day - 19}`;
}
