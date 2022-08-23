import { permute, range, shuffle } from 'd3-array';
import { Blocker } from './elements/Blocker.js';
import { Consent } from './elements/Consent.js';
import { Progressbar } from './elements/Progressbar.js';
import { Points } from './Points';
import { required } from './utils.js';

export class Experiment {
  constructor({
    name = required('name'),
    trials = [],
    startTrialNumber = 0,
    cssBackground = 'black',
    path = './consent.pdf',
    ...config
  }) {
    config.cssBackground = document.body.style.background = cssBackground;
    this.cfg = config;
    this.cfg.trialNumber = 'info'; // separate label for saving exp.cfg to firebase

    this.name = name;
    this.trials = trials;
    this.trialNumber = startTrialNumber || 0;
    this.getWorkerId();

    // Standard components for all experiments:
    this.consent = new Consent({ path: path });
    this.points = new Points();
    this.points.panelWorker.textContent = this.cfg.workerId; // display workerId on points panel
    this.progress = new Progressbar();
    this.blocker = new Blocker(); // blocker includes fullscreen and pointerlock by default
    this.fullscreen = this.blocker.fullscreen;
    this.pointerlock = this.blocker.pointerlock;
    this.fullscreenStates = this.pointerlockStates = [];

    if (config.enableVR) {
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
      console.warn(`WARNING: Participant constructor failed to retrieve workerId from URL parameters.\
      Participant assigned random workerId ${this.cfg.workerId}.`);
    }
  }

  #randomizeWorkerId() {
    this.cfg.workerId = String(Math.round(Math.random() * 10000000));
    this.cfg.workerId = this.cfg.workerId.padStart(7, '0');
  }

  createTrialSequence(blocks) {
    let blockNumber = 0; // unique blocks ("phases")
    let cycleNumber = 0; // cycles = block repetitions
    for (let bk of blocks) {
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
        let order = range(0, numTrials);
        if (options.shuffle) {
          shuffle(order); // Fisher-Yates shuffle in place
          // TODO: Allow for location and adjacency constraints on shuffled orders
          // e.g., check if order violates constraints and repeat while (!satisfied)
        }
        //console.log(bk);
        Object.keys(bk).forEach((key) => {
          bk[key] = permute(bk[key], order);
        });
        // For each trial (ti) in this block repetition
        for (let ti = 0; ti < numTrials; ti++) {
          // Create a trial object
          let trial = {};
          // Inject corresponding values (ti) for each key
          for (let key of Object.keys(bk)) {
            trial[key] = bk[key][ti];
          }
          trial.blockName = options.blockName;
          trial.block = blockNumber;
          trial.cycle = cycleNumber;
          this.trials.push(trial); // MAIN EFFECT OF THIS FUNCTION
        }
        cycleNumber++;
      }
      blockNumber++;
    }
    this.numTrials = this.trials.length;
    this.progress.update(this.trialNumber, this.numTrials);
  }
}
