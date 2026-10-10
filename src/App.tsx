import { useCallback, useEffect, useState } from 'react';
import { useGame, type GameModel } from './app/useGame';
import { useMusic } from './app/useMusic';
import { Chronicle } from './components/Chronicle';
import { Monster } from './components/Monster';
import { TestLab } from './components/TestLab';
import { OptionGrid, Results } from './components/Voting';
import { findOption } from './game/catalog';
import { formatCountdown } from './game/schedule';
import {
  FREE_VOTES_PER_DAY,
  MAX_AD_VOTES_PER_DAY,
  canEarnAdVote,
  votesRemaining,
} from './game/state';
import * as run from './sdk/run';

export default function App() {
  // Bumped whenever Test Lab settings change, to remount the game on the new save/clock.
  const [labKey, setLabKey] = useState(0);
  const [inGame, setInGame] = useState(false);
  const [musicWanted, setMusicWanted] = useState(false);
  // The theme starts with the first tap into the laboratory (a user gesture, so browsers allow it).
  useMusic(inGame && musicWanted);

  // Keep content clear of the host toolbar and device notches.
  useEffect(() => {
    void run.ready().then(() => {
      const s = run.safeArea();
      const root = document.documentElement.style;
      root.setProperty('--safe-top', `${s.top}px`);
      root.setProperty('--safe-bottom', `${s.bottom}px`);
    });
  }, []);

  const onLabChanged = useCallback(() => setLabKey((k) => k + 1), []);
  const onEnter = useCallback(() => setInGame(true), []);

  return (
    <Game
      key={labKey}
      inGame={inGame}
      onEnter={onEnter}
      onMusic={setMusicWanted}
      onLabChanged={onLabChanged}
    />
  );
}

function Game({
  inGame,
  onEnter,
  onMusic,
  onLabChanged,
}: {
  inGame: boolean;
  onEnter: () => void;
  onMusic: (on: boolean) => void;
  onLabChanged: () => void;
}) {
  const game = useGame();
  const [chronicle, setChronicle] = useState(false);
  const [labOpen, setLabOpen] = useState(false);

  useEffect(() => {
    if (!game.loading) onMusic(game.save.musicOn);
  }, [game.loading, game.save.musicOn, onMusic]);

  const lab = run.labState();
  const canLab = !game.loading && run.canUseLab();
  const applyLab = async (next: run.LabState) => {
    setLabOpen(false);
    await run.setLab(next);
    onEnter(); // land in the game on the chosen night
    onLabChanged();
  };
  const wipeLab = async () => {
    setLabOpen(false);
    await run.resetLab();
    onLabChanged();
  };
  const openLab = () => setLabOpen(true);

  let screen;
  if (game.loading) screen = <Loading />;
  else if (!inGame)
    screen = (
      <Title
        game={game}
        onStart={() => {
          game.begin();
          onEnter();
        }}
        onLab={canLab ? openLab : undefined}
      />
    );
  else if (game.phase.kind === 'awakened')
    screen = <Awakened game={game} onChronicle={() => setChronicle(true)} />;
  else if (game.phase.kind === 'preseason') screen = <Preseason game={game} />;
  else screen = <Vote game={game} onChronicle={() => setChronicle(true)} />;

  const today =
    game.phase.kind === 'voting' ? game.phase.day : game.phase.kind === 'awakened' ? 999 : -1;

  return (
    <>
      <div className="landscape-warning">
        <p className="title-sm">Turn your device upright</p>
        <p className="muted">The laboratory only fits in portrait.</p>
      </div>
      {lab.on && !game.loading && (
        <div className="test-banner" role="status" data-testid="test-banner">
          <span>
            <b>TEST MODE</b> · fake votes, private save
          </span>
          <button
            className="btn btn-secondary btn-small"
            onClick={openLab}
            data-testid="lab-banner-open"
          >
            Lab
          </button>
        </div>
      )}
      <main className="app">
        {screen}
        {inGame && canLab && !lab.on && !game.loading && (
          <button
            className="btn btn-secondary btn-wide lab-entry"
            onClick={openLab}
            data-testid="lab-open"
          >
            Test Lab (owner only)
          </button>
        )}
      </main>
      {chronicle && (
        <Chronicle save={game.save} today={today} onClose={() => setChronicle(false)} />
      )}
      {labOpen && (
        <TestLab
          lab={lab}
          onApply={(next) => void applyLab(next)}
          onRefill={() => {
            game.refillVotes();
            setLabOpen(false);
          }}
          onReset={() => void wipeLab()}
          onClose={() => setLabOpen(false)}
        />
      )}
      {game.toast && (
        <div key={game.toast.id} className={`toast toast-${game.toast.tone}`} role="status">
          {game.toast.text}
        </div>
      )}
    </>
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
  onStart,
  onLab,
}: {
  game: GameModel;
  onStart: () => void;
  onLab?: () => void;
}) {
  const built = Object.keys(game.parts).length;
  return (
    <div className="screen title-screen">
      <h1 className="logo">It's Alive!</h1>
      <p className="tagline">A monster stitched together by everyone, one vote a night.</p>
      <Monster
        parts={game.parts}
        alive={game.phase.kind === 'awakened'}
        className="monster-title"
      />
      <div className="panel lore">
        <p>
          Each night the village votes on <b>one body part</b>. At midnight (UTC) the most wanted
          part is stitched onto the creature.
        </p>
        <p>
          On <b>Halloween</b>, lightning will strike… and it will wake.
        </p>
      </div>
      <button className="btn btn-primary btn-wide" onClick={onStart} data-testid="start">
        {game.save.started ? 'Continue' : 'Enter the Laboratory'}
      </button>
      <p className="muted small center-text">
        {built === 0
          ? 'Nothing has been stitched yet.'
          : `${built} part${built === 1 ? '' : 's'} stitched so far.`}
      </p>
      {onLab && (
        <button className="btn btn-secondary btn-wide" onClick={onLab} data-testid="lab-open">
          Test Lab (owner only)
        </button>
      )}
    </div>
  );
}

function Vote({ game, onChronicle }: { game: GameModel; onChronicle: () => void }) {
  if (game.phase.kind !== 'voting') return null;
  const { question, day, dayCount, endsInMs } = game.phase;
  const { save } = game;
  const remaining = votesRemaining(save);
  const voted = save.votes.length > 0;
  const pending =
    save.pending && question.options.some((o) => o.id === save.pending) ? save.pending : null;
  const pendingName = pending ? findOption(pending)?.option.name : null;
  const sparkChosen = game.parts.spark ?? null;

  return (
    <div className="screen game">
      <TopBar game={game} onChronicle={onChronicle} subtitle={`Night ${day + 1} of ${dayCount}`} />

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
                {game.adBusy ? 'Summoning…' : 'Watch an ad to vote again'}
              </button>
            ) : (
              <p className="muted center-text small">
                You've cast all {FREE_VOTES_PER_DAY + MAX_AD_VOTES_PER_DAY} of tonight's votes.
                Return tomorrow for a new part.
              </p>
            )}
          </>
        )}
      </section>
      {voted && remaining > 0 && (
        <section className="panel">
          <p className="eyebrow">The tally so far</p>
          <Results
            question={question}
            counts={game.todayCounts}
            loading={game.countsLoading}
            myVotes={save.votes}
            onRefresh={() => void game.refreshCounts()}
          />
        </section>
      )}
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
  return (
    <header className="topbar">
      <div>
        <div className="brand">It's Alive!</div>
        {subtitle && <div className="dayline">{subtitle}</div>}
      </div>
      <div className="topbar-actions">
        <button
          className={`btn btn-secondary btn-icon ${on ? '' : 'muted-icon'}`}
          onClick={game.toggleMusic}
          aria-pressed={on}
          aria-label={on ? 'Music on. Tap to mute.' : 'Music off. Tap to play.'}
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

function Preseason({ game }: { game: GameModel }) {
  if (game.phase.kind !== 'preseason') return null;
  return (
    <div className="screen center">
      <h1 className="logo">It's Alive!</h1>
      <Monster parts={{}} nextSlot="head" />
      <p className="prompt">The laboratory opens in</p>
      <p className="big-count">{formatCountdown(game.phase.opensInMs)}</p>
      <p className="muted">The first question: whose head shall crown our creation?</p>
    </div>
  );
}

function Awakened({ game, onChronicle }: { game: GameModel; onChronicle: () => void }) {
  return (
    <div className="screen game">
      <TopBar game={game} onChronicle={onChronicle} />
      <h1 className="logo logo-alive">IT'S ALIVE!</h1>
      <Monster parts={game.parts} spark={game.parts.spark ?? 'spark_lightning'} alive />
      {game.resolving && (
        <p className="muted small center-text">
          Exhuming past nights… {game.resolving.done}/{game.resolving.total}
        </p>
      )}
      <section className="panel lore">
        <p>
          All Hallows' Eve. The {Object.keys(game.parts).length} parts you chose have been stitched
          together, and the creature stirs on its slab.
        </p>
        <p className="muted">What it does next… you will soon discover.</p>
      </section>
    </div>
  );
}
