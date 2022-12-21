/*** third-party imports ***/
import {
  Color,
  LineBasicMaterial,
  LineSegments,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  sRGBEncoding,
  TextureLoader,
  Vector3,
  WebGLRenderer,
  //ArrowHelper,
  AudioListener,
  PositionalAudio,
  AudioLoader,
  Clock,
  Group,
  BoxGeometry,
  MeshStandardMaterial,
  SphereGeometry,
} from 'three';
import { BoxLineGeometry } from 'three/examples/jsm/geometries/BoxLineGeometry.js';
import { Easing, Tween, update as tweenUpdate } from '@tweenjs/tween.js'; // https://github.com/tweenjs/tween.js/

import ThreeMeshUI from 'three-mesh-ui';

/*** weblab imports ***/
import {
  Experiment,
  BlockOptions,
  State,
  DisplayElement,
  //Survey,
  MeshFactory,
  XRInterface,
  Collider,
  XRVisor,
} from 'weblab';

/*** static asset URL imports ***/
import consentURL from './consent.jpg'; // jpg for VR as MQ Browser doesn't support pdfs in iframes
import environmentLightingURL from 'weblab/lib/environments/IndoorHDRI003_1K-HDR.exr?url';
import bubbleSoundURL from './bubblePopping.mp3?url';

async function main() {
  // create new experiment with configuration options
  const exp = new Experiment({
    name: 'example_vr',
    consentPath: consentURL,
    prolificLink: 'https://app.prolific.co/submissions/complete?cc=CKSP0NI1', // Get completion link from Prolific study details
    requireDesktop: false,
    requireChrome: false,
    vrAllowed: true,

    cssBackground: 'dimgray', // color name string: http://davidbau.com/colors/

    // Experiment-specific quantities
    // Assume meters and seconds for three.js, but note tween.js uses milliseconds
    handleStartTiltRadians: 0, //-Math.PI / 6, // neutral pose of grip space is slightly tilted forwards
    handleLength: 0.09,

    environmentLighting: environmentLightingURL,

    numBaselineCycles: 10,
    numRampCycles: 40,
    numPlateauCycles: 5,
    numWashoutCycles: 10,
    rampDegreesPerCycle: 0.5,
    restTrials: [30, 70],

    startDelay: 0.25,

    restDuration: 30,
    startNoFeedbackDuration: 10,
    startNoFeedbackTrial: 12,
    noFeedbackNear: 0.015,

    // reset view events (VR-specific)
    resetView: [],
    resetViewTime: [],
  });
  exp.progress.hide();

  // Create finite state machine (experiment flow manager)
  exp.cfg.stateNames = [
    'BROWSER',
    'CONSENT',
    'SIGNIN',
    'WELCOME',
    'CALIBRATE',
    'CONFIRM',
    'SETUP',
    'START',
    'DELAY',
    'REACH',
    'RETURN',
    'FINISH',
    'ADVANCE',
    'REST',
    'STARTNOFEEDBACK',
    'RESUME',
    'SURVEY',
    'CODE',
    'CONTROLLER',
    'DBCONNECT',
    'BLOCKED',
  ];
  const state = new State(exp.cfg.stateNames, handleStateChange);

  // Create any customizable elements
  //const survey = new Survey(); // here we use the default demographic survey

  // Add listeners for default weblab events
  addDefaultEventListeners();

  // set debug options
  if (location.hostname === 'localhost') {
    exp.consented = true; // skip consent in development
  } else {
    console.log = function () {}; // disable console logs in production
    console.warn = function () {}; // disable console logs in production
  }

  // Conditions
  exp.cfg.condition = 0;

  switch (exp.cfg.condition) {
    case 0:
      exp.cfg.conditionName = 'gradual';
      exp.cfg.maxRotation = exp.cfg.numRampCycles * exp.cfg.rampDegreesPerCycle;
      break;

    case 1:
      exp.cfg.conditionName = 'abrupt';
      exp.cfg.numRampCycles = 0;
      exp.cfg.numPlateauCycles = 45;
      exp.cfg.maxRotation = 20;
      break;
  }

  // Unique per-target
  exp.cfg.targetIds = [0, 1];
  exp.cfg.targetColors = ['red', 'blue'];
  exp.cfg.targetRotationSigns = [-1, 1];
  exp.homeColors = [];

  // Shared by both targets
  exp.cfg.targetRadius = 0.02;
  exp.cfg.targetSeparation = 0.16;
  exp.cfg.targetDistance = 0.2;
  exp.cfg.homePosn = new Vector3(0, 0.9, -0.3);

  // Shared by both control points
  //exp.cfg.controlPointDimensions = new Vector3(0.02, 0.02, 0.04);
  exp.cfg.controlPointRadius = 0.01;

  /********************** */
  /** SCENE & CONTROLLERS */

  // Create threejs scene (1 unit = 1 meter, RH coordinate space)
  // eslint-disable-next-line no-unused-vars
  let [camera, scene, renderer, ray1, ray2, grip1, grip2, hand1, hand2] =
    await initScene();

  // Audio listener on the camera
  exp.audioListener = new AudioListener();
  camera.add(exp.audioListener);

  // Prepare texture loader
  //const pbrMapper = new PBRMapper();

  // Put the tool in the RIGHT HAND
  // Can't be sure whether grip1 or grip2 is the right hand, must check on connection
  if (grip1) {
    grip1.addEventListener('connected', handleGripConnected);
    grip1.addEventListener('disconnected', handleGripDisconnected);
    grip2.addEventListener('connected', handleGripConnected);
    grip2.addEventListener('disconnected', handleGripDisconnected);
  }
  if (ray1) {
    ray1.addEventListener('connected', handleRayConnected);
    ray1.addEventListener('disconnected', handleRayDisconnected);
    ray2.addEventListener('connected', handleRayConnected);
    ray2.addEventListener('disconnected', handleRayDisconnected);
  }
  // if you wanted to use the hand space you'd do the same here

  /***** */
  /** UI */

  const UI = new XRInterface();
  scene.add(UI);
  UI.nextButton.states['selected'].onSet = function () {
    exp.proceed = true;
    exp.ray.userData.isSelecting = false;
  };
  UI.backButton.states['selected'].onSet = function () {
    exp.goBack = true;
    exp.ray.userData.isSelecting = false;
  };

  // Gaze-locked visor text
  const visor = new XRVisor();
  camera.add(visor);

  /********** */
  /** OBJECTS */

  // Create tool
  let toolMaterial = new MeshStandardMaterial({
    color: 'slategray',
    roughness: 0.7,
    metalness: 1,
  });
  const toolHandle = MeshFactory.cylinder({
    radius: 0.02,
    height: exp.cfg.handleLength,
    material: toolMaterial,
    radialSegments: 24,
  });
  // cylinders in world space are oriented along +Y
  // but grip in grip space is oriented along -Z
  // rotate cylinder -90deg around X so +Y moves along the grip
  toolHandle.rotateX(-Math.PI / 2);
  const toolBar = MeshFactory.cylinder({
    radius: exp.cfg.controlPointRadius * 0.99,
    height: exp.cfg.targetSeparation, // - 2 * exp.cfg.controlPointRadius,
    openEnded: true,
    material: toolMaterial,
    radialSegments: 24,
  });
  // tool bar is child of handle, so +Y already oriented along the grip
  // translate up the grip by half the handle length
  toolBar.translateY(exp.cfg.handleLength / 2 - exp.cfg.controlPointRadius);
  // +Z is currently sticking out of the back of the thumb
  // rotate 90 degrees to get the T-shape
  // as a result, local +X is down the grip, local +Y is to the right
  toolBar.rotateZ(-Math.PI / 2);
  toolHandle.add(toolBar);

  // Create workspace root
  const workspace = new Group();
  scene.add(workspace);
  workspace.position.set(...exp.cfg.homePosn);

  // Home position
  const home = new Group();
  workspace.add(home);
  home.visible = false;

  const cp = MeshFactory.sphere({
    radius: exp.cfg.controlPointRadius,
  });
  cp.add(new Collider(new SphereGeometry(exp.cfg.controlPointRadius, 8, 4)));
  // cube of edge length 2r contains the sphere entirely (but looks too big as wireframe)
  // sphere of radius r circumscribes a cube of edge length 2r/sqrt(3) (~1.15)
  const homecp = MeshFactory.edges({
    geometry: new BoxGeometry(
      exp.cfg.controlPointRadius,
      exp.cfg.controlPointRadius,
      exp.cfg.controlPointRadius,
      1,
      1
    ),
  });
  homecp.scale.setScalar(1.5); // so pick a sizebetween 1.15 and 2
  const targ = MeshFactory.torus({
    majorRadius: exp.cfg.targetRadius,
    minorRadius: exp.cfg.targetRadius * 0.1,
    radialSegments: 8,
    tubularSegments: 24,
  });
  const targCenter = MeshFactory.cylinder({
    radius: exp.cfg.targetRadius - exp.cfg.controlPointRadius,
    height: exp.cfg.targetRadius * 0.1,
    openEnded: false,
  });
  targCenter.visible = false;
  targCenter.rotateX(-Math.PI / 2);
  targ.add(targCenter);

  // Per-target (or per-control point) parameter loop
  const targets = [];
  const controlPoints = [];
  const homePoints = [];
  for (let oi of exp.cfg.targetIds) {
    // Create target material
    let col = new Color(exp.cfg.targetColors[oi]);
    let tmp = col.getHSL({});
    tmp.l = 0.3; // enforce equal luminance
    col.setHSL(tmp.h, tmp.s, tmp.l);
    let mati = new MeshStandardMaterial({ color: col });

    // Create home material
    exp.homeColors[oi] = new Color();
    tmp.l = 0.6; // 0.75; // enforce equal luminance
    tmp.s = 1.0; // 0.35; // enforce equal saturation
    exp.homeColors[oi].setHSL(tmp.h, tmp.s, tmp.l);

    // Create target instance
    let targi = targ.clone();
    workspace.add(targi);
    targi.translateX((oi - 0.5) * exp.cfg.targetSeparation);
    targi.translateZ(-exp.cfg.targetDistance);
    targi.material = mati;
    targi.userData.sound = new PositionalAudio(exp.audioListener);
    targi.add(targi.userData.sound);
    targi.hitTween = new Tween(targi)
      .to({ scale: { x: 0, y: 0, z: 0 } }, 220)
      .easing(Easing.Back.InOut)
      .onComplete(function (o) {
        o.visible = false;
        o.scale.setScalar(1);
      })
      .start();

    // Create arrow pointing at target along -z axis
    // let origin = new Vector3(0, 0, exp.cfg.targetDistance / 2);
    // let dir = new Vector3(0, 0, -1);
    // let length = exp.cfg.targetDistance / 2;
    // let arri = new ArrowHelper(dir, origin, length, null, exp.cfg.noFeedbackNear, 0.012);
    // arri.setColor(col);
    // arri.line.material.linewidth = 2;
    // targi.add(arri);

    // Create control point instance
    let cpi = cp.clone();
    toolBar.add(cpi);
    cpi.translateY((oi - 0.5) * exp.cfg.targetSeparation);
    cpi.material = mati;
    // glow effect
    cpi.material.emissive = new Color('white');
    cpi.material.emissiveIntensity = 0;
    cpi.glowTween = new Tween(cpi.material)
      .to({ emissiveIntensity: 0.15 }, 500)
      .repeat(Infinity)
      .yoyo(true)
      .easing(Easing.Sinusoidal.InOut)
      .onStop((m) => (m.emissiveIntensity = 0));

    // Create home point instance
    let homecpi = homecp.clone();
    home.add(homecpi);
    homecpi.material = new LineBasicMaterial({ color: exp.homeColors[oi] });
    homecpi.translateX((oi - 0.5) * exp.cfg.targetSeparation);
    homecpi.pulseTween = new Tween(homecpi.scale)
      .to({ x: 1.8, y: 1.8, z: 1.8 }, 350)
      .repeat(Infinity)
      .yoyo(true)
      .easing(Easing.Sinusoidal.InOut)
      .onStop((scale) => scale.setScalar(1.5));

    // Push to arrays
    targets.push(targi);
    controlPoints.push(cpi);
    homePoints.push(homecpi);
  }

  const demo = new Group();
  workspace.add(demo);
  demo.visible = false;
  const demoTool = toolHandle.clone(true);
  demo.add(demoTool);
  // remember to undo the rotation done to toolHandle
  demoTool.rotateX(Math.PI / 2 - Math.PI / 6);
  demoTool.material = new MeshStandardMaterial({
    color: '#1c2a29',
    roughness: 1,
    metalness: 1,
  });
  demoTool.children[0].material = demoTool.material;
  const demoControlPoints = demoTool.children[0].children;

  // No feedback region
  const region = MeshFactory.noFeedbackZone({
    near: exp.cfg.noFeedbackNear,
    far: exp.cfg.targetDistance,
  });
  workspace.add(region);
  region.translateZ(-0.025);
  region.visible = false;

  /************** */
  /** LOAD SOUNDS */

  const audioLoader = new AudioLoader();
  audioLoader.load(bubbleSoundURL, function (buffer) {
    targets.forEach((o) => o.userData.sound.setBuffer(buffer));
  });

  /****************** */
  /** TRIAL STRUCTURE */

  // on each trial, this trial object will be deep-copied from exp.trials[exp.trialNumber]
  let trial = {};
  // declare all values that must be specifically re-initialized on each trial
  const trialInitialize = {
    // render frames
    t: [],
    state: [],
    rhPos: [],
    rhOri: [],
    //hdPos: [],
    //hdOri: [],

    // state change events
    stateChange: [],
    stateChangeTime: [],
    stateChangeHeadPos: [],
    stateChangeHeadOri: [],
  };
  trial = structuredClone(trialInitialize);

  // Create trial structure using an array of block objects (in desired order)
  exp.createTrialSequence([
    // The keys of a block object are the variables, the values must be equal-length arrays
    // The combination of elements at index i are the variable values for one trial
    {
      targetId: [...exp.cfg.targetIds],
      // BlockOptions control trial sequencing behavior
      options: new BlockOptions(
        exp.cfg.conditionName,
        true,
        exp.cfg.numBaselineCycles +
          exp.cfg.numRampCycles +
          exp.cfg.numPlateauCycles +
          exp.cfg.numWashoutCycles
      ),
    },
  ]); // effect: creates exp.trials object array

  // Assign rotation sequence
  for (let t of exp.trials) {
    let tmp = t.cycle + 1; // 1-index is easier to work with here
    if (tmp <= exp.cfg.numBaselineCycles) {
      t.rotation = 0;
    } else if (tmp <= exp.cfg.numBaselineCycles + exp.cfg.numRampCycles) {
      t.rotation =
        (tmp - exp.cfg.numBaselineCycles) * exp.cfg.rampDegreesPerCycle;
    } else if (
      tmp <=
      exp.cfg.numBaselineCycles +
        exp.cfg.numRampCycles +
        exp.cfg.numPlateauCycles
    ) {
      t.rotation = exp.cfg.maxRotation;
    } else {
      t.rotation = 0;
    }
  }

  // Start the rAF loop
  mainLoopFunc(); // calcFunc() -> stateFunc() -> displayFunc()

  function mainLoopFunc() {
    renderer.setAnimationLoop(mainLoopFunc); // rAF loop manager for VR
    calcFunc();
    stateFunc();
    displayFunc();
  }

  function calcFunc() {
    // Check if control points are at their start positions
    //if ([state.START, state.DELAY, state.RETURN].includes(state.current)) {
    home.check = [false, false];
    // Is the player or the avatar in control?
    let toolPoints = controlPoints;
    if (state.current === state.CONFIRM) {
      toolPoints = demoControlPoints;
    }
    for (let oi = 0; oi < 2; oi++) {
      // check alignment
      home.check[oi] = checkAlignment({
        o1: homePoints[oi],
        o2: toolPoints[oi],
        angleThreshRads: false,
      });
      // set color and tween based on alignment
      if (home.check[oi]) {
        homePoints[oi].material.color = new Color('black');
        homePoints[oi].pulseTween.stop();
      } else {
        homePoints[oi].material.color = exp.homeColors[oi];
        homePoints[oi].pulseTween.start();
      }
    }
    //}
  }

  function stateFunc() {
    // Process interrupt flags as needed
    if (!exp.firebase.databaseConnected) {
      state.push(state.DBCONNECT);
    } else if (renderer.xr.isPresenting && (!exp.grip || !exp.ray)) {
      state.push(state.CONTROLLER);
    }

    switch (state.current) {
      case state.BLOCKED: {
        // dead-end state
        break;
      }

      case state.BROWSER: {
        // Redirect user to open link in VR headset
        if (!exp.cfg.vrSupported) {
          exp.blocker.show(exp.blocker.openInVR);
          state.next(state.BLOCKED);
        } else {
          // Any info we want to save should be added to the exp.cfg object
          exp.cfg.userAgent = window.navigator.userAgent;
          state.next(state.CONSENT);
        }
        break;
      }

      case state.CONSENT: {
        state.once(function () {
          exp.consent.show();
        });
        if (exp.consented) {
          exp.cfg.date = new Date().toISOString();
          exp.cfg.timeOrigin = performance.timeOrigin;
          exp.firebase.signInAnonymously();
          state.next(state.SIGNIN);
        }
        break;
      }

      case state.SIGNIN: {
        if (exp.firebase.uid) {
          exp.consent.hide();
          // regular dom elements don't have show() and hide()
          DisplayElement.show(renderer.domElement);
          exp.vrButton.style.width = '150px';
          DisplayElement.show(document.getElementById('panel-container'));
          state.next(state.WELCOME);
        }
        break;
      }

      case state.WELCOME: {
        state.once(function () {
          UI.title.set({ content: 'Instructions' });
          UI.instructions.set({
            content: `Welcome! You may sit or stand.\n\
            You will be reaching out quickly with your right hand, \
            so please make sure the area in front of you is clear.`,
          });
          UI.setInteractive();
        });
        if (exp.proceed) {
          state.next(state.CALIBRATE);
        }
        break;
      }

      case state.CALIBRATE: {
        state.once(function () {
          UI.title.set({ content: 'Calibrate' });
          UI.instructions.set({
            content: `Please calibrate your chest height.\n\
            Hold the controller against your chest and press the trigger.`,
          });
          UI.setInteractive(false);
          UI.backButton.setState('disabled');
          UI.nextButton.setState('disabled');
        });
        if (exp.ray.userData.isSelecting) {
          let adjustHeight = toolBar.getWorldPosition(new Vector3()).y - 0.05;
          if (exp.cfg.supportHaptic) {
            exp.grip.gamepad.hapticActuators[0].pulse(0.6, 80);
          }
          workspace.position.setY(adjustHeight);
          exp.cfg.homePosn.y = adjustHeight;
          state.next(state.CONFIRM);
        }
        break;
      }

      case state.CONFIRM: {
        state.once(function () {
          UI.title.set({ content: 'Comfortable?' });
          UI.instructions.set({
            content: `Please watch the demonstration.\n\
            Can you perform these movements?\n\
            Click Back to change the height.\n\
            Click Next to continue.`,
          });
          UI.backButton.setState('idle');
          UI.nextButton.setState('idle');
          UI.setInteractive();
          // Demonstration of the required movement with demo avatar
          home.visible = true;
          demo.visible = true;
          // Align the avatar with the home position,
          // translating to account for length/orientation
          demo.position.set(...home.position);
          demo.translateZ(
            (exp.cfg.handleLength / 2 - exp.cfg.controlPointRadius) *
              Math.sin(Math.PI / 6)
          );
          demo.translateY(
            -(exp.cfg.handleLength / 2 - exp.cfg.controlPointRadius) *
              Math.cos(Math.PI / 6)
          );
          if (!demo.demoTween || !demo.demoTween.isPlaying()) {
            demo.demoTween = generateDemoTween({
              target: demo,
              maxAngle: Math.PI / 32,
              dist: exp.cfg.targetDistance,
              duration: 750,
            });
          }
          demo.demoTween.start();
        });

        // Add logic for showing rings popping one at a time
        // Who pops them? Avatar or real?
        if (home.check.every((x) => x) && exp.demoTargetId === undefined) {
          exp.demoTargetId = Math.round(Math.random());
          exp.cpCollider = demoControlPoints[exp.demoTargetId].collider;
          exp.targetCenter = targets[exp.demoTargetId].children[0];
          targets[exp.demoTargetId].visible = true;
        }

        if (
          exp.demoTargetId !== undefined &&
          exp.cpCollider.test(exp.targetCenter)
        ) {
          // Auditory and hapic feedback
          targets[exp.demoTargetId].userData.sound.play();
          // Animate target hit
          targets[exp.demoTargetId].hitTween.start();
          // Reset
          exp.demoTargetId = undefined;
        }

        if (exp.proceed) {
          demo.demoTween.stop();
          demo.visible = false;
          state.next(state.SETUP);
        } else if (exp.goBack) {
          demo.demoTween.stop();
          demo.visible = false;
          state.next(state.CALIBRATE);
        }
        break;
      }

      case state.SETUP: {
        // Grab anything we might need from the previous trial

        // Start with a deep copy of the initialized trial from exp.trials
        trial = structuredClone(exp.trials[exp.trialNumber]);
        trial.trialNumber = exp.trialNumber;
        trial.startTime = performance.now();
        trial.noFeedback = trial.trialNumber >= exp.cfg.startNoFeedbackTrial;

        // Reset data arrays and other weblab defaults
        trial = { ...trial, ...structuredClone(trialInitialize) };

        // Set trial parameters
        trial.demoTrial =
          exp.trialNumber === 0 || (exp.trialNumber < 6 && exp.repeatDemoTrial);

        trial.rotation *= exp.cfg.targetRotationSigns[trial.targetId];

        exp.cpCollider = controlPoints[trial.targetId].collider;
        exp.targetCenter = targets[trial.targetId].children[0];

        state.next(state.START);
        break;
      }

      case state.START: {
        state.once(function () {
          UI.title.set({
            content: `Go to start`,
          });
          if (trial.demoTrial) {
            UI.instructions.set({
              content: `To start a trial, hold the ends of the tool inside the cubes.\n\
              The cubes turn black and stop pulsing when you are in the right place.`,
            });
          } else {
            UI.instructionsPanel.visible = false;
          }
          UI.buttonPanel.visible = false;
          UI.setInteractive(false);
          targets.forEach((o) => (o.visible = false));
        });

        if (home.check.every((x) => x)) {
          state.next(state.DELAY);
        }
        break;
      }

      case state.DELAY: {
        state.once(function () {
          controlPoints[trial.targetId].glowTween.start();
          // clear the frame data before we start recording
          // in case this is not our first visit to DELAY
          trial.t = [];
          trial.state = [];
          trial.rhPos = [];
          trial.rhOri = [];
        });
        // push device data to arrays
        handleFrameData();

        if (!home.check.every((x) => x)) {
          controlPoints[trial.targetId].glowTween.stop();
          state.next(state.START);
        } else if (state.expired(exp.cfg.startDelay)) {
          targets[trial.targetId].visible = true;
          // Update rotationOrigin then rotationRadians to avoid blips
          trial.rotationOrigin = exp.grip.position.clone();
          trial.rotationRadians = (trial.rotation * Math.PI) / 180;

          state.next(state.REACH);
        }
        break;
      }

      case state.REACH: {
        state.once(function () {
          UI.title.set({
            content: `Hit target`,
          });
          let col = exp.cfg.targetColors[trial.targetId];
          UI.instructions.set({
            content: `Reach forward so the ${col} end of the tool goes through the ${col} ring.\n\
            Then return to the start.`,
          });
        });

        // push device data to arrays
        handleFrameData();

        // hide tool within a certain region
        if (trial.noFeedback) {
          feedbackShowHide(toolHandle, home, region);
        }

        if (exp.cpCollider.test(exp.targetCenter)) {
          // Make sure they are going Forward through the ring.
          if (exp.grip.hasLinearVelocity && exp.grip.linearVelocity.z >= 0) {
            break;
          }
          // Auditory and hapic feedback
          targets[trial.targetId].userData.sound.play();
          if (exp.cfg.supportHaptic) {
            exp.grip.gamepad.hapticActuators[0].pulse(0.6, 80);
          }
          // Stop animating control point
          controlPoints[trial.targetId].glowTween.stop();

          // Animate target hit
          targets[trial.targetId].hitTween.start();

          // Show feedback if hidden
          if (trial.noFeedback) {
            toolHandle.visible = true;
            region.ring.visible = false;
          }
          state.next(state.RETURN);
        }
        break;
      }

      case state.RETURN: {
        state.once(function () {
          UI.title.set({
            content: `Go to start`,
          });
        });

        // push device data to arrays
        // (for 1-2 seconds to avoid massive data)
        if (!state.expired(1.5)) {
          handleFrameData();
        }

        if (home.check.every((x) => x)) {
          state.next(state.FINISH);
        }
        break;
      }

      case state.FINISH: {
        state.once(function () {
          // demo trial requires button press.
          if (trial.demoTrial) {
            UI.title.set({
              content: `Make sense?`,
            });
            UI.instructions.set({
              content: `Please try to avoid curving or rotating your hand. \
              There are two rest breaks.\n\
              To repeat the instructions, click Back.\n\
              If you are ready to start, click Next.`,
            });
            UI.setInteractive();
            UI.buttonPanel.visible = true;
            UI.backButton.text.set({ content: 'Back' });
            UI.nextButton.text.set({ content: 'Next' });
            UI.backButton.setState('idle');
            UI.nextButton.setState('idle');
          }
        });

        // Wait for a button click on demo trial
        if (trial.demoTrial) {
          if (exp.proceed) {
            exp.repeatDemoTrial = false;
          } else if (exp.goBack) {
            exp.repeatDemoTrial = true;
          } else {
            break;
          }
        }

        // make sure all the data we need is in the trial object
        exp.firebase.saveTrial(trial);
        state.next(state.ADVANCE);
        break;
      }

      case state.ADVANCE: {
        if (!exp.firebase.saveSuccessful) {
          // don't do anything until firebase save returns successful
          break;
        }

        exp.nextTrial();
        UI.progressInner.width =
          (UI.progress.width * exp.trialNumber) / exp.numTrials;

        if (exp.trialNumber < exp.numTrials) {
          if (
            exp.cfg.restTrials &&
            exp.cfg.restTrials.includes(exp.trialNumber)
          ) {
            state.next(state.REST);
          } else if (exp.trialNumber == exp.cfg.startNoFeedbackTrial) {
            state.next(state.STARTNOFEEDBACK);
          } else if (exp.repeatDemoTrial) {
            state.next(state.WELCOME);
          } else {
            state.next(state.SETUP);
          }
        } else {
          home.visible = false;
          exp.firebase.recordCompletion();
          exp.goodbye.updateGoodbye(exp.firebase.uid);

          DisplayElement.hide(renderer.domElement);
          state.next(state.SURVEY);
        }
        break;
      }

      case state.REST: {
        state.once(function () {
          UI.title.set({ content: 'Rest break' });
          UI.instructions.set({
            content: `Good work! \
            Take a short break to relax your arm. \
            Do not exit or remove your headset.`,
          });
          trial.rotation = 0; // shut off the rotation
          UI.instructionsPanel.visible = true;
          UI.buttonPanel.visible = true;
          UI.backButton.setState('disabled');
          UI.nextButton.setState('idle');
          initCountdown(exp.cfg.restDuration, UI.nextButton.text, () => {
            exp.proceed = false;
            toolHandle.visible = true;
            UI.setInteractive();
          });
          if (!exp.countdownFinished) {
            toolHandle.visible = false;
            UI.setInteractive(false);
          }
        });

        // hide tool within a certain region
        if (trial.noFeedback && UI.interactive) {
          feedbackShowHide(toolHandle, home, region);
        }

        if (exp.countdownFinished && exp.proceed) {
          exp.restClock.stop(); // otherwise it won't work next time!
          UI.setInteractive(false);
          UI.buttonPanel.visible = false;
          UI.instructionsPanel.visible = false;
          state.next(state.SETUP);
        }
        break;
      }

      case state.STARTNOFEEDBACK: {
        state.once(function () {
          UI.title.set({ content: 'Challenge' });
          UI.instructions.set({
            content: `Can you hit the targets without visual feedback?\n\
              In the gray area, the tool disappears. A black ring shows your distance.\n\
              Try it out!`,
          });
          region.visible = true;
          UI.instructionsPanel.visible = true;
          UI.buttonPanel.visible = true;
          UI.backButton.setState('disabled');
          UI.nextButton.setState('idle');
          initCountdown(
            exp.cfg.startNoFeedbackDuration,
            UI.nextButton.text,
            () => {
              exp.proceed = false;
              UI.setInteractive();
            }
          );
          if (!exp.countdownFinished) {
            UI.setInteractive(false);
          }
        });

        // hide tool within a certain region
        feedbackShowHide(toolHandle, home, region);

        if (exp.countdownFinished && exp.proceed) {
          feedbackShowHide(toolHandle, home, region, true); // force visible (if button clicked from zone)
          exp.restClock.stop(); // otherwise it won't work next time!
          UI.setInteractive(false);
          UI.buttonPanel.visible = false;
          UI.instructionsPanel.visible = false;
          state.next(state.SETUP);
        }
        break;
      }

      case state.SURVEY: {
        // if (survey.hidden) {
        //   survey.show();
        // }
        // if (exp.surveysubmitted) {
        exp.cfg.trialNumber = 'info';
        exp.firebase.saveTrial(exp.cfg, 'survey');
        //survey.hide();
        state.next(state.CODE);
        // }
        break;
      }

      case state.CODE: {
        if (!exp.firebase.saveSuccessful) {
          // don't do anything until firebase save returns successful
          break;
        }
        state.once(function () {
          exp.goodbye.show(); // show the goodbye screen w/ code & prolific link
          UI.title.set({
            content: `Complete`,
          });
          UI.instructions.set({
            content: `Thank you. Exit VR to find the submission link on the study web page.`,
          });
          UI.setInteractive();
          UI.instructionsPanel.visible = true;
          UI.buttonPanel.visible = true;
          UI.backButton.setState('disabled');
          UI.nextButton.text.set({ content: 'Exit' });
          UI.nextButton.setState('idle');
        });
        if (exp.proceed) {
          exp.xrSession.end();
        }
        break;
      }

      case state.CONTROLLER: {
        state.once(function () {
          if (state.last !== state.REST) {
            UI.title.set({ content: 'Controller' });
            UI.instructions.set({
              content: 'Please connect right hand controller.',
            });
          }
        });
        if (exp.ray && exp.grip) {
          state.pop();
        }
        break;
      }

      case state.DBCONNECT: {
        state.once(function () {
          exp.blocker.show('connection');
          visor.text.set({
            content: 'Network disconnected.\nReconnect to resume.',
          });
        });
        // exit state when reconnected
        if (exp.firebase.databaseConnected) {
          exp.blocker.hide();
          visor.text.set({ content: '' });
          state.pop();
        }
        break;
      }
    }
  }

  function handleStateChange() {
    trial.stateChange.push(state.current);
    trial.stateChangeTime.push(performance.now());
    // Head data at state changes only (see handleFrameData)
    trial.stateChangeHeadPos.push(camera.position.clone());
    trial.stateChangeHeadOri.push(camera.rotation.clone());
    // Reset flags related to UI buttons
    exp.proceed = false;
    exp.goBack = false;
  }

  function displayFunc() {
    // Compute rotation
    if (exp.grip && trial.rotationOrigin && trial.rotation !== 0) {
      let gripRotatedWorld = exp.grip.position.clone(); // grip posn in world coords
      gripRotatedWorld.sub(trial.rotationOrigin); // subtract origin
      gripRotatedWorld.applyAxisAngle(
        // rotate around world up
        new Vector3(0, 1, 0),
        trial.rotationRadians
      );
      gripRotatedWorld.add(trial.rotationOrigin); // add origin back on
      // Convert to grip space coordinates and assign to the tool
      toolHandle.position.copy(exp.grip.worldToLocal(gripRotatedWorld));
    }

    tweenUpdate();
    ThreeMeshUI.update();
    UI.updateButtons();
    renderer.render(scene, camera);
  }

  // Custom event handlers
  function handleFrameData() {
    if (exp.grip) {
      trial.t.push(performance.now());
      trial.state.push(state.current);
      trial.rhPos.push(exp.grip.position.clone());
      trial.rhOri.push(exp.grip.rotation.clone());
      //trial.hdPos.push(camera.position.clone());
      //trial.hdOri.push(camera.rotation.clone());
    }
  }

  function handleResize() {
    camera.aspect =
      exp.cfg.fixedAspect || window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  function handleGripDisconnected(event) {
    if (exp.grip && !event.data.hand && event.data.handedness === 'right') {
      console.log('RH grip disconnect');
      exp.grip.clear();
      scene.remove(exp.grip);
      exp.grip = undefined;
    }
  }

  function handleRayDisconnected(event) {
    if (exp.ray && !event.data.hand && event.data.handedness === 'right') {
      console.log('RH ray disconnect');
      exp.ray.clear();
      scene.remove(exp.ray);
      exp.ray = undefined;
    }
  }

  function handleGripConnected(event) {
    if (!event.data.hand && event.data.handedness === 'right') {
      console.log('RH grip connect');
      exp.grip = this;
      exp.grip.gamepad = event.data.gamepad;
      exp.cfg.supportHaptic =
        'hapticActuators' in event.data.gamepad &&
        event.data.gamepad.hapticActuators !== null &&
        event.data.gamepad.hapticActuators.length > 0;
      exp.grip.add(toolHandle);
      scene.add(exp.grip);
    }
  }

  function handleRayConnected(event) {
    if (!event.data.hand && event.data.handedness === 'right') {
      console.log('RH ray connect');
      exp.ray = this;
      if (UI.xrPointer.isObject3D) {
        exp.ray.add(UI.xrPointer);
      }
      scene.add(exp.ray);
    }
  }

  function addDefaultEventListeners() {
    if (location.hostname === 'localhost') {
      document.body.addEventListener('keydown', (event) => {
        if (event.key === 'S') {
          exp.firebase.localSave();
        }
      });
    }

    document.body.addEventListener('consent', () => {
      console.log('document.body received consent event, signing in...');
      exp.consented = true;
    });

    document.body.addEventListener('surveysubmitted', (e) => {
      console.log(
        'document.body received surveysubmitted event, saving data...'
      );
      for (let [k, v] of Object.entries(e.detail.survey)) {
        exp.cfg[k] = v;
      }
      exp.surveysubmitted = true;
    });

    document.body.addEventListener('savesuccessful', () => {
      console.log('document.body received savesuccessful event, trial saved');
    });
  }

  async function initScene() {
    // 0. Define renderer(s)
    let renderer = new WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputEncoding = sRGBEncoding;
    renderer.toneMapping = 4; //ACESFilmicToneMapping;

    // 1. Create a scene
    let scene = new Scene();
    // Default background matches CSS background
    scene.background = new Color(exp.cfg.cssBackground);

    // Create a wireframe backdrop
    let room = new LineSegments(
      new BoxLineGeometry(6, 6, 6, 10, 10, 10).translate(0, 3, 0),
      new LineBasicMaterial({ color: 'black' })
    );
    scene.add(room);

    //scene.add(new HemisphereLight());

    // Add light using an environment map
    if (exp.cfg.environmentLighting) {
      const pmremGenerator = new PMREMGenerator(renderer);
      if (exp.cfg.environmentLighting.endsWith('.js')) {
        // Option 1: Provide a pre-built Scene object (see RoomEnvironment.js)
        const module = import('weblab/lib/components/RoomEnvironment.js');
        scene.environment = pmremGenerator.fromScene(
          new module.RoomEnvironment(0.5),
          0.04
        ).texture;
        pmremGenerator.dispose();
      } else if (
        // Option 2: Provide a .hdr or .exr image
        exp.cfg.environmentLighting.endsWith('.exr') ||
        exp.cfg.environmentLighting.endsWith('.hdr')
      ) {
        let envLoader;
        if (exp.cfg.environmentLighting.endsWith('.exr')) {
          const module = await import('weblab/lib/components/EXRLoader.js');
          envLoader = new module.EXRLoader();
        } else {
          const module = await import(
            'three/examples/jsm/loaders/RGBELoader.js'
          );
          envLoader = new module.RGBELoader();
        }
        envLoader.load(exp.cfg.environmentLighting, (texture) => {
          scene.environment =
            pmremGenerator.fromEquirectangular(texture).texture;
          pmremGenerator.dispose();
          texture.dispose();
        });
      }
    }

    // 2. Define camera (if not added to scene, used as default by all renderers)
    let camera = new PerspectiveCamera(
      70,
      exp.cfg.fixedAspect || window.innerWidth / window.innerHeight,
      0.01,
      10
    );
    camera.position.set(0, 1.6, 3);
    scene.add(camera);

    // 3. Setup VR if enabled
    let ray1, ray2, grip1, grip2, hand1, hand2;
    if (navigator.xr) {
      exp.cfg.vrSupported = await navigator.xr.isSessionSupported(
        'immersive-vr'
      );
      if (exp.cfg.vrAllowed && exp.cfg.vrSupported) {
        [ray1, ray2, grip1, grip2, hand1, hand2] = await initVR(
          renderer,
          scene
        );
      }
    }

    // 4. Manage DOM
    document.getElementById('screen').appendChild(renderer.domElement);
    DisplayElement.hide(renderer.domElement);

    // 5. Add resize listener
    window.addEventListener('resize', handleResize);

    return [camera, scene, renderer, ray1, ray2, grip1, grip2, hand1, hand2];
  }

  async function initVR(renderer, scene) {
    renderer.xr.enabled = true;
    renderer.xr.addEventListener('sessionstart', function () {
      exp.xrSession = renderer.xr.getSession();
      exp.xrReferenceSpace = renderer.xr.getReferenceSpace();
      exp.xrSession.updateTargetFrameRate(
        exp.xrSession.supportedFrameRates.reduce((a, b) => (a > b ? a : b))
      );
      exp.xrReferenceSpace.addEventListener('reset', (e) => {
        // EAC [Nov 2022] transform attribute is null on Quest 2 tests
        exp.cfg.resetView.push(e.transform);
        exp.cfg.resetViewTime.push(e.timeStamp);
      });
      // exp.xrSession.addEventListener('inputsourceschange', function (e) {
      //   console.log(e, this.controllers, this.controllerInputSources);
      // });
    });

    let module = await import('three/examples/jsm/webxr/VRButton.js');
    let vrButton = module.VRButton.createButton(renderer);
    // adjust css so it fits in flexbox at top
    vrButton.style.background = 'black';
    vrButton.style.fontWeight = 'bold';
    vrButton.style.position = '';
    vrButton.style.marginTop = '10px';
    vrButton.style.fontSize = '18px';
    vrButton.style.order = 2; // center
    vrButton.addEventListener('click', () => {
      loadBackground(exp.cfg.sceneBackgroundURL, scene);
      if (exp.audioListener) {
        exp.audioListener.context.resume();
      }
    });
    document.getElementById('panel-container').appendChild(vrButton);
    exp.vrButton = vrButton;

    // getController(idx) returns a Group representing the target ray space
    // getControllerGrip(idx) returns a Group representing the grip space
    // getHand(idx) returns a Group representing the hand space

    // WebXRManager.controllers is a length N array (N probably = 2)
    // Each element (WebXRController) can retrieve all 3 spaces
    // And they are remembered once retrieved
    // Session events are dispatched to all three spaces
    // update() method is called in the default onAnimationFrame loop

    // Controller Target Ray Spaces
    let ray1 = renderer.xr.getController(0);
    ray1.addEventListener(
      'selectstart',
      () => (ray1.userData.isSelecting = true)
    );
    ray1.addEventListener(
      'selectend',
      () => (ray1.userData.isSelecting = false)
    );
    let ray2 = renderer.xr.getController(1);
    ray2.addEventListener(
      'selectstart',
      () => (ray2.userData.isSelecting = true)
    );
    ray2.addEventListener(
      'selectend',
      () => (ray2.userData.isSelecting = false)
    );

    // Controller Grip Spaces
    let grip1 = renderer.xr.getControllerGrip(0);
    let grip2 = renderer.xr.getControllerGrip(1);

    // Hand Tracking Spaces
    let hand1; // = renderer.xr.getHand(0);
    let hand2; // = renderer.xr.getHand(1);

    // For hand models:
    // module = await import('three/examples/jsm/webxr/OculusHandModel.js');
    // hand1.add(new module.OculusHandModel(hand1));

    // For controller models:
    // The XRControllerModelFactory will automatically fetch controller models
    // that match what the user is holding as closely as possible. The models
    // should be attached to the object returned from getControllerGrip in
    // order to match the orientation of the held device.
    // module = await import(
    //   'three/examples/jsm/webxr/XRControllerModelFactory.js'
    // );
    // const controllerModelFactory = new module.XRControllerModelFactory();
    // grip1.add(controllerModelFactory.createControllerModel(grip1));

    return [ray1, ray2, grip1, grip2, hand1, hand2];
  }

  function loadBackground(sceneBackgroundURL, scene) {
    // Load a custom background
    if (sceneBackgroundURL && sceneBackgroundURL.endsWith('.jpg')) {
      const loader = new TextureLoader();
      loader.load(sceneBackgroundURL, (texture) => {
        const generator = new PMREMGenerator(renderer);
        texture = generator.fromEquirectangular(texture).texture;
        scene.background = texture;
        texture.dispose();
        generator.dispose();
      });
    }
  }

  function checkAlignment({
    o1,
    o2,
    distanceThresh = 0.01, // 1 cm
    angleThreshRads = 0.0873, // ~5 deg
    axis = 'z',
  }) {
    let aOkay = !angleThreshRads;
    let dOkay = !distanceThresh;

    if (!dOkay) {
      let o1p = o1.getWorldPosition(new Vector3());
      let o2p = o2.getWorldPosition(new Vector3());
      let d = o1p.distanceTo(o2p); // distance
      //console.log(`distance = ${d}`);
      dOkay = d < distanceThresh;
    }
    if (!aOkay) {
      o1.updateWorldMatrix(true, false);
      o2.updateWorldMatrix(true, false);
      // Scene object does not have matrixWorld, only matrix
      let o1a = o1.isScene ? o1.matrix.elements : o1.matrixWorld.elements;
      let o2a = o2.isScene ? o2.matrix.elements : o2.matrixWorld.elements;
      // start of slice (first 3 columns of matrix world are +X, +Y, +Z)
      let ss = axis === 'x' ? 0 : axis === 'y' ? 4 : 8;
      // slice, normalize, and compute angle between (arccos of dot product)
      o1a = new Vector3(...o1a.slice(ss, ss + 3)).normalize();
      o2a = new Vector3(...o2a.slice(ss, ss + 3)).normalize();
      let a = Math.abs(Math.acos(o1a.dot(o2a)));
      //console.log(`angle = ${(a * 180) / Math.PI}`);
      aOkay = a < angleThreshRads;
    }
    return dOkay && aOkay;
  }

  function feedbackShowHide(tool, home, zone, forcevisible = false) {
    home.pxz = home.pxz || home.getWorldPosition(new Vector3()).setY(0);
    let pxz = tool.getWorldPosition(new Vector3()).setY(0);
    let d = pxz.distanceTo(home.pxz);
    tool.visible =
      forcevisible || d < zone.near || d > zone.far || pxz.z > home.pxz.z;
    if (zone.ring) {
      zone.ring.visible = !tool.visible;
      zone.ring.scale.setScalar(d);
    }
  }

  function generateDemoTween({
    target,
    maxAngle,
    dist,
    duration,
    easing = Easing.Quadratic.InOut,
    yoyo = true,
    reps = 1,
    recursive = true,
  }) {
    let dir = (Math.random() - 0.5) * maxAngle;
    let dz = -Math.cos(dir) * dist * 1.2;
    let dx = Math.sin(dir) * dist * 1.2;
    let dy = (Math.random() - 0.5) * 0.03;
    let end = target.position.clone().add(new Vector3(dx, dy, dz));
    let tween = new Tween(target.position)
      .to(
        {
          x: end.x,
          y: end.y,
          z: end.z,
        },
        duration
      )
      .delay(800)
      .repeat(reps)
      .repeatDelay(duration / 8)
      .yoyo(yoyo)
      .easing(easing)
      .onStart((o) => {
        // Align the avatar with the home position
        o.set(...home.position);
        o.z +=
          (exp.cfg.handleLength / 2 - exp.cfg.controlPointRadius) *
          Math.sin(Math.PI / 6);
        o.y +=
          -(exp.cfg.handleLength / 2 - exp.cfg.controlPointRadius) *
          Math.cos(Math.PI / 6);
      });

    if (recursive) {
      tween.onComplete(
        () =>
          (target.demoTween = generateDemoTween({
            target: target,
            maxAngle: maxAngle,
            dist: dist,
            duration: duration,
            easing: easing,
            yoyo: yoyo,
            reps: reps,
          }).start())
      );
    }
    return tween;
  }

  function initCountdown(
    duration = 30,
    UItext = UI.nextButton.text,
    onCountdownComplete = () => {}
  ) {
    if (!exp.restClock) {
      exp.restClock = new Clock();
    }
    if (!exp.restClock.running) {
      exp.restClock.start();
      exp.countdownFinished = false;
      (function countdown() {
        let rem = duration - Math.round(exp.restClock.getElapsedTime());
        if (rem > 0) {
          setTimeout(countdown, 1000);
          UItext.set({ content: `${rem}` });
        } else {
          UItext.set({ content: 'Next' });
          exp.countdownFinished = true;
          onCountdownComplete();
        }
      })();
    }
  }
}

window.addEventListener('DOMContentLoaded', main);
