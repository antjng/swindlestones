import { isValidNextBid } from '../game/bid';
import { createInitialMatchState, reduce } from '../game/match';
import type { MatchState } from '../game/match';
import { mulberry32, randomSeed } from '../game/rng';
import type { Rng } from '../game/rng';
import type { Bid } from '../game/types';
import type { GuestRequest, HostUpdate, UpdateKind } from './protocol';
import type { Transport } from './transport';
import { viewFor } from './view';

export type Role = 'host' | 'guest';

/** Something that happened in the match, as this player should see it. */
export interface SessionUpdate {
  kind: UpdateKind;
  /** Who did it: you ('player') or the person across the table ('ai'). */
  by: 'player' | 'ai';
  state: MatchState;
}

/**
 * One end of a game between two people. The host keeps the real match and
 * deals the dice; the guest asks for things and is told what happened. Each
 * side only ever receives the match as they may see it, so neither can peek
 * at the other's dice.
 */
export class OnlineSession {
  private state: MatchState;
  private readonly rng: Rng;
  private updateHandler: (update: SessionUpdate) => void = () => undefined;
  private closeHandler: () => void = () => undefined;
  private closed = false;

  constructor(
    readonly role: Role,
    private readonly transport: Transport,
    seed: number = randomSeed(),
  ) {
    this.rng = mulberry32(seed);
    this.state = createInitialMatchState(this.rng);
    transport.onMessage((message) => this.receive(message));
    transport.onClose(() => {
      this.closed = true;
      this.closeHandler();
    });
  }

  onUpdate(handler: (update: SessionUpdate) => void): void {
    this.updateHandler = handler;
  }

  onClose(handler: () => void): void {
    this.closeHandler = handler;
  }

  get isOpen(): boolean {
    return !this.closed;
  }

  /** Call once the screen is listening: the host gives both sides the empty table, and the guest asks the host for it. */
  begin(): void {
    if (this.role === 'host') this.publish('reset', 'player');
    else this.transport.send({ t: 'hello' });
  }

  requestStart(): void {
    this.request({ t: 'start' });
  }

  bid(bid: Bid): void {
    this.request({ t: 'bid', bid });
  }

  call(): void {
    this.request({ t: 'call' });
  }

  rematch(): void {
    this.request({ t: 'rematch' });
  }

  close(): void {
    this.closed = true;
    this.transport.close();
  }

  private request(request: GuestRequest): void {
    if (this.closed) return;
    if (this.role === 'host') this.act('player', request);
    else this.transport.send(request);
  }

  private receive(message: unknown): void {
    if (typeof message !== 'object' || message === null || !('t' in message)) return;
    const data = message as { t: string };
    if (this.role === 'host') {
      if (data.t === 'hello') this.publish('reset', 'player');
      else if (data.t === 'start' || data.t === 'bid' || data.t === 'call' || data.t === 'rematch') this.act('ai', message as GuestRequest);
    } else if (data.t === 'update') {
      const update = message as HostUpdate;
      this.updateHandler({ kind: update.kind, by: update.by, state: update.state });
    }
  }

  /** The host applies a request from one of the two players, if the rules allow it, and tells both what happened. */
  private act(by: 'player' | 'ai', request: GuestRequest): void {
    const before = this.state;
    try {
      switch (request.t) {
        case 'start':
          // Either player can press the button, but the round only starts once.
          if (before.phase !== 'awaitingRoll' && before.phase !== 'roundOver') return;
          this.state = reduce(before, { type: 'startRound' }, this.rng);
          this.publish('start', by);
          return;
        case 'bid': {
          const bid = request.bid;
          if (!bid || !Number.isInteger(bid.quantity) || !Number.isInteger(bid.face)) return;
          if (before.phase !== 'bidding' || before.turn !== by) return;
          if (!isValidNextBid(bid, before.currentBid, before.diceCounts.player + before.diceCounts.ai)) return;
          this.state = reduce(before, { type: 'bid', by, bid }, this.rng);
          this.publish('bid', by);
          return;
        }
        case 'call':
          if (before.phase !== 'bidding' || before.turn !== by || before.currentBid === null) return;
          this.state = reduce(before, { type: 'call', by }, this.rng);
          this.publish('call', by);
          return;
        case 'rematch':
          if (before.phase !== 'matchOver') return;
          this.state = createInitialMatchState(this.rng);
          this.publish('reset', by);
          return;
      }
    } catch {
      // The rules said no; the state is unchanged and nothing is announced.
      this.state = before;
    }
  }

  private publish(kind: UpdateKind, by: 'player' | 'ai'): void {
    const mine: SessionUpdate = { kind, by, state: viewFor(this.state, 'player') };
    const theirs: HostUpdate = { t: 'update', kind, by: by === 'player' ? 'ai' : 'player', state: viewFor(this.state, 'ai') };
    if (!this.closed) this.transport.send(theirs);
    this.updateHandler(mine);
  }
}
