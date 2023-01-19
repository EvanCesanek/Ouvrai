import { permute, range, shuffle } from 'd3-array';
import { Blocker } from './Blocker.js';
import { Consent } from './Consent.js';
import { Progressbar } from './Progressbar.js';
import { Goodbye } from './Goodbye.js';
import { Points } from './Points.js';
import { Firebase } from './Firebase.js';
import { required } from './utils.js';
import { PMREMGenerator, TextureLoader } from 'three';
import { SceneManager } from './SceneManager.js';
import bowser from 'bowser';

export class Experiment {
  constructor({
    name = required('name'),
    demo = false,
    trials = [],
    startTrialNumber = 0,
    cssBackground = 'dimgray',
    consentPath = './consent.pdf',
    ...config
  }) {
    config.cssBackground = document.body.style.background = cssBackground;
    this.cfg = config;
    this.cfg.trialNumber = 'info'; // separate label for saving exp.cfg to firebase
    this.cfg.experiment = name;
    this.cfg.demo = demo;

    this.trials = trials;
    this.trialNumber = startTrialNumber || 0;
    this.getWorkerId();

    // Standard components for all experiments:
    this.firebase = new Firebase({
      expName: this.cfg.experiment,
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
    this.sceneManager = new SceneManager({
      cfg: this.cfg,
      cssScene: this.cfg.cssScene,
    });

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

  processInterrupts() {
    if (!this.firebase.databaseConnected) {
      this.state.push(this.state.DBCONNECT);
    } else if (
      !this.fullscreen.engaged &&
      this.fullscreenStates.includes(this.state.current)
    ) {
      this.state.push(this.state.FULLSCREEN); // divert to FULLSCREEN state
    } else if (
      !this.pointerlock.engaged &&
      this.pointerlockStates.includes(this.state.current)
    ) {
      this.state.push(this.state.POINTERLOCK); // divert to POINTERLOCK state
    }
  }

  processBrowser() {
    const browserInfo = bowser.parse(window.navigator.userAgent);
    if (this.cfg.requireDesktop && browserInfo.platform.type == 'mobile') {
      this.blocker.show(this.blocker.desktop);
      this.state.next(this.state.BLOCKED);
    } else if (
      this.cfg.requireChrome &&
      browserInfo.browser.name !== 'Chrome'
    ) {
      this.blocker.show(this.blocker.chrome);
      this.state.next(this.state.BLOCKED);
    } else {
      // Any info we want to save should be added to the exp.cfg object
      this.cfg.browser = browserInfo.browser;
      this.cfg.os = browserInfo.os;
      this.state.next(this.state.CONSENT);
    }
  }

  /**
   *
   * @param {Object[]} blocks - array of block objects, each consisting of N equal-length arrays + BlockOptions options field
   * @param {boolean} append - if false (default), overwrite any existing trial list. if true, append to the end of the trial list.
   * @returns
   */
  createTrialSequence(blocks, append = false) {
    if (!Array.isArray(blocks)) {
      console.error('Argument "blocks" must be an array of block objects');
    }
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

  async initVR({ handTracking = false, controllerModels = false }) {
    this.cfg.vrSupported = await navigator.xr?.isSessionSupported(
      'immersive-vr'
    );
    if (!this.cfg.vrSupported) {
      console.warn('VR not supported on this device.');
      return;
    }
    if (!this.sceneManager) {
      console.error('Must have a sceneManager to initialize VR.');
      return;
    }

    this.sceneManager.renderer.xr.enabled = true;
    this.cfg.resetView = [];
    this.cfg.resetViewTime = [];
    this.sceneManager.renderer.xr.addEventListener('sessionstart', function () {
      this.xrSession = this.sceneManager.renderer.xr.getSession();
      let rates = this.xrSession.supportedFrameRates;
      if (rates) {
        let rate = rates.reduce((a, b) => (a > b ? a : b));
        this.xrSession.updateTargetFrameRate(rate);
      }
      this.xrReferenceSpace = this.sceneManager.renderer.xr.getReferenceSpace();
      this.xrReferenceSpace.addEventListener('reset', (e) => {
        // EAC [Nov 2022] transform attribute is null on Quest 2 tests
        this.cfg.resetView.push(e.transform);
        this.cfg.resetViewTime.push(e.timeStamp);
      });
      // exp.xrSession.addEventListener('inputsourceschange', function (e) {
      //   console.log(e, this.controllers, this.controllerInputSources);
      // });
    });

    let module = await import('three/examples/jsm/webxr/VRButton.js');
    this.vrButton = module.VRButton.createButton(this.sceneManager.renderer);
    // adjust css so it fits in flexbox at top
    this.vrButton.style.background = 'black';
    this.vrButton.style.fontWeight = 'bold';
    this.vrButton.style.position = '';
    this.vrButton.style.marginTop = '10px';
    this.vrButton.style.fontSize = '18px';
    this.vrButton.style.order = 2; // center
    this.vrButton.addEventListener('click', () => {
      this.loadBackground(this.cfg.sceneBackgroundURL, this.scene);
      if (this.audioListener) {
        this.audioListener.context.resume();
      }
    });
    document.getElementById('panel-container').appendChild(this.vrButton);

    // getController(idx) returns a Group representing the target ray space
    // getControllerGrip(idx) returns a Group representing the grip space
    // getHand(idx) returns a Group representing the hand space

    // WebXRManager.controllers is a length N array (N probably = 2)
    // Each element (WebXRController) can retrieve all 3 spaces
    // And they are remembered once retrieved
    // Session events are dispatched to all three spaces
    // update() method is called in the default onAnimationFrame loop

    // Controller Target Ray Spaces
    this.ray1 = this.sceneManager.renderer.xr.getController(0);
    this.ray1.addEventListener(
      'selectstart',
      () => (this.ray1.userData.isSelecting = true)
    );
    this.ray1.addEventListener(
      'selectend',
      () => (this.ray1.userData.isSelecting = false)
    );
    this.ray2 = this.sceneManager.renderer.xr.getController(1);
    this.ray2.addEventListener(
      'selectstart',
      () => (this.ray2.userData.isSelecting = true)
    );
    this.ray2.addEventListener(
      'selectend',
      () => (this.ray2.userData.isSelecting = false)
    );

    // Controller Grip Spaces
    this.grip1 = this.sceneManager.renderer.xr.getControllerGrip(0);
    this.grip2 = this.sceneManager.renderer.xr.getControllerGrip(1);

    // For hands:
    if (handTracking) {
      // Hand Tracking Spaces
      this.hand1 = this.sceneManager.renderer.xr.getHand(0);
      this.hand2 = this.sceneManager.renderer.xr.getHand(1);
      // Hand models
      module = await import('three/examples/jsm/webxr/OculusHandModel.js');
      this.hand1.add(new module.OculusHandModel(this.hand1));
      this.hand2.add(new module.OculusHandModel(this.hand2));
    }

    // For controller models:
    // The XRControllerModelFactory will automatically fetch controller models
    // that match what the user is holding as closely as possible. The models
    // should be attached to the object returned from getControllerGrip in
    // order to match the orientation of the held device.
    if (controllerModels) {
      module = await import(
        'three/examples/jsm/webxr/XRControllerModelFactory.js'
      );
      const controllerModelFactory = new module.XRControllerModelFactory();
      this.grip1.add(controllerModelFactory.createControllerModel(this.grip1));
      this.grip2.add(controllerModelFactory.createControllerModel(this.grip2));
    }
  }

  loadBackground(sceneBackgroundURL) {
    // Load a custom background
    if (sceneBackgroundURL && sceneBackgroundURL.endsWith('.jpg')) {
      const loader = new TextureLoader();
      loader.load(sceneBackgroundURL, (texture) => {
        const generator = new PMREMGenerator(this.sceneManager.renderer);
        texture = generator.fromEquirectangular(texture).texture;
        this.sceneManager.scene.background = texture;
        texture.dispose();
        generator.dispose();
      });
    }
  }

  addDefaultEventListeners() {
    document.body.addEventListener('keydown', (event) => {
      if (event.key === 'i' && !event.repeat) {
        this.instructions?.toggleInstructions();
      }
    });

    if (this.cfg.debug) {
      document.body.addEventListener('keydown', (event) => {
        if (event.key === 'S') {
          this.firebase?.localSave();
        }
      });
    }

    document.body.addEventListener('consent', () => {
      console.log('document.body received consent event, signing in...');
      this.consented = true;
    });

    document.body.addEventListener('surveysubmitted', (e) => {
      console.log(
        'document.body received surveysubmitted event, saving data...'
      );
      for (let [k, v] of Object.entries(e.detail.survey)) {
        this.cfg[k] = v;
      }
      this.surveysubmitted = true;
    });

    document.body.addEventListener('savesuccessful', () => {
      console.log('document.body received savesuccessful event, trial saved');
    });

    document.body.addEventListener('dbconnect', () => {
      console.log('document.body received dbconnect event');
    });

    document.body.addEventListener('dbdisconnect', () => {
      console.log('document.body received dbdisconnect event');
    });

    document.body.addEventListener('enterfullscreen', () => {
      console.log('document.body received enterfullscreen event');
    });

    document.body.addEventListener('exitfullscreen', () => {
      console.log('document.body received exitfullscreen event');
    });

    document.body.addEventListener('enterpointerlock', () => {
      console.log('document.body received enterpointerlock event');
    });

    document.body.addEventListener('exitpointerlock', () => {
      console.log('document.body received exitpointerlock event');
    });
  }
}
