import {
  AudioListener,
  AudioLoader,
  Clock,
  Group,
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
import { InstructionsPanel } from './InstructionsPanel.js';
import { DateTime } from './utils.js';

/**
 * The `Experiment` class is the core of all Ouvrai experiments.
 */
export class Experiment {
  /**
   * This property holds all of the configuration options passed to the constructor `new Experiment(cfg)`.
   * It is saved to Firebase as a special trial called `'info'` at consent, and updated at completion.
   * If there are other global experiment parameters that you want saved from your experiment, add them to the `cfg` object.
   * @type {Object}
   */
  cfg;
  /**
   * Setup and management of three.js scenes to reduce the amount of graphics-related code you need to write.
   * @type {SceneManager}
   */
  sceneManager;
  /**
   * Create a survey form on your experiment instance with `exp.survey = new Survey()`.
   * @type {Survey}
   */
  survey;
  /**
   * Create a brief instructions panel overlaid on the top-left of the scene with `exp.instructions = new InstructionsPanel()`.
   * @type {InstructionsPanel}
   */
  instructions;
  /**
   * Ouvrai dev mode allows you to initialize a Replay machine `exp.replay` by setting `devOptions.replay = true` in the configuration object.
   * This will allow you to load JSON files into the experiment and replay trajectories from the data using the three.js animation system.
   *
   * Important: You must set up `handleReplayInfo()` and `handleReplayTrial()` functions in the experiment code. See `vr-gen` experiment for example usage.
   * @type {Replay}
   */
  replay;
  /**
   * Ouvrai keeps track of which WebXR input source {@link https://developer.mozilla.org/en-US/docs/Web/API/XRInputSource/gripSpace grip space}
   * is currently associated with the left VR controller. This is a reference to the three.js Group returned by
   * {@link https://threejs.org/docs/#api/en/renderers/webxr/WebXRManager.getControllerGrip WebXRManager.getControllerGrip(i)}.
   * This should give access to the `leftGrip.gamepad.hapticActuators[i].pulse()` method for haptic feedback, as well as other controller buttons.
   * @type {Group}
   */
  leftGrip;
  /**
   * Ouvrai keeps track of which WebXR input source {@link https://developer.mozilla.org/en-US/docs/Web/API/XRInputSource/targetRaySpace ray space}
   * is currently associated with the left controller/hand. This is a reference to the three.js Group returned by
   * {@link https://threejs.org/docs/#api/en/renderers/webxr/WebXRManager.getController WebXRManager.getController(i)}.
   * Ouvrai reports trigger presses (from grips) and pinch events (from hands) on `leftRay.userData.isSelecting`.
   * @type {Group}
   */
  leftRay;
  /**
   * * Ouvrai keeps track of which WebXR input source {@link https://developer.mozilla.org/en-US/docs/Web/API/XRInputSource/hand hand object}
   * is currently associated with the tracked left hand. This is a reference to the three.js Group returned by
   * {@link https://threejs.org/docs/#api/en/renderers/webxr/WebXRManager.getController WebXRManager.getHand(i)}.
   * You can access individual joint position information using `leftHand.joints[<joint-name>]`. See https://www.w3.org/TR/webxr-hand-input-1/.
   * @type {Group}
   */
  leftHand;
  /**
   * Ouvrai keeps track of which WebXR input source {@link https://developer.mozilla.org/en-US/docs/Web/API/XRInputSource/gripSpace grip space}
   * is currently associated with the right VR controller. This is a reference to the three.js Group returned by
   * {@link https://threejs.org/docs/#api/en/renderers/webxr/WebXRManager.getControllerGrip WebXRManager.getControllerGrip(i)}.
   * This should give access to the `rightGrip.gamepad.hapticActuators[i].pulse()` method for haptic feedback, as well as other controller buttons.
   * @type {Group}
   */
  rightGrip;
  /**
   * Ouvrai keeps track of which WebXR input source {@link https://developer.mozilla.org/en-US/docs/Web/API/XRInputSource/targetRaySpace ray space}
   * is currently associated with the right controller/hand. This is a reference to the three.js Group returned by
   * {@link https://threejs.org/docs/#api/en/renderers/webxr/WebXRManager.getController WebXRManager.getController(i)}.
   * Ouvrai reports trigger presses (from grips) and pinch events (from hands) on `rightRay.userData.isSelecting`.
   * @type {Group}
   */
  rightRay;
  /**
   * * Ouvrai keeps track of which WebXR input source {@link https://developer.mozilla.org/en-US/docs/Web/API/XRInputSource/hand hand object}
   * is currently associated with the tracked right hand. This is a reference to the three.js Group returned by
   * {@link https://threejs.org/docs/#api/en/renderers/webxr/WebXRManager.getController WebXRManager.getHand(i)}.
   * You can access individual joint position information using `rightHand.joints[<joint-name>]`. See https://www.w3.org/TR/webxr-hand-input-1/.
   * @type {Group}
   */
  rightHand;

  /**
   * A place to create Clocks during an experiment.
   * @type {Clock[]}
   * @example
   * exp.clocks[9] = new Clock(); // Pick an arbitrary index for a given purpose
   * exp.clocks[9].start(); // Use that index wherever you need to access that clock
   * exp.clocks[9].getElapsedTime();
   */
  clocks = [];
  inputSources = [];

  /**
   * Ouvrai experiment code should always begin with `const exp = new Experiment(cfg)`, with the desired configuration options.
   * @param {Object} cfg Experiment configuration object. Becomes exp.cfg after initialization. Saved to Firebase at consent and completion.
   * @param {Object} cfg.devOptions (DEV) Various options to make development easier. Disabled in production.
   * @param {boolean} cfg.devOptions.skipConsent Skip the consent form
   * @param {boolean} cfg.devOptions.allowExitFullscreen Don't block if fullscreen is exited
   * @param {boolean} cfg.devOptions.allowExitPointerlock Don't block if pointerlock is exited
   * @param {boolean} cfg.devOptions.replay Enable replays of saved data from previous sessions
   * @param {boolean} cfg.devOptions.orbitControls Enable orbit controls to allow inspection of three.js scene?
   * @param {boolean} cfg.devOptions.saveTrialList Export the trial list as JSON when `exp.start()` is called?
   * @param {boolean} cfg.demo Use demo version of experiment (no consent, no Firebase)
   * @param {boolean} cfg.requireDesktop Block users on mobile devices
   * @param {boolean} cfg.requireChrome Block users not using Google Chrome
   * @param {boolean} cfg.requireVR Enable VR and block users on desktop
   * @param {boolean} cfg.orthographic Enable orthographic camera for simple 2D scenes?
   * @param {boolean} cfg.cssScene Overlay additional three.js scene for displaying UI via CSS objects
   * @param {boolean} cfg.audio Attach an audio listener to the viewer camera for 3D spatial audio
   * @param {color} cfg.backgroundColor Background color of experiment (default 'dimgray')
   * @param {URL} cfg.environmentLighting Imported URL of HDR lighting image
   * @param {boolean} cfg.handTracking (VR) Enable hand tracking
   * @param {boolean} cfg.handModels (VR) If hand tracking enabled, use OculusHandModel.js to show the hands
   * @param {boolean} cfg.controllerModels (VR) Display 3D controller models
   * @param {boolean} cfg.gridRoom (VR) Draw large cube with grid lines as minimal 3D environment
   */
  constructor(cfg) {
    this.cfg = cfg;

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
      this.VRUI = new XRInterface();
      this.sceneManager.scene.add(this.VRUI);
      //this.#initVR();
    }
  }

  /**
   * Start the main experiment loop. Usually takes three sequential functions: `calcFunc`, `stateFunc`, and `displayFunc`.
   * @param  {...function} loopFuncs
   */
  async start(...loopFuncs) {
    if (import.meta.env.PROD) {
      console.warn(
        'You are using a production version of an Ouvrai experiment. Disabling logs for performance.'
      );
      console.log = () => {};
      console.warn = () => {};
    }

    if (this.cfg.devOptions.saveTrialList) {
      const trialList = JSON.stringify(this.trials, null, 2);
      let a = document.createElement('a');
      let file = new Blob([trialList], { type: 'text/plain' });
      a.href = URL.createObjectURL(file);
      a.download = `${this.cfg.experiment}-trial-list-${DateTime.formatted(
        ''
      )}.json`;
      a.click();
    }

    if (this.cfg.requireVR) {
      await this.#initVR();
    }

    const mainLoop = function (time, frame) {
      try {
        this.checkHandsConnected(frame);
        this.sceneManager.renderer.setAnimationLoop(mainLoop);
        for (let func of loopFuncs) {
          func(time, frame);
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
          this.firebase.uid = currentUser?.user.uid || 'demo';
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
   * Creates exp.trials array as a property of your Experiment object, based on the supplied Blocks.
   * At the start of each trial, you should deep-copy the relevant trial with `trial = structuredClone(exp.trials[exp.trialNumber])`.
   * @param {Block[]} blocks Array of Blocks
   * @param {boolean} append Set true to append to the end of an existing trial list
   * @returns
   */
  createTrialSequence(blocks, append = false) {
    if (!Array.isArray(blocks) || !blocks.every((x) => typeof x === 'object')) {
      throw new Error(`Argument 'blocks' must be an array of Block.`);
    }
    if (!append) this.trials = [];
    let cycleNumber = this.trials.slice(-1)[0]?.cycle || 0;
    for (let [blockNumber, bk] of blocks.entries()) {
      bk.trials.map((t) => {
        t.blockNumber = blockNumber;
        t.cycle = t.block.repetition + cycleNumber;
      });
      this.trials.push(...bk.trials);
      cycleNumber = this.trials.slice(-1)[0]?.cycle + 1;
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
    this.progress.hide(); // VRUI contains its own progress bar

    this.sceneManager.renderer.xr.enabled = true;
    this.cfg.resetView = [];
    this.cfg.resetViewTime = [];

    // On session start, we apply max refresh rate and add a listener to record reset-view events
    this.sceneManager.renderer.xr.addEventListener(
      'sessionstart',
      function () {
        this.xrSession = this.sceneManager.renderer.xr.getSession();
        if (this.xrSession.supportedFrameRates) {
          let maxRate = this.xrSession.supportedFrameRates.reduce((a, b) =>
            a > b ? a : b
          );
          this.xrSession.updateTargetFrameRate(maxRate);
        }
        this.xrReferenceSpace =
          this.sceneManager.renderer.xr.getReferenceSpace();
        try {
          this.xrReferenceSpace.addEventListener('reset', (e) => {
            this.sceneManager.clearCameraOffset();
            this.cfg.resetView.push(e.transform); // [Mar 2023] transform attribute is always null...
            this.cfg.resetViewTime.push(e.timeStamp);
          });
        } catch (err) {
          console.error(err);
        }
      }.bind(this)
    );

    this.sceneManager.renderer.xr.addEventListener(
      'sessionend',
      /** Set recentered=false on 'sessionend' so sceneManager will recenter if user re-enters VR */
      function () {
        this.sceneManager.recentered = false;
      }.bind(this)
    );

    // Import the Enter VR button, add a listener, and style it to go into the panel-container
    let module = await import('three/examples/jsm/webxr/VRButton.js');
    this.vrButton = module.VRButton.createButton(this.sceneManager.renderer);
    this.vrButton.style.background = 'black';
    this.vrButton.style.fontWeight = 'bold';
    this.vrButton.style.position = '';
    this.vrButton.style.marginTop = '10px';
    this.vrButton.style.fontSize = '18px';
    this.vrButton.style.order = 2; // center
    this.vrButton.style.width = '150px';
    this.vrButton.addEventListener('click', () => {
      this.loadBackground(this.cfg.sceneBackgroundURL, this.scene);
      this.audioListener?.context.resume();
    });
    document.getElementById('panel-container').appendChild(this.vrButton);

    // Controller Target Ray Spaces
    this.ray1 = this.sceneManager.renderer.xr.getController(0);
    this.ray2 = this.sceneManager.renderer.xr.getController(1);

    this.ray1.addEventListener(
      'selectstart',
      () => (this.ray1.userData.isSelecting = true)
    );
    this.ray1.addEventListener(
      'selectend',
      () => (this.ray1.userData.isSelecting = false)
    );
    this.ray2.addEventListener(
      'selectstart',
      () => (this.ray2.userData.isSelecting = true)
    );
    this.ray2.addEventListener(
      'selectend',
      () => (this.ray2.userData.isSelecting = false)
    );
    this.ray1.addEventListener(
      'pinchstart',
      () => (this.ray1.userData.isSelecting = true)
    );
    this.ray1.addEventListener(
      'pinchend',
      () => (this.ray1.userData.isSelecting = false)
    );
    this.ray2.addEventListener(
      'pinchstart',
      () => (this.ray2.userData.isSelecting = true)
    );
    this.ray2.addEventListener(
      'pinchend',
      () => (this.ray2.userData.isSelecting = false)
    );

    // Controller Grip Spaces
    this.grip1 = this.sceneManager.renderer.xr.getControllerGrip(0);
    this.grip2 = this.sceneManager.renderer.xr.getControllerGrip(1);

    // XRControllerModelFactory will automatically fetch controller models
    // that match what the user is holding based or xrInputProfiles array.
    // The models should be attached to the grip space to match the orientation of the held device.
    if (this.cfg.controllerModels) {
      module = await import(
        'three/examples/jsm/webxr/XRControllerModelFactory.js'
      );
      const controllerModelFactory = new module.XRControllerModelFactory();
      this.grip1.add(controllerModelFactory.createControllerModel(this.grip1));
      this.grip2.add(controllerModelFactory.createControllerModel(this.grip2));
    }

    // Names are not essential just helpful in the console sometimes
    this.ray1.name = 'ray1';
    this.ray2.name = 'ray2';
    this.grip1.name = 'grip1';
    this.grip2.name = 'grip2';

    this.sceneManager.cameraGroup.add(this.ray1);
    this.sceneManager.cameraGroup.add(this.ray2);
    this.sceneManager.cameraGroup.add(this.grip1);
    this.sceneManager.cameraGroup.add(this.grip2);

    if (this.cfg.handTracking) {
      // Hand Tracking Spaces
      this.hand1 = this.sceneManager.renderer.xr.getHand(0);
      this.hand2 = this.sceneManager.renderer.xr.getHand(1);
      // Hand Models
      if (this.cfg.handModels) {
        let module = await import(
          'three/examples/jsm/webxr/XRHandModelFactory.js'
        );
        let handModelFactory = new module.XRHandModelFactory();
        this.hand1.userData.currentHandModel = 0;
        this.hand2.userData.currentHandModel = 0;
        this.hand1Models = [
          handModelFactory.createHandModel(this.hand1, 'boxes'),
          handModelFactory.createHandModel(this.hand1, 'mesh'),
        ];
        this.hand2Models = [
          handModelFactory.createHandModel(this.hand2, 'boxes'),
          handModelFactory.createHandModel(this.hand2, 'mesh'),
        ];

        this.hand1Models[0].visible = true;
        this.hand1.add(this.hand1Models[0]);
        this.hand1Models[1].visible = false;
        this.hand1.add(this.hand1Models[1]);
        this.hand2Models[0].visible = true;
        this.hand2.add(this.hand2Models[0]);
        this.hand2Models[1].visible = false;
        this.hand2.add(this.hand2Models[1]);
      }

      this.hand1.name = 'hand1';
      this.hand2.name = 'hand2';

      this.sceneManager.cameraGroup.add(this.hand1);
      this.sceneManager.cameraGroup.add(this.hand2);
    }

    this.ray1.addEventListener(
      'disconnected',
      function (e) {
        this.onDisconnectedController(e, 1);
      }.bind(this)
    );

    this.ray1.addEventListener(
      'connected',
      function (e) {
        this.onConnectedController(e, 1);
      }.bind(this)
    );

    this.ray2.addEventListener(
      'disconnected',
      function (e) {
        this.onDisconnectedController(e, 2);
      }.bind(this)
    );

    this.ray2.addEventListener(
      'connected',
      function (e) {
        this.onConnectedController(e, 2);
      }.bind(this)
    );
  }

  ////////////// Start controller listeners

  /**
   * Assigns a newly connected input source to the correct experiment object (left vs. right, grip vs. ray vs. hand).
   * Also records information about the input source in the exp.cfg object (controller type, support for haptics).
   * @param {Event} e Event object containing XRInputSource as `data` property.
   * @param {integer} i Index of the WebXRController "slot" that is connected to the input source.
   */
  onConnectedController(e, i) {
    let inputSource = e.data;
    this.inputSources[i - 1] = inputSource;
    this.inputSourceChanged = true;
    // console.log(
    //   'connected',
    //   inputSource.handedness,
    //   inputSource.hand ? 'hand' : 'grip'
    // );
    // console.log(inputSource.gamepad);
    // console.log('----');
    let grip, ray, hand;
    this.cfg.xrInputProfiles = inputSource.profiles;
    let hapticActuators = inputSource.gamepad?.hapticActuators;
    this.cfg.supportHaptic = Array.isArray(hapticActuators)
      ? hapticActuators.length
      : false;
    if (i === 1) {
      grip = this.grip1;
      ray = this.ray1;
      hand = this.hand1;
    } else if (i === 2) {
      grip = this.grip2;
      ray = this.ray2;
      hand = this.hand2;
    }
    if (inputSource.hand) {
      if (inputSource.handedness == 'left') {
        this.leftHand = hand;
        if (this.leftHand) {
          this.leftHand.input = inputSource;
        }
        this.leftRay = ray;
        this.leftRay.input = inputSource;
      } else if (inputSource.handedness == 'right') {
        this.rightHand = hand;
        if (this.rightHand) {
          this.rightHand.input = inputSource;
        }
        this.rightRay = ray;
        this.rightRay.input = inputSource;
        this.rightRay.add(this.VRUI.xrPointer);
      }
      const handConnectEvent = new CustomEvent('handconnect', {
        bubbles: true,
        cancelable: true,
        detail: { hand: inputSource.handedness },
      });
      document.body.dispatchEvent(handConnectEvent);
    } else {
      if (inputSource.handedness == 'left') {
        this.leftGrip = grip;
        this.leftGrip.input = inputSource;
        this.leftRay = ray;
        this.leftRay.input = inputSource;
      } else if (inputSource.handedness == 'right') {
        this.rightGrip = grip;
        this.rightGrip.input = inputSource;
        this.rightRay = ray;
        this.rightRay.input = inputSource;
        this.rightRay.add(this.VRUI.xrPointer);
      }
      const gripConnectEvent = new CustomEvent('gripconnect', {
        bubbles: true,
        cancelable: true,
        detail: { hand: inputSource.handedness },
      });
      document.body.dispatchEvent(gripConnectEvent);
    }
  }

  onDisconnectedController(e, i) {
    let inputSource = e.data;
    this.inputSources[this.inputSources.indexOf(inputSource)] = null;
  }

  /**
   * Sets flags that indicate whether you are getting hand tracking data from each hand when input sources change.
   *
   * When a hand loses tracking, it will be disconnected, but (on Meta Quest 2) a "dummy hand" input source is connected
   *  in its place and any rendered hand models will jump to the local-floor origin.
   * To determine whether hand tracking has been lost, we must call the XRFrame method getPose().
   * The current XRFrame is available only in the requestAnimationFrame callback, so we must do this in the mainLoop.
   *
   * Another possible workaround: The inputSource.gamepad property may be null on real hands, but not "dummy hands".
   * @param {XRFrame} frame Frame provided within the requestAnimationFrame callback.
   */
  checkHandsConnected(frame) {
    if (this.sceneManager.renderer.xr.isPresenting && this.inputSourceChanged) {
      for (let [i, source] of this.inputSources.entries()) {
        if (source?.hand) {
          if (
            frame.getJointPose(
              source.hand.get('wrist'),
              this.xrReferenceSpace
            ) === null
          ) {
            if (source.handedness === 'right') {
              this.rightHandConnected = false;
              console.log(
                `Right hand not tracking, but input ${i} is of type hand...`
              );
            } else if (source.handedness === 'left') {
              this.leftHandConnected = false;
              console.log(
                `Left hand not tracking, but input ${i} is of type hand...`
              );
            }
          } else {
            if (source.handedness === 'right') {
              this.rightHandConnected = true;
              console.log(`Right hand is tracking as input source ${i}`);
            } else if (source.handedness === 'left') {
              this.leftHandConnected = true;
              console.log(`Left hand is tracking as input source ${i}`);
            }
          }
        } else if (source) {
          if (source?.handedness === 'right') {
            this.rightHandConnected = false;
            console.log('Right grip connected.');
          } else if (source?.handedness === 'left') {
            this.leftHandConnected = false;
            console.log('Left grip connected.');
          }
        }
      }
      this.inputSourceChanged = false;
    }
  }

  /**
   * Check if we are in VR and if each hand is connected
   * @param {boolean} left Require left hand?
   * @param {boolean} right Require right hand?
   * @returns {boolean} True if we should interrupt, false otherwise
   */
  handInterrupt(left = true, right = true) {
    return (
      this.sceneManager.renderer.xr.isPresenting &&
      ((left && !this.leftHandConnected) || (right && !this.rightHandConnected))
    );
  }

  /**
   * Check if we are in VR and if each controller is connected.
   * @param {boolean} left Require left controller?
   * @param {boolean} right Require right controller?
   * @returns {boolean} True if we should interrupt, false otherwise
   */
  controllerInterrupt(left = true, right = true) {
    return (
      this.sceneManager.renderer.xr.isPresenting &&
      ((left &&
        (!this.leftGrip || !this.leftGrip.visible || this.leftHandConnected)) ||
        (right &&
          (!this.rightGrip ||
            !this.rightGrip.visible ||
            this.rightHandConnected)))
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
   * Load and set a custom background for three.js scene.
   * @param {URL} sceneBackgroundURL JPG image asset URL.
   */
  loadBackground(sceneBackgroundURL) {
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

  /**
   * Adds listeners that respond to:
   *
   * 1. Toggling instruction panel (keydown i)
   * 2. Local save in dev mode (keydown Shift+s)
   * 3. Consent form accepted -> `consented` property set to true
   * 4. Survey submitted -> form responses added to `cfg`
   *
   * Additional unused listeners (these only print to console in debug):
   * - savesuccessful
   * - db(dis)connect
   * - (enter|exit)fullscreen
   * - (enter|exit)pointerlock
   * @private
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
