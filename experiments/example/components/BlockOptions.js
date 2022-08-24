import { required } from './utils';

export class BlockOptions {
  blockName;
  shuffle;
  repetitions;

  constructor(
    blockName = required('blockName'),
    shuffle = required('shuffle'),
    repetitions = required('repetitions')
  ) {
    this.blockName = blockName;
    this.shuffle = shuffle;
    this.repetitions = repetitions;
  }
}
