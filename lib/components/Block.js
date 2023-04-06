import { required } from './utils';
import { permute, range, shuffle } from 'd3-array';

export class Block {
  /**
   *
   * @param {object} p Parameters object
   * @param {object} p.variables Object containing N equal-length arrays (or singletons) to create trial variables. Object keys become variable names. Do not use 'block' as a variable name.
   * @param {*[]|*} p.variables.VARNAME Example trial variable named VARNAME
   * @param {object} p.options Block options
   * @param {string} [p.options.name='None'] Descriptive name for the block
   * @param {integer} p.options.reps Number of repetitions of this block
   * @param {boolean} [p.options.shuffle=false] Randomly shuffle the block for each repetition, default false
   * @param {function} [p.options.orderFunc] Custom function to generate a trial order for each block repetition. Takes one argument that is an array of integers from zero to the length of the trial variable arrays and must return an array containing only these values (but can be shorter or longer).
   */
  constructor({
    variables = {},
    options = {
      name: 'NoName',
      reps: required('reps'),
      shuffle: false,
      orderFunc,
    },
  }) {
    // Make sure all array fields have the same length
    let arrayFields = Object.values(variables).filter((x) => Array.isArray(x));
    let numTrials = arrayFields[0]?.length;
    const validBlock = arrayFields.every(
      (element) => element.length === numTrials
    );
    if (!validBlock) {
      throw new Error('All trial-variable arrays must have the same length.');
    }
    const validVariableNames = Object.keys(variables).filter((x) =>
      ['block'].includes(x)
    );
    if (!validVariableNames) {
      throw new Error(
        `You cannot use the following names for trial variables: ${validVariableNames.join(
          ', '
        )}`
      );
    }
    if (numTrials === undefined) {
      numTrials = 1;
      console.warn('No trial-variable arrays. Creating one trial per block.');
    }

    if (options.shuffle && options.orderFunc) {
      console.warn(
        `You supplied an ordering function and set shuffle to true in block '${options.name}'.\
        Shuffle will override the ordering function.`
      );
    }

    this.trials = [];

    // Create an array of trials for this block
    for (let ri = 0; ri < options.reps; ri++) {
      // Create a copy of the block for each repetition
      let blockRep = structuredClone(variables);

      // Create serial order
      let order = range(0, numTrials);

      // Use ordering function to re-order
      if (options.orderFunc) {
        order = options.orderFunc(range(0, numTrials));
      }

      // Shuffle the order
      if (options.shuffle && numTrials > 1) {
        shuffle(order);
        // TODO: Allow for location and adjacency constraints on shuffled orders
      }

      // Apply the order to the trial variable arrays
      // For singleton trial variables, fill an array
      Object.keys(blockRep).forEach((key) => {
        blockRep[key] = Array.isArray(blockRep[key])
          ? permute(variables[key], order) // arrays
          : new Array(order.length).fill(blockRep[key]); // singletons
      });

      // For each trial ti in this block repetition
      for (let ti = 0; ti < order.length; ti++) {
        // Create a trial object
        let trial = {};
        // Inject corresponding values (ti) for each key
        for (let key of Object.keys(blockRep)) {
          trial[key] = blockRep[key][ti];
        }
        trial.block = {
          name: options.name,
          repetition: ri,
          trial: ti,
        };
        this.trials.push(trial); // MAIN EFFECT OF THIS FUNCTION
      }
    }
  }
}

// while (
//   // Reshuffle while 1st trial == last trial on all of indicated keys
//   // Note this does not prevent consecutive repeats within a block!
//   options.noConsecutiveRepeats?.length > 0 &&
//   options.noConsecutiveRepeats.every(
//     (key) =>
//       this.trials[this.trials.length - 1] &&
//       this.trials[this.trials.length - 1][key] ===
//         variables[key][order[0]]
//   )
// ) {
//   shuffle(order); // Fisher-Yates shuffle in place
// }
