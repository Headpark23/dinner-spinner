/**
 * Operation ids for the shared lists (fridge, freezer).
 *
 * A phone can send an operation, the server can apply it, and the reply can be lost. The phone
 * then sends the same operation again. Without an id, "tick one portion" would count twice.
 * Each operation carries an id; the server remembers the most recent ones and skips any repeat.
 */
const KEEP = 300;

export const newOpId = () => `op_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

/** A safe id from untrusted input, or undefined when there is none. */
export const cleanOpId = (raw: unknown): string | undefined =>
  typeof raw === 'string' && raw.trim() ? raw.trim().slice(0, 60) : undefined;

export const alreadyApplied = (applied: string[] | undefined, id: string | undefined): boolean =>
  !!id && !!applied && applied.includes(id);

/** Adds the id to the remembered list (newest last, bounded). */
export const remember = (applied: string[] | undefined, id: string | undefined): string[] | undefined =>
  id ? [...(applied || []), id].slice(-KEEP) : applied;

/** Gives every operation without an id one. Ops that already have an id keep it. */
export const withOpIds = <T extends { opId?: string }>(ops: T[]): T[] =>
  ops.map((op) => (op.opId ? op : { ...op, opId: newOpId() }));
