export type Face = 1 | 2 | 3 | 4;

export const FACES: readonly Face[] = [1, 2, 3, 4];

export type PlayerId = 'player' | 'ai';

export type DiceHand = readonly Face[];

export interface Bid {
  readonly quantity: number;
  readonly face: Face;
}

export function opponentOf(player: PlayerId): PlayerId {
  return player === 'player' ? 'ai' : 'player';
}
