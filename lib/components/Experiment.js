import {
  AudioListener,
  AudioLoader,
  Object3D,
  PMREMGenerator,
  TextureLoader,
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
import { Block } from './Block.js';
import { Survey } from './Survey.js';

export class Experiment {
  grip = new Object3D();
  survey = new Survey();

  /**
   * The Experiment class handles lots of setup behind the scenes.
   * Instantiate a new Experiment with the desired configuration options.
   * @param {object} p
   * @param {object} p.devOptions (DEV) Various options to make development easier. Disabled in production.
   * @param {boolean} p.devOptions.skipConsent Skip the consent form
   * @param {boolean} p.devOptions.allowExitFullscreen Don't block if fullscreen is exited
   * @param {boolean} p.devOptions.allowExitPointerlock Don't block if pointerlock is exited
   * @param {boolean} p.devOptions.replay Enable replays of saved data from previous sessions
   * @param {boolean} p.devOptions.orbitControls Enable orbit controls to allow inspection of three.js scene?
   * @param {boolean} p.demo Use demo version of experiment (no consent, no Firebase)
   * @param {boolean} p.requireDesktop Block users on mobile devices
   * @param {boolean} p.requireChrome Block users not using Google Chrome
   * @param {boolean} p.requireVR Enable VR and block users on desktop
   * @param {boolean} p.orthographic Enable orthographic camera for simple 2D scenes?
   * @param {boolean} p.cssScene Overlay additional three.js scene for displaying UI via CSS objects
   * @param {boolean} p.audio Attach an audio listener to the viewer camera for 3D spatial audio
   * @param {color} p.backgroundColor Background color of experiment (default 'dimgray')
   * @param {URL} p.environmentLighting Imported URL of HDR lighting image
   * @param {boolean} p.handTracking (VR) Enable hand tracking
   * @param {boolean} p.controllerModels (VR) Display 3D controller models
   * @param {boolean} p.gridRoom (VR) Draw large cube with grid lines as minimal 3D environment
   */
  constructor({ ...config }) {
    this.cfg = config;

    this.cfg.trialNumber = 'info'; // label for saving exp.cfg to Firebase
    this.cfg.experiment = import.meta.env.VITE_EXPERIMENT_NAME; // automatically set experiment name
    this.cfg.devOptions = import.meta.env.DEV ? this.cfg.devOptions : {}; // debug mode allowed only during development

    this.cfg.backgroundColor ??= 'dimgray';
    document.body.style.background = this.cfg.backgroundColor; // three.js scene will match browser document color

    this.trialNumber = 0;
    this.#getWorkerId();
    this.#addDefaultEventListeners();
    this.cfg.userAgent = bowser.parse(window.navigator.userAgent);
    this.cfg.userAgent.string = window.navigator.userAgent;

    // Standard components for all experiments:
    this.state = new State();
    this.firebase = new Firebase({
      experiment: this.cfg.experiment,
      workerId: this.cfg.workerId,
      demo: this.cfg.demo,
    });
    this.consent = new Consent({ jpg: this.cfg.requireVR });
    this.consented = this.cfg.devOptions?.skipConsent;
    this.goodbye = new Goodbye(this.cfg.userAgent.platform);
    this.points = new Points({ score: this.cfg.score, bonus: this.cfg.bonus });
    this.points.panelWorker.textContent = this.cfg.workerId; // display workerId on points panel
    this.progress = new Progressbar();
    this.blocker = new Blocker(
      this.cfg.devOptions?.allowExitFullscreen,
      this.cfg.devOptions?.allowExitPointerlock
    ); // blocker includes fullscreen and pointerlock by default
    this.fullscreen = this.blocker.fullscreen; // raise them up for convenience
    this.pointerlock = this.blocker.pointerlock;
    this.sceneManager = new SceneManager({ cfg: this.cfg });
    if (this.cfg.devOptions?.replay) {
      this.replay = new Replay();
      // Disable fullscreen & pointer lock in replay mode
      this.cfg.devOptions.allowExitFullscreen = true;
      this.cfg.devOptions.allowExitPointerlock = true;
      this.sceneManager?.scene?.add(this.replay.avatar);
    }

    // Optional components must be initialized separately
    this.survey = undefined;
    this.instructions = undefined;

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
        let { name, message, stack } = err;
        let errorSave = {
          name: name,
          message: message,
          stack:
            (typeof stack === 'string' || stack instanceof String) &&
            stack.length < 9000
              ? stack
              : 'stack not saved',
          state: this.state.current,
          trialNumber: 'error',
        };
        this.firebase.saveTrial(errorSave);
        this.blocker.fatal(err);
        this.state.next('BLOCKED');
        throw err;
      }
    }.bind(this);

    mainLoop();
  }

  /**
   * Increments trial number and advances UI progress bars
   * @param {number} [skipToTrial] Advance to a specific trial. If undefined, advances to next trial.
   * @example
   * // After trial 0, skip to trial 11
   * exp.nextTrial(exp.trialNumber === 0 ? 11 : undefined);
   */
  nextTrial(skipToTrial) {
    this.trialNumber = skipToTrial ?? ++this.trialNumber;
    this.progress.update(this.trialNumber);
    this.VRUI?.updateProgressBar(this.trialNumber, this.numTrials);
  }

  /**
   * Must be called after the final trial, before transition from 'ADVANCE' to 'SURVEY'
   */
  complete() {
    this.goodbye.updateGoodbye(this.firebase.uid);
    this.firebase.recordCompletion().then(
      function () {
        this.cfg.completed = true;
      }.bind(this)
    );
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
   * Checks that the user's browser and device meet the compatibility requirements.
   * @returns {string|false} If not compatible, returns reason string; otherwise returns false
   */
  checkDeviceCompatibility() {
    let reason = false;
    if (this.cfg.requireVR && !this.cfg.vrSupported) {
      reason = 'openInVR';
    } else if (
      this.cfg.requireDesktop &&
      this.cfg.userAgent.platform.type !== 'desktop'
    ) {
      reason = 'desktop';
    } else if (
      this.cfg.requireChrome &&
      this.cfg.userAgent.browser.name !== 'Chrome'
    ) {
      reason = 'chrome';
    }
    this.blocker.block(reason);

    return reason;
  }

  /**
   * Waits for consent and processes it once given.
   * @returns {bool} True once consent is given and processed, false otherwise
   */
  waitForConsent() {
    if (this.consented || this.cfg.demo) {
      this.consent.checkbox.checked = true;
      this.consent.checkbox.disabled = true;
      this.consent.button.disabled = true;
      this.consent.button.innerText = 'Please wait...';
      this.cfg.date = new Date().toISOString();
      this.cfg.timeOrigin = performance.timeOrigin;
      return true;
    }
    return false;
  }

  /**
   * Performs anonymous sign-in with Firebase Authentication.
   * Also records previous UID if user was previously signed in to this app.
   *
   * If you are encountering an error message every time you run `ouvrai dev`,
   * you may want to increase the argument 'retries' to give the emulators more time to start.
   *
   * @param {integer} numRetries If in dev mode, number of times to retry if emulators are slow to start (3 seconds/try).
   */
  waitForAuthentication(numRetries = 3) {
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
          return this.firebase.signInAnonymous(numRetries);
        })
        .then((currentUser) => {
          console.log('Signed in anonymously:', currentUser);
          this.firebase.uid = currentUser.user.uid || 'demo';
          return Promise.all([
            this.firebase.saveTrial(this.cfg),
            this.firebase.recordConsent(),
          ]);
        })
        .then(() => {
          console.log('Consent event recorded in workers branch of database.');
          this.consent.hide();
          DisplayElement.show(this.sceneManager.renderer.domElement);
          DisplayElement.show(document.getElementById('panel-container'));
          if (this.cfg.requireVR) {
            this.vrButton.style.width = '150px';
          } else {
            DisplayElement.show(document.getElementById('panel-container'));
          }
          this.signInComplete = true;
        })
        .catch((err) => {
          let devErrorMessage, devError;
          if (import.meta.env.DEV && err.code === 'auth/internal-error') {
            devError = true;
            devErrorMessage = `<p style="color: skyblue">The Firebase Emulators seem to be taking longer than usual to start.<br />\
            Check your command line to see if there was an error.<br />\
            If there was no error, look for a message that says:<br />\
            <b><span style="color:green">✔</span> <span style="color:white">All emulators ready! It is now safe to connect your app.</span></b><br />
            Once you see this message, refresh this page and continue developing.<br/><br/>
            Seeing this message often? Try setting the 'numRetries' argument of <b>waitForAuthentication()</b> to 4 or more.</p>`;
          }
          this.blocker.fatal(devErrorMessage || err, devError);
          throw err;
        });
    });
    return this.signInComplete;
  }

  /**
   *
   * @param {Block[]} blocks Array of Blocks
   * @param {boolean} append Set true to append to the end of existing trials list
   * @returns {object[]} Array of trials. Side effect: creates exp.trials internally on Experiment instance.
   */
  createTrialSequence(blocks, append = false) {
    if (!Array.isArray(blocks) || !blocks.every((x) => typeof x === 'object')) {
      throw new Error(`Argument 'blocks' must be an array of block objects.`);
    }
    if (!append) this.trials = [];
    let cycleNumber = this.trials.slice(-1)[0]?.cycle || 0;
    for (let [blockNumber, bk] of blocks.entries()) {
      bk.trials.map((t) => {
        t.blockNumber = blockNumber;
        t.cycle = t.block.repetition + cycleNumber;
      });
      this.trials.push(...bk.trials);
      cycleNumber = this.trials.slice(-1)[0] + 1;
    }
    this.numTrials = this.trials.length;
    this.progress.update(this.trialNumber, this.numTrials);
    console.log(`Created trial sequence:`, this.trials);
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
            this.sceneManager.clearCameraOffset();
            // EAC [Mar 2023] transform attribute is null on Quest 2 tests
            this.cfg.resetView.push(e.transform);
            this.cfg.resetViewTime.push(e.timeStamp);
          });
        } catch (err) {
          console.error(err);
        }
      }.bind(this)
    );

    this.sceneManager.renderer.xr.addEventListener(
      'sessionend',
      function () {
        this.sceneManager.recentered = false;
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

      this.hand1.addEventListener('connected', this.handleHandConnected);
      this.hand1.addEventListener(
        'disconnected',
        this.handleHandDisconnected.bind(this)
      );
      this.hand2.addEventListener('connected', this.handleHandConnected);
      this.hand2.addEventListener(
        'disconnected',
        this.handleHandDisconnected.bind(this)
      );
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
    //this.sceneManager.scene.add(this.grip);
    this.sceneManager.cameraGroup.add(this.grip);
  }

  handleGripDisconnected(e) {
    // We sometimes get disconnect events without data (??)
    if (e.data && !e.data.hand && e.data.handedness === 'right') {
      console.log('RH grip disconnect', e.target.name);
      this.grip?.clear();
      //this.sceneManager.scene.remove(this.grip);
      this.sceneManager.cameraGroup.remove(this.grip);
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
    //this.sceneManager.scene.add(this.ray);
    this.sceneManager.cameraGroup.add(this.ray);
  }

  handleRayDisconnected(e) {
    // We sometimes get disconnect events without data (??)
    if (e.data && !e.data.hand && e.data.handedness === 'right') {
      console.log('RH ray disconnect', e.target.name);
      this.ray?.clear();
      //this.sceneManager.scene.remove(this.ray);
      this.sceneManager.cameraGroup.remove(this.ray);
      this.ray = undefined;
    }
  }

  handleHandConnected(e) {
    console.log('Hand connected', e);
  }

  handleHandDisconnected(e) {
    console.log('Hand disconnected', e);
  }

  handInterrupt() {
    return this.sceneManager.renderer.xr.isPresenting && !this.hand;
  }

  controllerInterrupt() {
    return (
      this.sceneManager.renderer.xr.isPresenting && (!this.grip || !this.ray)
    );
  }

  fullscreenInterrupt() {
    return (
      this.fullscreen.required &&
      !this.fullscreen.engaged &&
      !this.fullscreen.allowExit
    );
  }

  pointerlockInterrupt() {
    return (
      this.pointerlock.required &&
      !this.pointerlock.engaged &&
      !this.pointerlock.allowExit
    );
  }

  databaseInterrupt() {
    return !this.firebase.databaseConnected && !this.firebase.demo;
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
