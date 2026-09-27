import type { MatchState } from '../game/match';
import type { Bid } from '../game/types';

/** What the guest can ask of the host. The host decides, so neither side can cheat the rules or see the other's dice early. */
export type GuestRequest = { t: 'start' } | { t: 'bid'; bid: Bid } | { t: 'call' } | { t: 'rematch' };

/** What kind of thing just happened, so the screen can play it out. */
export type UpdateKind = 'start' | 'bid' | 'call' | 'reset';

/** The host tells the guest the state of the match, always from the guest's own point of view. */
export interface HostUpdate {
  t: 'update';
  kind: UpdateKind;
  /** Who did it, from the receiver's point of view. */
  by: 'player' | 'ai';
  state: MatchState;
}

export type HostMessage = HostUpdate | { t: 'welcome' };
export type Message = GuestRequest | HostMessage | { t: 'hello' };
