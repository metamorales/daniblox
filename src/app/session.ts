/**
 * What this visit starts from (spec R8), decided before the world exists.
 *
 * A share link wins, then the save, then a fresh meadow. Each failure has a
 * sentence for the player rather than a silent default, and a save written
 * by a newer build is left untouched instead of being overwritten.
 */

import { decodeVoxels, openStore, parseSave, type SaveFile, type Store } from './persistence';
import { decodeShare } from './share';

export const DEFAULT_SEED = 20_260_409;

export interface Session {
  readonly store: Store;
  readonly seed: number;
  /** The whole world from the save, to load over the generated one. */
  readonly voxels: Uint8Array | null;
  /** Edits from a share link, to apply over the generated world. */
  readonly edits: Uint8Array | null;
  /** The rest of the save, applied once Luciana and the panel exist. */
  readonly save: SaveFile | null;
  /** Sentences for the player, shown once the interface is up. */
  readonly notes: readonly string[];
  /** A shared world is a guest: the save is kept until the first change. */
  readonly sharedUntilEdit: boolean;
  /** Never write: the save on this machine belongs to a newer build. */
  readonly protectSave: boolean;
}

export function openSession(hash: string, storage?: () => Storage): Session {
  const store = storage ? openStore(storage) : openStore();
  const notes: string[] = [];
  if (store.kind === 'memory') {
    notes.push('Storage is switched off in this browser, so nothing is kept after this tab.');
  }

  let save: SaveFile | null = null;
  let protectSave = false;
  const text = store.get();
  if (text !== null) {
    const outcome = parseSave(text);
    if (outcome.ok) {
      save = outcome.save;
    } else if (outcome.reason === 'newer') {
      protectSave = true;
      notes.push(
        'The save here was made by a newer Daniblox. It is left alone, and this visit is not saved.',
      );
    } else {
      notes.push('The saved world could not be read, so this is a fresh one.');
    }
  }

  const share = decodeShare(hash);
  // A seed-only link to the world already saved here is just this world: the
  // save has the player's own edits, which a bare seed does not.
  const sameWorld = share.ok && share.edits === null && save?.seed === share.seed;
  if (share.ok && !sameWorld) {
    if (save) notes.push('A shared world. Your own save is kept until you change something.');
    return {
      store,
      seed: share.seed,
      voxels: null,
      edits: share.edits,
      save: null,
      notes,
      sharedUntilEdit: save !== null,
      protectSave,
    };
  }
  if (!share.ok && share.reason === 'corrupt') {
    notes.push(
      save
        ? 'That share link was damaged, so here is your own world instead.'
        : 'That share link was damaged, so here is a fresh world instead.',
    );
  }

  if (save) {
    return {
      store,
      seed: save.seed,
      voxels: decodeVoxels(save.voxels),
      edits: null,
      save,
      notes,
      sharedUntilEdit: false,
      protectSave,
    };
  }

  return {
    store,
    seed: DEFAULT_SEED,
    voxels: null,
    edits: null,
    save: null,
    notes,
    sharedUntilEdit: false,
    protectSave,
  };
}
