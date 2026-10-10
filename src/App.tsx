import { useEffect, useState } from 'react';
import { useGame, type GameModel } from './app/useGame';
import { Chronicle } from './components/Chronicle';
import { Monster } from './components/Monster';
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
  const game = useGame();
  const [inGame, setInGame] = useState(false);
  const [chronicle, setChronicle] = useState(false);

  // Keep content clear of the host toolbar and device notches.
  useEffect(() => {
    void run.ready().then(() => {
      const s = run.safeArea();
      const root = document.documentElement.style;
      root.setProperty('--safe-top', `${s.top}px`);
      root.setProperty('--safe-bottom', `${s.bottom}px`);
    });
  }, []);

  let screen;
  if (game.loading) screen = <Loading />;
  else if (!inGame)
    screen = (
      <Title
        game={game}
        onStart={() => {
          game.begin();
          setInGame(true);
        }}
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
      <main className="app">{screen}</main>
      {chronicle && (
        <Chronicle save={game.save} today={today} onClose={() => setChronicle(false)} />
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

function Title({ game, onStart }: { game: GameModel; onStart: () => void }) {
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
      <header className="topbar">
        <div>
          <div className="brand">It's Alive!</div>
          <div className="dayline">
            Night {day + 1} of {dayCount}
          </div>
        </div>
        <button
          className="btn btn-secondary btn-small"
          onClick={onChronicle}
          data-testid="chronicle"
        >
          Chronicle
        </button>
      </header>

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
      <header className="topbar">
        <div className="brand">It's Alive!</div>
        <button className="btn btn-secondary btn-small" onClick={onChronicle}>
          Chronicle
        </button>
      </header>
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
