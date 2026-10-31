/**
 * The live battle, on RUN's server: one BattleHost (src/game/battleHost.ts) per room, ticked 20
 * times a second. Players say hello with the creature they built and steer it; empty seats (and
 * anyone who leaves) are played by bots. A short lobby lets friends arrive together, then three
 * minutes of battle, then the standings.
 */
import { GameRoom, type GameMessage, type Player } from '@series-inc/rundot-game-sdk/mp-server';
import { BattleHost, type HostMsg } from '../game/battleHost';
import { TICK_MS, type BattleProtocol } from '../game/battleWire';

export default class BattleRoom extends GameRoom<BattleProtocol> {
  private host!: BattleHost;

  onCreate() {
    this.host = new BattleHost(`battle:${this.roomId}`);
    this.clock.setInterval('tick', () => this.tick(), TICK_MS);
  }

  onPlayerJoin() {
    if (!this.host.open) this.reject({ reason: 'This battle is nearly over' });
  }

  onGameMessage(message: GameMessage<BattleProtocol>) {
    const { sender, payload } = message;
    if (payload.type === 'hello') {
      const joined = this.host.join(sender.id, payload.name || sender.username, payload.parts);
      if (!joined) return;
      this.sendTo(sender.id, joined.match);
      this.send(joined.all);
    } else if (payload.type === 'steer') this.host.steer(sender.id, payload.x, payload.y);
  }

  onPlayerLeave(player: Player) {
    this.send(this.host.leave(player.id));
  }

  private tick() {
    this.send(this.host.tick());
    if (!this.host.open && !this.locked) this.lock();
    if (this.host.phase === 'over') this.clock.clear('tick');
  }

  private send(messages: HostMsg[]) {
    for (const m of messages) this.broadcast(m);
  }
}
