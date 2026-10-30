import { useCallback, useEffect, useRef, useState } from 'react';
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
import { LooseScene } from './components/LooseScene';
import { Rampage } from './components/Rampage';
import { OptionGrid, Results } from './components/Voting';
import { findOption, questionForSlot } from './game/catalog';
import { formatCountdown } from './game/schedule';
import { BASE_SIZE, feet } from './game/rampage';
import {
  DEFAULT_MUSIC_VOLUME,
  MAX_AD_VOTES_PER_DAY,
  bonusVoteWaiting,
  canEarnAdVote,
  votesAllowed,
  votesRemaining,
} from './game/state';
import * as run from './sdk/run';

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
  const onListen = useCallback(() => setListening(true), []);

  return <Game inGame={inGame} onEnter={onEnter} onListen={onListen} onMusic={setMusic} />;
}

interface MusicPrefs {
  loaded: boolean;
  on: boolean;
  volume: number;
}

function Game({
  inGame,
  onEnter,
  onListen,
  onMusic,
}: {
  inGame: boolean;
  onEnter: () => void;
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
  const startRampage = () => {
    // Only ever the creature everyone built: wait until every night is tallied.
    if (!game.rampage || !game.stitched) return;
    if (!inGame) enter();
    setCounted(null);
    setRampageRun((r) => ({ key: (r?.key ?? 0) + 1, best: game.save.rampage.best }));
    run.track('rampage_start', { day: game.rampage.day });
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
        covered={showAwakening || rampageRun !== null}
        onRampage={startRampage}
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
        <Rampage
          key={rampageRun.key}
          parts={game.parts}
          stage={game.rampage.stage}
          seed={game.rampage.seed}
          scale={game.rampage.size / BASE_SIZE}
          volume={game.save.musicOn ? game.save.musicVolume : 0}
          best={rampageRun.best}
          contribution={counted}
          onEnd={(result) => {
            setCounted('pending');
            void game.finishRun(result).then(setCounted);
          }}
          onSignIn={(rubble) => {
            setCounted('pending');
            void game.countAsSignedIn(rubble).then(setCounted);
          }}
          onAgain={startRampage}
          onQuit={() => setRampageRun(null)}
        />
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
      {diagOpen && <Diagnostics onClose={() => setDiagOpen(false)} />}
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
 * From Halloween on: the rampage menu (title and hub in one). The creature, loose over the day's
 * place (it breaks out of the laboratory the first time), the big Rampage button, where it is and
 * how tall the village has made it, and the rest.
 */
function RampageMenu({
  game,
  covered,
  onRampage,
  onChronicle,
  onSketch,
  onReplay,
  onListen,
}: {
  game: GameModel;
  /** The waking scene or a run is on top: the scene waits (and its breakout is not wasted). */
  covered: boolean;
  onRampage: () => void;
  onChronicle: () => void;
  onSketch: () => void;
  onReplay: () => void;
  onListen: () => void;
}) {
  const r = game.rampage;
  const { save } = game;
  return (
    <div className="screen rampage-menu" data-testid="rampage-menu">
      <header className="menu-head">
        <h1 className="logo menu-logo">It's Alive!</h1>
        <button className="btn btn-secondary btn-small" onClick={onChronicle}>
          Chronicle
        </button>
      </header>
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
      {r && (
        <div className="menu-where">
          <p className="eyebrow">Loose in {r.stage.name}</p>
          <p className="muted">{r.stage.blurb}</p>
        </div>
      )}
      <button
        className="btn btn-primary btn-wide btn-rampage"
        onClick={onRampage}
        disabled={!game.stitched || !r}
        data-testid="rampage-start"
      >
        {game.stitched ? 'Rampage! ⚡' : 'Gathering the parts…'}
      </button>
      {r && (
        <section className="panel tonight" data-testid="rampage-card">
          <RampageCard game={game} />
          {save.rampage.runs > 0 && (
            <p className="muted small">
              Your best: {save.rampage.best.toLocaleString('en-US')} rubble · today{' '}
              {save.rampage.day === r.day ? save.rampage.today.toLocaleString('en-US') : 0}
            </p>
          )}
        </section>
      )}
      <JamButton onVote={game.voteInJam} />
      <button className="btn btn-secondary btn-wide" onClick={onReplay} data-testid="awaken-replay">
        Watch it wake again
      </button>
      <SketchButton onClick={onSketch} />
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
    </div>
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
