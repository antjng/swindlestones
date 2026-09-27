import { describe, expect, it } from 'vitest';
import type { Bid } from '../game/types';
import { OnlineSession } from './session';
import type { SessionUpdate } from './session';
import { memoryPair } from './transport';

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

async function connect(seed = 7) {
  const [a, b] = memoryPair();
  const host = new OnlineSession('host', a, seed);
  const guest = new OnlineSession('guest', b);
  const hostSaw: SessionUpdate[] = [];
  const guestSaw: SessionUpdate[] = [];
  host.onUpdate((update) => hostSaw.push(update));
  guest.onUpdate((update) => guestSaw.push(update));
  host.begin();
  await settle();
  return { host, guest, hostSaw, guestSaw };
}

describe('OnlineSession', () => {
  it('gives both sides the empty table to begin with', async () => {
    const { hostSaw, guestSaw } = await connect();
    expect(hostSaw.at(-1)?.kind).toBe('reset');
    expect(guestSaw.at(-1)?.kind).toBe('reset');
    expect(guestSaw.at(-1)?.state.phase).toBe('awaitingRoll');
  });

  it('deals each player their own dice and hides the other player’s faces', async () => {
    const { host, hostSaw, guestSaw } = await connect();
    host.requestStart();
    await settle();
    const h = hostSaw.at(-1)!.state;
    const g = guestSaw.at(-1)!.state;
    expect(h.phase).toBe('bidding');
    expect(h.hands.player).toHaveLength(5);
    expect(g.hands.player).toHaveLength(5);
    // Whatever the guest holds, the host sees only placeholders, and the other way round.
    expect(h.hands.ai).toEqual([1, 1, 1, 1, 1]);
    expect(g.hands.ai).toEqual([1, 1, 1, 1, 1]);
    // The guest's view is turned round: whose turn it is agrees.
    expect(g.turn).not.toBe(h.turn);
  });

  it('lets either player start the round, once', async () => {
    const { guest, hostSaw, guestSaw } = await connect();
    guest.requestStart();
    guest.requestStart();
    await settle();
    expect(hostSaw.filter((u) => u.kind === 'start')).toHaveLength(1);
    expect(guestSaw.filter((u) => u.kind === 'start')).toHaveLength(1);
    expect(guestSaw.at(-1)?.by).toBe('player');
    expect(hostSaw.at(-1)?.by).toBe('ai');
  });

  it('plays a round to a call, revealing both hands to both sides', async () => {
    const { host, guest, hostSaw, guestSaw } = await connect();
    host.requestStart();
    await settle();

    const first = hostSaw.at(-1)!.state.turn;
    const opener = first === 'player' ? host : guest;
    const other = first === 'player' ? guest : host;
    const bid: Bid = { quantity: 1, face: 1 };
    opener.bid(bid);
    await settle();
    expect(hostSaw.at(-1)?.kind).toBe('bid');
    expect(hostSaw.at(-1)?.state.currentBid).toEqual(bid);
    expect(guestSaw.at(-1)?.state.currentBid).toEqual(bid);

    other.call();
    await settle();
    const h = hostSaw.at(-1)!.state;
    const g = guestSaw.at(-1)!.state;
    expect(h.phase).toBe('roundOver');
    expect(h.hands.ai.every((face) => face >= 1 && face <= 4)).toBe(true);
    // Both sides agree who lost a die, each in their own terms.
    expect(g.lastCallResult?.loser).not.toBe(h.lastCallResult?.loser);
    expect(h.diceCounts.player).toBe(g.diceCounts.ai);
    expect(h.diceCounts.ai).toBe(g.diceCounts.player);
    // The hands the guest sees are the host's, the other way round.
    expect(g.hands.player).toEqual(h.hands.ai);
    expect(g.hands.ai).toEqual(h.hands.player);
  });

  it('ignores a bid made out of turn, and an illegal one', async () => {
    const { host, guest, hostSaw } = await connect();
    host.requestStart();
    await settle();
    const first = hostSaw.at(-1)!.state.turn;
    const wrongOne = first === 'player' ? guest : host;
    const seen = hostSaw.length;
    wrongOne.bid({ quantity: 1, face: 1 });
    await settle();
    expect(hostSaw).toHaveLength(seen);

    const rightOne = first === 'player' ? host : guest;
    rightOne.bid({ quantity: 99, face: 4 });
    await settle();
    expect(hostSaw).toHaveLength(seen);
  });

  it('tells the other side when the connection closes', async () => {
    const { host, guest } = await connect();
    let closed = false;
    host.onClose(() => (closed = true));
    guest.close();
    await settle();
    expect(closed).toBe(true);
    expect(host.isOpen).toBe(false);
  });
});
