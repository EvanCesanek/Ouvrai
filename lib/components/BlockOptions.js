import { required } from './utils';

export class BlockOptions {
  blockName;
  repetitions;
  shuffle;

  constructor({
    name = '',
    reps = 1,
    shuffle = false,
    noConsecutiveRepeats = [],
  }) {
    this.blockName = name;
    this.repetitions = reps;
    this.shuffle = shuffle;
    this.noConsecutiveRepeats = noConsecutiveRepeats;
  }
}
