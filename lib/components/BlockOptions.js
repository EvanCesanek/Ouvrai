import { required } from './utils';

export class BlockOptions {
  /**
   *
   * @param {object} p
   * @param {string} [p.name] Becomes exp.trials[i].blockName, default empty string ""
   * @param {integer} p.reps Number of repetitions of this block
   * @param {boolean} [p.shuffle] Randomly shuffle the order of the trial-variable arrays for each repetition? Default false
   * @param {string[]} [p.noConsecutiveRepeats] Array of strings of trial variables that shouldn't have values repeated across block boundaries (NB: this does not prevent repeats _within_ a block)
   * @param {function} [p.order] Function to generate a trial order, takes one argument `trials` which is an array of integers from zero to the length of the trial variable arrays
   */
  constructor({
    name = '',
    reps = required('reps'),
    shuffle = false,
    noConsecutiveRepeats = [],
    order = (trials) => trials,
  }) {
    this.blockName = name;
    this.repetitions = reps;
    this.shuffle = shuffle;
    this.noConsecutiveRepeats = noConsecutiveRepeats;
    this.order = order;
  }
}
