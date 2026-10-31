/**
 * An offline battle: the same BattleHost the server runs, on the phone, with bots in every other
 * seat. Used when a live room can't be joined (a guest who won't sign in, no connection, the
 * service down), so a battle is always possible. It speaks the same messages as a live room.
 */
import { BattleHost } from '../game/battleHost';
import { TICK_MS, type BattleProtocol } from '../game/battleWire';
import type { BattleLink } from '../sdk/run';

export function localBattle(seconds?: number): BattleLink {
  const host = new BattleHost(`offline:${Date.now()}:${Math.random()}`, seconds, 2.5);
  const you = 'you';
  let handlers: { onMessage?: (m: BattleProtocol) => void } = {};
  let timer: ReturnType<typeof setInterval> | null = null;
  const deliver = (m: BattleProtocol) => handlers.onMessage?.(m);
  return {
    playerId: you,
    send(message) {
      if (message.type === 'hello') {
        const joined = host.join(you, message.name, message.parts);
        if (!joined) return;
        deliver(joined.match);
        joined.all.forEach(deliver);
        timer ??= setInterval(() => {
          host.tick().forEach(deliver);
          if (host.phase === 'over' && timer) {
            clearInterval(timer);
            timer = null;
          }
        }, TICK_MS);
      } else if (message.type === 'steer') host.steer(you, message.x, message.y);
    },
    on(h) {
      handlers = h;
    },
    leave() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}
