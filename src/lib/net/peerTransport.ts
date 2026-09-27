import Peer from 'peerjs';
import type { DataConnection } from 'peerjs';
import type { Transport } from './transport';

const PREFIX = 'swindlestones-';
// No 0/O or 1/I, so a code read out over the phone isn't misheard.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 5;

function newCode(): string {
  return Array.from({ length: CODE_LENGTH }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
}

/** Tidies what someone typed or pasted into the form of a room code. */
export function normaliseCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function wrap(connection: DataConnection, peer: Peer): Transport {
  return {
    send: (message) => {
      if (connection.open) connection.send(message);
    },
    onMessage: (handler) => {
      connection.on('data', handler);
    },
    onClose: (handler) => {
      connection.on('close', handler);
      connection.on('error', handler);
    },
    close: () => {
      connection.close();
      peer.destroy();
    },
  };
}

export interface Room {
  code: string;
  /** Settles once a friend has joined, with the line to them. */
  friend: Promise<Transport>;
  /** Gives up waiting and frees the code. */
  cancel(): void;
}

/**
 * Opens a room others can join with its short code. There is no server of ours
 * in this: the two browsers find each other through PeerJS's free public
 * matchmaking service and then talk directly.
 */
export function createRoom(): Promise<Room> {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const open = () => {
      const code = newCode();
      const peer = new Peer(PREFIX + code);
      let joined = false;
      let arrived: (transport: Transport) => void = () => undefined;
      let failed: (error: Error) => void = () => undefined;
      const friend = new Promise<Transport>((res, rej) => {
        arrived = res;
        failed = rej;
      });
      // Nobody may be listening yet: a failure while waiting is reported when they ask.
      friend.catch(() => undefined);

      peer.on('open', () => {
        resolve({
          code,
          friend,
          cancel: () => peer.destroy(),
        });
      });
      peer.on('connection', (connection) => {
        // One friend only.
        if (joined) {
          connection.close();
          return;
        }
        joined = true;
        connection.on('open', () => arrived(wrap(connection, peer)));
      });
      peer.on('error', (error) => {
        if ((error as { type?: string }).type === 'unavailable-id' && attempts++ < 5) {
          peer.destroy();
          open();
        } else if (!joined) {
          failed(error);
          reject(error);
        }
      });
    };
    open();
  });
}

/** Joins a friend's room by its code. */
export function joinRoom(rawCode: string): Promise<Transport> {
  const code = normaliseCode(rawCode);
  return new Promise((resolve, reject) => {
    const peer = new Peer();
    const giveUp = setTimeout(() => {
      peer.destroy();
      reject(new Error("Couldn't reach that room. Check the code and try again."));
    }, 20000);
    peer.on('open', () => {
      const connection = peer.connect(PREFIX + code, { reliable: true });
      connection.on('open', () => {
        clearTimeout(giveUp);
        resolve(wrap(connection, peer));
      });
    });
    peer.on('error', (error) => {
      clearTimeout(giveUp);
      peer.destroy();
      const type = (error as { type?: string }).type;
      reject(new Error(type === 'peer-unavailable' ? 'There is no room with that code.' : "Couldn't connect. Check your connection and try again."));
    });
  });
}
