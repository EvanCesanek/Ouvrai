import { permute, range, shuffle } from 'd3-array';
import {
  AudioListener,
  AudioLoader,
  Euler,
  Object3D,
  PMREMGenerator,
  Quaternion,
  TextureLoader,
  Vector3,
} from 'three';
import bowser from 'bowser';
import { Blocker } from './Blocker.js';
import { Consent } from './Consent.js';
import { DisplayElement } from './DisplayElement.js';
import { Firebase } from './Firebase.js';
import { Goodbye } from './Goodbye.js';
import { Points } from './Points.js';
import { Progressbar } from './Progressbar.js';
import { Replay } from './Replay.js';
import { SceneManager } from './SceneManager.js';
import { State } from './State.js';
import { XRInterface } from './XRInterface.js';
import { randomNumericString } from './utils.js';

export class Experiment {
  grip = new Object3D();
  /**
   * The Experiment class handles lots of setup behind the scenes.
   * Instantiate a new Experiment with the desired configuration options.
   * @param {object} p
   * @param {boolean} p.debug (DEV) Enable debug mode? Always false in production build.
   * @param {color} p.backgroundColor Background color of experiment (default 'dimgray')
   * @param {boolean} p.replay (DEV) Enable replay machine to allow playback of trials from .json data files? (dev only)
   * @param {boolean} p.demo Enable demo version of experiment (no consent, no Firebase, etc)?
   * @param {boolean} p.requireDesktop Block users on mobile devices?
   * @param {boolean} p.requireChrome Block users not using Google Chrome?
   * @param {boolean} p.requireVR Enable VR?
   * @param {boolean} p.handTracking (VR) Enable hand tracking?
   * @param {boolean} p.controllerModels (VR) Display 3D controller models?
   * @param {boolean} p.orthographic Enable orthographic camera for simple 2D scenes?
   * @param {boolean} p.cssScene Overlay additional three.js scene for displaying UI via CSS objects?
   * @param {URL} p.environmentLighting Imported URL of HDR lighting image
   * @param {boolean} p.orbitControls (DEV) Enable orbit controls to allow inspection of three.js scene?
   * @param {boolean} p.gridRoom (VR) Draw large cube with grid lines as a simple 3D environment surrounding observer
   * @param {boolean} p.audio Attach an audio listener to the viewer camera for 3D spatial audio?
   */
  constructor({ ...config }) {
    this.cfg = config;
    this.cfg.trialNumber = 'info'; // important label for saving exp.cfg to firebase
    this.cfg.experiment = import.meta.env.VITE_EXPERIMENT_NAME; // automatically set experiment name
    this.cfg.debug = this.cfg.debug && import.meta.env.DEV; // debug mode allowed only during development
    this.cfg.backgroundColor = this.cfg.backgroundColor ?? 'dimgray';
    document.body.style.background = this.cfg.backgroundColor; // three.js scene will match browser document color

    this.trialNumber = 0;
    this.#getWorkerId();
    this.#addDefaultEventListeners();

    // Standard components for all experiments:
    this.state = new State(); // Must be re-initialized!
    this.firebase = new Firebase({
      experiment: this.cfg.experiment,
      workerId: this.cfg.workerId,
      demo: this.cfg.demo,
    });
    this.consent = new Consent({ jpg: this.cfg.requireVR });
    this.goodbye = new Goodbye(this.cfg.platform);
    this.points = new Points({ score: this.cfg.score, bonus: this.cfg.bonus });
    this.points.panelWorker.textContent = this.cfg.workerId; // display workerId on points panel
    this.progress = new Progressbar();
    this.blocker = new Blocker(); // blocker includes fullscreen and pointerlock by default
    this.fullscreen = this.blocker.fullscreen;
    this.pointerlock = this.blocker.pointerlock;
    this.fullscreenStates = [];
    this.pointerlockStates = [];
    this.sceneManager = new SceneManager({ cfg: this.cfg });
    this.replay = this.cfg.debug ? new Replay() : null;
    if (this.replay) {
      // Disable fullscreen & pointer lock in replay mode
      this.fullscreenStates = this.pointerlockStates = [];
      this.sceneManager.scene.add(this.replay.avatar);
    }

    if (this.cfg.audio) {
      // Audio listener on the camera
      this.audioListener = new AudioListener();
      this.audioLoader = new AudioLoader();
      this.sceneManager.camera.add(this.audioListener);
    }

    if (this.cfg.requireVR) {
      this.cfg.requireFullscreen = false;
      this.cfg.requireChrome = false;
      this.#initVR();
      this.VRUI = new XRInterface();
      this.sceneManager.scene.add(this.VRUI);
    }
  }

  /**
   * Start the main experiment loop. Usually takes three sequential functions: `calcFunc`, `stateFunc`, and `displayFunc`.
   * @param  {...function} loopFuncs
   */
  start(...loopFuncs) {
    if (import.meta.env.PROD) {
      console.warn(
        'You are using a production version of an Ouvrai experiment. Disabling logs for performance.'
      );
      console.log = () => {};
      console.warn = () => {};
    }

    const mainLoop = function () {
      try {
        this.sceneManager.renderer.setAnimationLoop(mainLoop);
        for (let func of loopFuncs) {
          func();
        }
      } catch (err) {
        console.warn('Main loop caught an error!');
        this.blocker.fatal(err);
        this.state.next('BLOCKED');
        throw err;
      }
    }.bind(this);

    mainLoop();
  }

  /**
   * Increments trial number and advances UI progress bars
   * @param {number} [skipToTrial] Optional, advances to a specific trial
   */
  nextTrial(skipToTrial) {
    this.trialNumber = skipToTrial ?? ++this.trialNumber;
    this.progress.update(this.trialNumber);
    this.VRUI?.updateProgressBar(this.trialNumber, this.numTrials);
  }

  /**
   * Retrieves workerId from URL params. Assigns random numeric id if not found.
   */
  #getWorkerId() {
    const urlSearchParams = new URLSearchParams(window.location.search);
    const prolificId = urlSearchParams.get('PROLIFIC_PID');
    const mturkId = urlSearchParams.get('workerId');
    if (prolificId) {
      this.cfg.workerId = prolificId;
      this.cfg.platform = 'Prolific';
      this.cfg.studyId = urlSearchParams.get('STUDY_ID');
      this.cfg.submissionId = urlSearchParams.get('SESSION_ID');
    } else if (mturkId) {
      this.cfg.workerId = mturkId;
      this.cfg.platform = 'MTurk';
      this.cfg.studyId = urlSearchParams.get('hitId');
      this.cfg.submissionId = urlSearchParams.get('assignmentId');
    } else {
      this.cfg.platform = 'Other';
    }

    if (!this.cfg.workerId) {
      this.cfg.workerId = randomNumericString(7);
      console.warn(
        `workerId not found in URL parameters! Assigned random ID ${this.cfg.workerId}.`
      );
    }
  }

  /**
   * Serially checks whether:
   * 1. Firebase database is connected
   * 2. Fullscreen is engaged (if it must be)
   * 3. Pointerlock is engaged (if it must be)
   * 4. VR controller is connected (if in VR)
   *
   * If one of these checks fails, it causes a transition to the relevant "interrupt state".
   * Interrupt states wait for the condition to be satisfied, then return to the previous state (see `stateFunc()`).
   */
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
    } else if (
      this.sceneManager.renderer.xr.isPresenting &&
      (!this.grip || !this.ray)
    ) {
      this.state.push(this.state.CONTROLLER);
    }
  }

  /**
   * Checks that the browser meets the configuration requirements.
   * If not, transitions to BLOCKED state. Otherwise transitions to CONSENT state.
   */
  processBrowser() {
    const browserInfo = bowser.parse(window.navigator.userAgent);
    if (this.cfg.requireVR) {
      if (!this.cfg.vrSupported) {
        this.blocker.show(this.blocker.openInVR);
        this.state.next(this.state.BLOCKED);
      } else {
        // Any info we want to save should be added to the exp.cfg object
        this.cfg.userAgent = window.navigator.userAgent;
        this.state.next(this.state.CONSENT);
      }
    } else {
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
  }

  /**
   * Displays the consent form page and records time.
   * Always transitions to SIGNIN state.
   */
  processConsent() {
    this.state.once(() => this.consent.show());
    if (this.consented || this.cfg.demo) {
      this.consent.checkbox.checked = true;
      this.consent.checkbox.disabled = true;
      this.consent.button.disabled = true;
      this.consent.button.innerText = 'Please wait...';
      this.cfg.date = new Date().toISOString();
      this.cfg.timeOrigin = performance.timeOrigin;
      this.state.next(this.state.SIGNIN);
    }
  }

  /**
   * Performs anonymous sign-in with Firebase Authentication.
   * Also records previous UID (if user was previously signed to this app).
   * By default, transitions to WELCOME state for VR experiments, and to SETUP state for non-VR experiments.
   * You may specify a different next state using the first argument.
   *
   * If you are encountering a pop-up error message every time you run `ouvrai dev`,
   * you may want to increase the second argument to values greater than 3000.
   * The emulators usually need a few seconds to start.
   *
   * @param {integer} nextState State to transition into
   * @param {integer} devRetryDuration If in dev mode, time to wait before retrying if initial sign-in attempt fails.
   */
  processSignIn(nextState = null, devRetryDuration = 3000) {
    this.state.once(() => {
      this.firebase
        .signOut()
        .then((previousUser) => {
          if (previousUser) {
            console.log(
              'Signed out persisted user from previous session:',
              previousUser
            );
            this.cfg.previousUser = {
              uid: previousUser.uid,
              metadata: previousUser.metadata,
            };
          }
          return this.firebase.signInAnonymous();
        })
        .then((currentUser) => {
          console.log('Signed in anonymously:', currentUser);
          this.firebase.uid = currentUser.user.uid || 'demo';
          return this.firebase.recordConsent();
        })
        .then(() => {
          console.log('Consent event recorded in workers branch of database.');
          this.consent.hide();
          DisplayElement.show(this.sceneManager.renderer.domElement);
          DisplayElement.show(document.getElementById('panel-container'));
          if (this.cfg.requireVR) {
            this.vrButton.style.width = '150px';
            this.state.next(nextState || 'WELCOME');
          } else {
            DisplayElement.show(document.getElementById('panel-container'));
            this.state.next(nextState || 'SETUP');
          }
        })
        .catch((err) => {
          this.blocker.fatal(err);
          this.state.next('BLOCKED');
          throw err;
        });
    });
    // this.firebase.signInAnonymous().catch((err) => {
    //   this.blocker.fatal(err);
    //   this.state.next('BLOCKED');
    // });
    // this.firebase.recordConsent().catch((err) => {
    //   this.blocker.fatal(err);
    //   this.state.next('BLOCKED');
    // });

    //}

    // if (import.meta.env.DEV) {
    //   if (err.code === 'auth/network-request-failed') {
    //     window.alert(
    //       'Oops! The Auth Emulator is probably still starting up. Try refreshing the page.'
    //     );
    //   }
    // }
  }

  /**
   *
   * @param {Object[]} blocks - array of block objects, each block is N equal-length arrays or singletons to create trial variables, plus `options: new BlockOptions()`
   * @param {boolean} append - if false (default), overwrite any existing trial list. if true, append to the end of the trial list.
   * @returns Side effect: Creates the exp.trials array
   */
  createTrialSequence(blocks, append = false) {
    if (!Array.isArray(blocks) || !blocks.every((x) => typeof x === 'object')) {
      throw new Error('Argument "blocks" must be an array of block objects.');
    }
    if (!append) this.trials = [];
    let cycleNumber = 0; // cycles = block repetitions
    for (let [blockNumber, bk] of blocks.entries()) {
      // Get the ordering options and delete them to avoid problems
      const options = bk.options;
      if (!options) {
        throw new Error('BlockOptions must be supplied for all blocks.');
      }
      delete bk.options;

      // Make sure all fields have the same length
      let arrayFields = Object.values(bk).filter((x) => Array.isArray(x));
      let numTrials = arrayFields[0]?.length;
      const validBlock = arrayFields.every(
        (element) => element.length === numTrials
      );
      if (!validBlock) {
        throw new Error('All trial-variable arrays must have the same length.');
      }
      if (numTrials === undefined) {
        numTrials = 1;
        console.warn('No trial-variable arrays. Creating one trial per block.');
      }

      // Push trial objects onto this.trials, one by one
      // Respecting repetitions and shuffling options
      for (let ri = 0; ri < options.repetitions; ri++) {
        let bkCopy = { ...bk };
        let order = options.order(range(0, numTrials));
        if (options.shuffle && numTrials > 1) {
          shuffle(order);
          while (
            // Reshuffle while 1st trial == last trial on all of indicated keys
            // Note this does not prevent consecutive repeats within a block!
            options.noConsecutiveRepeats?.length > 0 &&
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
          bkCopy[key] = Array.isArray(bkCopy[key])
            ? permute(bk[key], order) // arrays
            : new Array(order.length).fill(bkCopy[key]); // singletons
        });
        // For each trial (ti) in this block repetition
        for (let ti = 0; ti < order.length; ti++) {
          // Create a trial object
          let trial = {};
          // Inject corresponding values (ti) for each key
          for (let key of Object.keys(bkCopy)) {
            trial[key] = bkCopy[key][ti];
          }
          trial.blockName = options.blockName;
          trial.block = blockNumber;
          trial.cycle = cycleNumber;
          trial.blockTrial = ti;
          this.trials.push(trial); // MAIN EFFECT OF THIS FUNCTION
        }
        cycleNumber++;
      }
      //lastBlockNumber = blockNumber;
    }
    this.numTrials = this.trials.length;
    this.progress.update(this.trialNumber, this.numTrials);
  }

  async #initVR() {
    this.cfg.vrSupported = await navigator.xr?.isSessionSupported(
      'immersive-vr'
    );
    if (!this.cfg.vrSupported) {
      console.warn('VR not supported on this device.');
      return;
    }
    if (!this.sceneManager) {
      throw new Error('Must have a sceneManager to initialize VR.');
    }

    this.progress.hide();

    this.sceneManager.renderer.xr.enabled = true;
    this.cfg.resetView = [];
    this.cfg.resetViewTime = [];
    this.sceneManager.renderer.xr.addEventListener(
      'sessionstart',
      function () {
        this.xrSession = this.sceneManager.renderer.xr.getSession();
        let rates = this.xrSession.supportedFrameRates;
        if (rates) {
          let rate = rates.reduce((a, b) => (a > b ? a : b));
          this.xrSession.updateTargetFrameRate(rate);
        }
        this.xrReferenceSpace =
          this.sceneManager.renderer.xr.getReferenceSpace();
        try {
          this.xrReferenceSpace.addEventListener('reset', (e) => {
            // EAC [Mar 2023] transform attribute is null on Quest 2 tests
            this.cfg.resetView.push(e.transform);
            this.cfg.resetViewTime.push(e.timeStamp);
          });
        } catch (err) {
          console.error(err);
        }

        // exp.xrSession.addEventListener('inputsourceschange', function (e) {
        //   console.log(e, this.controllers, this.controllerInputSources);
        // });
      }.bind(this)
    );

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
    if (this.cfg.handTracking) {
      // Hand Tracking Spaces
      this.hand1 = this.sceneManager.renderer.xr.getHand(0);
      this.hand2 = this.sceneManager.renderer.xr.getHand(1);
      // Hand models
      module = await import('three/examples/jsm/webxr/OculusHandModel.js');
      this.hand1.add(new module.OculusHandModel(this.hand1));
      this.hand2.add(new module.OculusHandModel(this.hand2));
      this.hand1.name = 'hand1';
      this.hand2.name = 'hand2';
    }

    this.ray1.name = 'ray1';
    this.ray2.name = 'ray2';
    this.grip1.name = 'grip1';
    this.grip2.name = 'grip2';

    // For controller models:
    // The XRControllerModelFactory will automatically fetch controller models
    // that match what the user is holding as closely as possible. The models
    // should be attached to the object returned from getControllerGrip in
    // order to match the orientation of the held device.
    if (this.cfg.controllerModels) {
      module = await import(
        'three/examples/jsm/webxr/XRControllerModelFactory.js'
      );
      const controllerModelFactory = new module.XRControllerModelFactory();
      this.grip1.add(controllerModelFactory.createControllerModel(this.grip1));
      this.grip2.add(controllerModelFactory.createControllerModel(this.grip2));
    }

    // Can't be sure whether grip1 or grip2 is the right hand, must check on connection
    this.grip1.addEventListener('connected', this.handleGripConnected);
    this.grip1.addEventListener(
      'disconnected',
      this.handleGripDisconnected.bind(this)
    );
    this.grip2.addEventListener('connected', this.handleGripConnected);
    this.grip2.addEventListener(
      'disconnected',
      this.handleGripDisconnected.bind(this)
    );
    this.ray1.addEventListener('connected', this.handleRayConnected);
    this.ray1.addEventListener(
      'disconnected',
      this.handleRayDisconnected.bind(this)
    );
    this.ray2.addEventListener('connected', this.handleRayConnected);
    this.ray2.addEventListener(
      'disconnected',
      this.handleRayDisconnected.bind(this)
    );
    // Need these extra listeners because of context problem:
    // Can't .bind(this) on the 'connected' handlers because we need the default context (grip/ray1, grip/ray2)
    document.body.addEventListener(
      'rightrayconnect',
      this.handleRightRayConnected.bind(this)
    );
    document.body.addEventListener(
      'rightgripconnect',
      this.handleRightGripConnected.bind(this)
    );
    // if you wanted to use the hand space you'd do the same here
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

  handleGripConnected(e) {
    if (!e.data.hand && e.data.handedness === 'right') {
      console.log('RH grip connect', e.target.name, e.data.gamepad);
      let rhgripevent = new CustomEvent('rightgripconnect', {
        detail: { target: this, data: e.data },
      });
      document.body.dispatchEvent(rhgripevent);
    }
  }

  handleRightGripConnected(e) {
    let gamepad = e.detail.data.gamepad;
    this.cfg.xrInputProfiles = e.detail.data.profiles;
    this.grip = e.detail.target;
    this.grip.gamepad = gamepad;
    this.cfg.supportHaptic = gamepad.hapticActuators ?? false;
    this.grip.add(this.rhObject);
    this.sceneManager.scene.add(this.grip);
  }

  handleGripDisconnected(e) {
    // We sometimes get disconnect events without data (??)
    if (e.data && !e.data.hand && e.data.handedness === 'right') {
      console.log('RH grip disconnect', e.target.name);
      this.grip?.clear();
      this.sceneManager.scene.remove(this.grip);
      this.grip = undefined;
    }
  }

  handleRayConnected(e) {
    if (!e.data.hand && e.data.handedness === 'right') {
      console.log('RH ray connect', e.target.name);
      let rhrayevent = new CustomEvent('rightrayconnect', {
        detail: { target: this, data: e.data },
      });
      document.body.dispatchEvent(rhrayevent);
    }
  }

  handleRightRayConnected(e) {
    this.ray = e.detail.target;
    if (this.VRUI?.xrPointer?.isObject3D) {
      this.ray.add(this.VRUI.xrPointer);
    }
    this.sceneManager.scene.add(this.ray);
  }

  handleRayDisconnected(e) {
    // We sometimes get disconnect events without data (??)
    if (e.data && !e.data.hand && e.data.handedness === 'right') {
      console.log('RH ray disconnect', e.target.name);
      this.ray?.clear();
      this.sceneManager.scene.remove(this.ray);
      this.ray = undefined;
    }
  }

  /**
   * Adds listeners that respond to:
   *
   * 1. Toggling instruction panel (keydown i)
   *
   * 2. Local save in dev mode (keydown Shift+s)
   *
   * 3. Consent form accepted
   *
   * 4. Adding survey form responses to 'info' trial
   *
   * Additional unused listeners (these only print to console in debug):
   * - savesuccessful
   * - db(dis)connect
   * - (enter|exit)fullscreen
   * - (enter|exit)pointerlock
   */
  #addDefaultEventListeners() {
    document.body.addEventListener('keydown', (event) => {
      if (event.key === 'i' && !event.repeat) {
        this.instructions?.toggleInstructions();
      }
    });

    if (import.meta.env.DEV) {
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
