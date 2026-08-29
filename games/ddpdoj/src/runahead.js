export class RunaheadProjectionError extends Error {
  constructor(cause) {
    super('Runahead speculative projection failed.', { cause });
    this.name = 'RunaheadProjectionError';
  }
}

export function projectRunahead(game, frames, advance, capture) {
  if (!game || typeof game.saveRunaheadState !== 'function'
      || typeof game.restoreRunaheadState !== 'function') {
    throw new TypeError('Runahead projection requires a Game checkpoint API.');
  }
  if (!Number.isInteger(frames) || frames < 1 || frames > 3) {
    throw new RangeError('Runahead frames must be an integer from 1 through 3.');
  }
  if (typeof advance !== 'function' || typeof capture !== 'function') {
    throw new TypeError('Runahead projection requires advance and capture functions.');
  }

  const checkpoint = game.saveRunaheadState(frames);
  let result;
  let projectionFailure = null;
  try {
    for (let frame = 0; frame < frames; frame++) advance(game, frame);
    result = capture(game);
  } catch (error) {
    projectionFailure = error;
  }

  game.restoreRunaheadState(checkpoint);
  if (projectionFailure) throw new RunaheadProjectionError(projectionFailure);
  return result;
}
