import type { DayBoard as Board } from '../sdk/run';
import { big } from '../game/numbers';

const PLACES = ['1st', '2nd', '3rd'];

/**
 * The day's most monstrous: its top three story runs (everyone plays the same venue), and the
 * player's own place. `yesterday` adds the day before's winner.
 */
export function DayBoard({
  board,
  yesterday,
  compact = false,
}: {
  board: Board | null;
  yesterday?: Board | null;
  compact?: boolean;
}) {
  const champ = yesterday?.top[0];
  return (
    <section className={`block day-board${compact ? ' compact' : ''}`} data-testid="day-board">
      <h4>Today's most monstrous</h4>
      {!board ? (
        <p className="day-board-wait">Reading the day's board…</p>
      ) : board.top.length === 0 ? (
        <p className="day-board-wait">Nobody yet. The day is yours to take.</p>
      ) : (
        <ol className="podium">
          {board.top.map((e, i) => (
            <li key={e.id} className={`place-${i + 1}${e.me ? ' me' : ''}`}>
              <i>{PLACES[i]}</i>
              <span>{e.me ? `${e.name} (you)` : e.name}</span>
              <b>{big(e.score)}</b>
            </li>
          ))}
        </ol>
      )}
      {board && (
        <p className="day-board-mine" data-testid="day-board-mine">
          {board.mine
            ? board.mine.rank > 3
              ? `You: #${board.mine.rank} today with ${big(board.mine.score)}`
              : 'You are on the podium!'
            : 'Rampage to get on the board. It starts fresh at midnight.'}
        </p>
      )}
      {champ && !compact && (
        <p className="day-board-champ" data-testid="day-board-champ">
          Yesterday's most monstrous: <b>{champ.name}</b> with {big(champ.score)}
        </p>
      )}
    </section>
  );
}
