import { listLegalNextBids } from './bid';
import { countFace } from './dice';
import { binomialPmf, probAtLeast } from './probability';
import type { Rng } from './rng';
import { FACES } from './types';
import type { Bid, DiceHand, Face } from './types';

export interface AiConfig {
  /** How randomly it picks among good bids: near 0 always plays the best one, higher varies its play. */
  readonly temperature: number;
  /** 0 to 1: how much it likes bids its own dice don't back up. */
  readonly bluffiness: number;
  /** How much better calling has to be than the best raise before it calls. */
  readonly callMargin: number;
}

export const DEFAULT_AI_CONFIG: AiConfig = {
  temperature: 0.16,
  bluffiness: 0.4,
  callMargin: 0.04,
};

export type AiDecision = { readonly type: 'bid'; readonly bid: Bid } | { readonly type: 'call' };

/** Faces of unseen dice are assumed uniform over 1-4. */
const FACE_PROBABILITY = 0.25;

/**
 * What the AI has learned about the player: how often their bids hold up when
 * called, how often they call its bids, and which faces they have bid this round.
 */
export class AiMemory {
  private bidsThisRound: Bid[] = [];
  private honestBids = 2;
  private testedBids = 4;
  private callsMade = 1;
  private bidsAnswered = 3;

  startRound(): void {
    this.bidsThisRound = [];
  }

  recordPlayerBid(bid: Bid): void {
    this.bidsThisRound.push(bid);
  }

  /** The player answered one of the AI's bids by calling it or by raising. */
  recordPlayerResponse(called: boolean): void {
    this.bidsAnswered++;
    if (called) this.callsMade++;
  }

  /** One of the player's bids was called, and either held up or didn't. */
  recordPlayerBidTested(wasTrue: boolean): void {
    this.testedBids++;
    if (wasTrue) this.honestBids++;
  }

  get playerBids(): readonly Bid[] {
    return this.bidsThisRound;
  }

  /** Roughly how often the player's bids turn out to be true. */
  get playerHonesty(): number {
    return this.honestBids / this.testedBids;
  }

  get playerCallRate(): number {
    return this.callsMade / this.bidsAnswered;
  }
}

/** Chance that each unseen die shows each face, leaning toward faces the player has been bidding on. */
function faceOdds(memory?: AiMemory): Record<Face, number> {
  const weights = { 1: 1, 2: 1, 3: 1, 4: 1 } as Record<Face, number>;
  if (memory) {
    for (const face of FACES) {
      const timesBid = memory.playerBids.filter((bid) => bid.face === face).length;
      weights[face] += memory.playerHonesty * 0.7 * Math.min(timesBid, 2);
    }
  }
  const sum = FACES.reduce((total, face) => total + weights[face], 0);
  for (const face of FACES) weights[face] /= sum;
  return weights;
}

export function probabilityBidIsTrue(bid: Bid, ownHand: DiceHand, opponentDiceCount: number): number {
  return chanceBidIsTrue(bid, ownHand, opponentDiceCount, { 1: 0.25, 2: 0.25, 3: 0.25, 4: 0.25 });
}

function chanceBidIsTrue(bid: Bid, ownHand: DiceHand, opponentDiceCount: number, odds: Record<Face, number>): number {
  const needed = bid.quantity - countFace(ownHand, bid.face);
  if (needed <= 0) return 1;
  if (needed > opponentDiceCount) return 0;
  return probAtLeast(opponentDiceCount, needed, odds[bid.face]);
}

/**
 * How believable the bid looks to the player, who can see only their own
 * dice: the chance it's true averaged over what their hand might be.
 */
function plausibility(bid: Bid, ownDiceCount: number, opponentDiceCount: number): number {
  let sum = 0;
  for (let held = 0; held <= opponentDiceCount; held++) {
    sum += binomialPmf(opponentDiceCount, held, FACE_PROBABILITY) * probAtLeast(ownDiceCount, bid.quantity - held, FACE_PROBABILITY);
  }
  return sum;
}

function pickWeighted<T>(items: readonly { item: T; score: number }[], temperature: number, rng: Rng): T {
  const best = Math.max(...items.map((entry) => entry.score));
  const weights = items.map((entry) => Math.exp((entry.score - best) / Math.max(temperature, 1e-3)));
  let roll = rng() * weights.reduce((sum, w) => sum + w, 0);
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return items[i].item;
  }
  return items[items.length - 1].item;
}

export function decideAiAction(
  currentBid: Bid | null,
  ownHand: DiceHand,
  opponentDiceCount: number,
  config: AiConfig,
  rng: Rng,
  memory?: AiMemory,
): AiDecision {
  const totalDice = ownHand.length + opponentDiceCount;
  const legalBids = listLegalNextBids(currentBid, totalDice);
  const odds = faceOdds(memory);

  // Losing its last dice hurts more, and the player's last dice are the ones worth taking.
  const lossWeight = ownHand.length === 1 ? 1.7 : ownHand.length === 2 ? 1.25 : 1;
  const gainWeight = opponentDiceCount === 1 ? 1.4 : 1;
  const value = (bidIsTrueChance: number, callerIsPlayer: boolean) =>
    callerIsPlayer
      ? gainWeight * bidIsTrueChance - lossWeight * (1 - bidIsTrueChance)
      : gainWeight * (1 - bidIsTrueChance) - lossWeight * bidIsTrueChance;

  // A player who calls a lot should be met with honest bids; one who never calls can be bluffed.
  const callFactor = memory ? 0.5 + memory.playerCallRate : 0.85;

  const scored = legalBids.map((bid) => {
    const trueChance = chanceBidIsTrue(bid, ownHand, opponentDiceCount, odds);
    const looksTrue = plausibility(bid, ownHand.length, opponentDiceCount);
    // The less believable the bid looks, the likelier the player is to call it.
    const callChance = Math.min(0.97, Math.max(0.02, callFactor / (1 + Math.exp(8 * (looksTrue - 0.5)))));
    const ifCalled = value(trueChance, true);
    const ifRaised = 0.2 * (2 * trueChance - 1) - 0.1 * (bid.quantity / totalDice);
    const bluffAppeal = config.bluffiness * 0.3 * (1 - callChance) * (1 - trueChance);
    return { item: bid, score: callChance * ifCalled + (1 - callChance) * ifRaised + bluffAppeal };
  });

  if (currentBid !== null) {
    const bestRaise = scored.length > 0 ? Math.max(...scored.map((entry) => entry.score)) : -Infinity;
    const callValue = value(chanceBidIsTrue(currentBid, ownHand, opponentDiceCount, odds), false);
    if (scored.length === 0 || callValue > bestRaise + config.callMargin) return { type: 'call' };
  }

  return { type: 'bid', bid: pickWeighted(scored, config.temperature, rng) };
}
