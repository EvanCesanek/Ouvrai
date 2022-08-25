import { required } from './utils';

export class BlockOptions {
  blockName;
  shuffle;
  repetitions;

  constructor(
    blockName = required('blockName'),
    shuffle = required('shuffle'),
    repetitions = required('repetitions'),
    repBoundaryRepeats = false
  ) {
    this.blockName = blockName;
    this.shuffle = shuffle;
    this.repetitions = repetitions;
    this.repBoundaryRepeats = repBoundaryRepeats;
  }
}
