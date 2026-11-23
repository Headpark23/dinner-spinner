/** Shared voting rooms: a short code lets several phones vote on the same dinner. Kept in server memory. */
export interface RoomState {
  members: unknown[];
  proposedMeal: unknown | null;
  agreedMeal: unknown | null;
  ballot: Record<string, 'yes' | 'no'>;
  targetTime?: string;
}

export interface Room {
  code: string;
  version: number;
  state: RoomState;
  touchedAt: number;
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid read-aloud mix-ups
const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ROOMS = 500;

export const normaliseCode = (raw: unknown): string =>
  String(raw ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 4);

/** Accept only the expected shape so a client can't stash arbitrary data. */
export const cleanState = (raw: any): RoomState | null => {
  if (!raw || typeof raw !== 'object') return null;
  const ballot: Record<string, 'yes' | 'no'> = {};
  if (raw.ballot && typeof raw.ballot === 'object') {
    for (const [k, v] of Object.entries(raw.ballot).slice(0, 20)) {
      if (v === 'yes' || v === 'no') ballot[k.slice(0, 64)] = v;
    }
  }
  return {
    members: Array.isArray(raw.members) ? raw.members.slice(0, 12) : [],
    proposedMeal: raw.proposedMeal && typeof raw.proposedMeal === 'object' ? raw.proposedMeal : null,
    agreedMeal: raw.agreedMeal && typeof raw.agreedMeal === 'object' ? raw.agreedMeal : null,
    ballot,
    targetTime: typeof raw.targetTime === 'string' ? raw.targetTime.slice(0, 5) : undefined,
  };
};

export class RoomStore {
  private rooms = new Map<string, Room>();

  constructor(private now: () => number = Date.now, private random: () => number = Math.random) {}

  private sweep() {
    const cutoff = this.now() - TTL_MS;
    for (const [code, room] of this.rooms) if (room.touchedAt < cutoff) this.rooms.delete(code);
  }

  create(state: RoomState): Room | null {
    this.sweep();
    if (this.rooms.size >= MAX_ROOMS) return null;
    let code = '';
    do {
      code = Array.from({ length: 4 }, () => ALPHABET[Math.floor(this.random() * ALPHABET.length)]).join('');
    } while (this.rooms.has(code));
    const room: Room = { code, version: 1, state, touchedAt: this.now() };
    this.rooms.set(code, room);
    return room;
  }

  get(code: string): Room | null {
    this.sweep();
    const room = this.rooms.get(normaliseCode(code));
    return room ?? null;
  }

  update(code: string, state: RoomState): Room | null {
    const room = this.get(code);
    if (!room) return null;
    room.state = state;
    room.version += 1;
    room.touchedAt = this.now();
    return room;
  }
}
