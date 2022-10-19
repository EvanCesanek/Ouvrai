import { required } from './utils';

export class BlockOptions {
  blockName;
  shuffle;
  repetitions;

  constructor(
    blockName = required('blockName'),
    shuffle = required('shuffle'),
    repetitions = required('repetitions'),
    noConsecutiveRepeats = []
  ) {
    this.blockName = blockName;
    this.shuffle = shuffle;
    this.repetitions = repetitions;
    this.noConsecutiveRepeats = noConsecutiveRepeats;
  }
}
