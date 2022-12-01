import { permute, range, shuffle } from 'd3-array';
import { Blocker } from './Blocker.js';
import { Consent } from './Consent.js';
import { Progressbar } from './Progressbar.js';
import { Goodbye } from './Goodbye.js';
import { Points } from './Points.js';
import { Firebase } from './Firebase.js';
import { required } from './utils.js';

export class Experiment {
  constructor({
    name = required('name'),
    demo = false,
    trials = [],
    startTrialNumber = 0,
    cssBackground = 'black',
    consentPath = './consent.pdf',
    ...config
  }) {
    config.cssBackground = document.body.style.background = cssBackground;
    this.cfg = config;
    this.cfg.trialNumber = 'info'; // separate label for saving exp.cfg to firebase
    this.cfg.name = name;
    this.cfg.demo = demo;

    this.trials = trials;
    this.trialNumber = startTrialNumber || 0;
    this.getWorkerId();

    // Standard components for all experiments:
    this.firebase = new Firebase({
      expName: this.name,
      workerId: this.cfg.workerId,
      demo: this.cfg.demo,
    });
    this.consent = new Consent({ path: consentPath });
    this.goodbye = new Goodbye(this.cfg.platform, this.cfg.prolificLink);
    this.points = new Points();
    this.points.panelWorker.textContent = this.cfg.workerId; // display workerId on points panel
    this.progress = new Progressbar();
    this.blocker = new Blocker(); // blocker includes fullscreen and pointerlock by default
    this.fullscreen = this.blocker.fullscreen;
    this.pointerlock = this.blocker.pointerlock;
    this.fullscreenStates = this.pointerlockStates = [];

    if (config.vrAllowed) {
      this.cfg.requireFullscreen = false;
      this.cfg.requireChrome = false;
    }
  }

  nextTrial() {
    this.trialNumber++;
    this.progress.update(this.trialNumber);
  }

  getWorkerId() {
    const urlSearchParams = new URLSearchParams(window.location.search);
    const mturkId = urlSearchParams.get('workerId');
    const prolificId = urlSearchParams.get('PROLIFIC_PID');
    const prolificStudyId = urlSearchParams.get('STUDY_ID');
    const prolificSessionId = urlSearchParams.get('SESSION_ID');
    if (prolificId) {
      this.cfg.platform = 'P';
      this.cfg.prolificStudy = prolificStudyId;
      this.cfg.prolificSession = prolificSessionId;
      this.cfg.workerId = prolificId;
    } else if (mturkId) {
      this.cfg.platform = 'M';
      this.cfg.workerId = mturkId;
    } else {
      this.cfg.platform = 'X';
    }

    if (!this.cfg.workerId) {
      this.#randomizeWorkerId();
      console.warn(
        `WARNING: workerId not found in URL parameters, assigning random id ${this.cfg.workerId}.`
      );
    }
  }

  #randomizeWorkerId() {
    this.cfg.workerId = String(Math.round(Math.random() * 10000000));
    this.cfg.workerId = this.cfg.workerId.padStart(7, '0');
  }

  /**
   *
   * @param {Object[]} blocks - array of block objects, each consisting of N equal-length arrays + BlockOptions options field
   * @param {boolean} append - if false (default), overwrite any existing trial list. if true, append to the end of the trial list.
   * @returns
   */
  createTrialSequence(blocks, append = false) {
    if (!append) this.trial = [];
    let cycleNumber = 0; // cycles = block repetitions
    for (let [blockNumber, bk] of blocks.entries()) {
      // Get the ordering options and delete them to avoid problems
      const options = bk.options;
      delete bk.options;

      // Make sure all fields have the same length
      const numTrials = Object.values(bk)[0].length;
      const validBlock = Object.values(bk).every(
        (element) => element.length === numTrials
      );
      if (!validBlock) {
        console.error(
          'ERROR: Experiment.createTrialSequence() requires all trial-variable arrays have the same length'
        );
        return -1;
      }

      // Push trial objects onto this.trials, one by one
      // Respecting repetitions and shuffling options
      for (let ri = 0; ri < options.repetitions; ri++) {
        let bkCopy = { ...bk };
        let order = range(0, numTrials);
        if (options.shuffle && numTrials > 1) {
          shuffle(order);
          while (
            // Reshuffle while 1st trial == last trial on all of indicated keys
            // Note this does not prevent consecutive repeats within a block!
            options.noConsecutiveRepeats.length > 0 &&
            options.noConsecutiveRepeats.every(
              (key) =>
                this.trials[this.trials.length - 1] &&
                this.trials[this.trials.length - 1][key] === bk[key][order[0]]
            )
          ) {
            shuffle(order); // Fisher-Yates shuffle in place
          }
          // TODO: Allow for location and adjacency constraints on shuffled orders
        }
        Object.keys(bkCopy).forEach((key) => {
          bkCopy[key] = permute(bk[key], order);
        });
        // For each trial (ti) in this block repetition
        for (let ti = 0; ti < numTrials; ti++) {
          // Create a trial object
          let trial = {};
          // Inject corresponding values (ti) for each key
          for (let key of Object.keys(bkCopy)) {
            trial[key] = bkCopy[key][ti];
          }
          trial.blockName = options.blockName;
          trial.block = blockNumber;
          trial.cycle = cycleNumber;
          this.trials.push(trial); // MAIN EFFECT OF THIS FUNCTION
        }
        cycleNumber++;
      }
      //lastBlockNumber = blockNumber;
    }
    this.numTrials = this.trials.length;
    this.progress.update(this.trialNumber, this.numTrials);
  }
}
