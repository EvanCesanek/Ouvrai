/*** third-party imports ***/
import {
  Color,
  LineBasicMaterial,
  LineSegments,
  MeshStandardMaterial,
  PerspectiveCamera,
  PMREMGenerator,
  Quaternion,
  Raycaster,
  Scene,
  sRGBEncoding,
  TextureLoader,
  Vector3,
  WebGLRenderer,
  ArrowHelper,
  AudioListener,
  PositionalAudio,
  AudioLoader,
  Matrix4,
  Clock,
} from 'three';
import { BoxLineGeometry } from 'three/examples/jsm/geometries/BoxLineGeometry.js';
import { Easing, Tween, update as tweenUpdate } from '@tweenjs/tween.js'; // https://github.com/tweenjs/tween.js/
import ThreeMeshUI from 'three-mesh-ui';
import FontJSON from 'three-mesh-ui/examples/assets/Roboto-msdf.json';
import FontImage from 'three-mesh-ui/examples/assets/Roboto-msdf.png';

/*** weblab imports ***/
import {
  Experiment,
  BlockOptions,
  State,
  DisplayElement,
  Survey,
  MeshFactory,
  XRButton,
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
    handleStartTiltRadians: -Math.PI / 6, // neutral pose of grip space is slightly tilted forwards
    handleLength: 0.1,

    environmentLighting: environmentLightingURL,

    numBaselineCycles: 5,
    numRampCycles: 40,
    numPlateauCycles: 5,
    numWashoutCycles: 10,
    rampDegreesPerCycle: 0.5,
    restTrials: [30, 70],

    startDelay: 0.25,

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
    'WELCOME2',
    'SETHOME',
    'CONFIRMSETHOME',
    'SETUP',
    'START',
    'DELAY',
    'REACH',
    'RETURN',
    'FINISH',
    'ADVANCE',
    'REST',
    'RESUME',
    'SURVEY',
    'CODE',
    'CONTROLLER',
    'DBCONNECT',
    'BLOCKED',
  ];
  const state = new State(exp.cfg.stateNames, handleStateChange);

  // Create any customizable elements
  const survey = new Survey(); // here we use the default demographic survey

  // Add listeners for default weblab events
  addDefaultEventListeners();

  // set debug options
  if (location.hostname === 'localhost') {
    exp.consented = true; // skip consent in development
  } else {
    console.log = function () {}; // disable console logs in production
  }

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

  // Conditions
  exp.cfg.condition = 0;

  // Object Parameters

  // Unique per-target
  exp.cfg.targetIds = [0, 1];
  exp.cfg.targetColors = ['red', 'blue'];
  exp.cfg.targetRotationSigns = [-1, 1];

  // Shared by both targets
  exp.cfg.targetDimensions = new Vector3(0.02, 0.04, 0.02);
  exp.cfg.targetSeparation = 0.2;
  exp.cfg.targetDistance = 0.25;
  exp.cfg.targetPosn = new Vector3(0, 1.2, -0.6);

  // Shared by both control points
  exp.cfg.controlPointDimensions = new Vector3(0.02, 0.02, 0.04);

  // Create threejs scene (1 unit = 1 meter, RH coordinate space)
  // eslint-disable-next-line no-unused-vars
  let [camera, scene, renderer, ray1, ray2, grip1, grip2, hand1, hand2] =
    await initScene();

  // Audio listener on the camera
  exp.listener = new AudioListener();
  camera.add(exp.listener);

  // Prepare texture loader
  //const pbrMapper = new PBRMapper();

  // UI
  const UI = {};
  UI.container = new ThreeMeshUI.Block({
    fontFamily: FontJSON,
    fontTexture: FontImage,
    backgroundOpacity: 0,
  });
  UI.container.position.set(0, 1.5, -1.8);
  UI.container.rotation.x = 0;
  scene.add(UI.container);

  // HEADER
  UI.title = new ThreeMeshUI.Block({
    height: 0.1,
    width: 0.5,
    fontSize: 0.07,
    justifyContent: 'center',
  });
  UI.titleText = new ThreeMeshUI.Text({
    content: 'Instructions',
  });
  UI.title.add(UI.titleText);
  UI.container.add(UI.title);

  // TEXT
  UI.textPanel = new ThreeMeshUI.Block({
    padding: 0.05,
    height: 0.5,
    width: 1.0,
    textAlign: 'left',
    fontSize: 0.05,
    margin: 0.05,
  });
  UI.instructions = new ThreeMeshUI.Text({ content: '' });
  UI.textPanel.add(UI.instructions);
  UI.container.add(UI.textPanel);

  // BUTTONS
  UI.buttonPanel = new ThreeMeshUI.Block({
    padding: 0.05,
    width: 0.8,
    height: 0.2,
    contentDirection: 'row',
  });
  UI.nextButton = new XRButton({ content: 'Next', width: 0.3 });
  UI.backButton = new XRButton({ content: 'Back', width: 0.3 });
  UI.buttons = [UI.backButton, UI.nextButton, UI.container];
  UI.buttonPanel.add(UI.backButton, UI.nextButton);
  UI.container.add(UI.buttonPanel);

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
  });
  toolHandle.rotateX(-Math.PI / 2);
  const toolBar = MeshFactory.cylinder({
    radius: exp.cfg.controlPointDimensions.y * 0.98,
    height: exp.cfg.targetSeparation,
    heightSegments: 2,
    openEnded: true,
    material: toolMaterial,
  });
  toolBar.translateY(exp.cfg.handleLength / 2);
  toolBar.rotateZ(-Math.PI / 2);
  toolHandle.add(toolBar);

  // Create template mesh for the targets and control points
  const cp = MeshFactory.cylinder({
    radius: exp.cfg.controlPointDimensions.y,
    height: exp.cfg.controlPointDimensions.x,
    heightSegments: 2,
  });
  const targets = [];
  const controlPoints = [];
  for (let oi of exp.cfg.targetIds) {
    // Create color material
    let col = new Color(exp.cfg.targetColors[oi]);
    let tmp = col.getHSL({});
    tmp.l = 0.3; // enforce equal luminance
    col.setHSL(tmp.h, tmp.s, tmp.l);
    let mati = new MeshStandardMaterial({ color: col });

    // Create target
    let targi = cp.clone(); //targ.clone();
    targi.position.set(...exp.cfg.targetPosn);
    targi.position.x += (oi - 0.5) * exp.cfg.targetSeparation;
    targi.rotateZ(-Math.PI / 2);
    targi.material = mati;
    targi.userData.sound = new PositionalAudio(exp.listener);
    targi.add(targi.userData.sound);
    scene.add(targi);
    targi.visible = false;

    // Create arrow pointing at target along -z axis
    let origin = new Vector3(0, 0, (exp.cfg.targetDistance * 2) / 3);
    let dir = new Vector3(0, 0, -1);
    let length = origin.z - 1.5 * exp.cfg.targetDimensions.z;
    let arri = new ArrowHelper(dir, origin, length, null, 0.03, 0.012);
    arri.setColor(col);
    arri.line.material.linewidth = 2;
    targi.add(arri);

    // Create control point
    let cpi = cp.clone();
    cpi.translateY((oi - 0.5) * exp.cfg.targetSeparation);
    cpi.material = mati;
    // glow effect
    cpi.material.emissive = new Color('white');
    cpi.material.emissiveIntensity = 0;
    cpi.glowTween = new Tween(cpi.material)
      .to({ emissiveIntensity: 0.2 }, 400)
      .repeat(Infinity)
      .yoyo(true)
      .easing(Easing.Sinusoidal.InOut)
      .onStop((m) => (m.emissiveIntensity = 0));
    toolBar.add(cpi);

    // Push to arrays
    targets.push(targi);
    controlPoints.push(cpi);
  }

  // Sounds
  const audioLoader = new AudioLoader();
  audioLoader.load(bubbleSoundURL, function (buffer) {
    targets.forEach((o) => o.userData.sound.setBuffer(buffer));
  });

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

  // Home position (transparent version of the tool)
  let homeMaterial = new MeshStandardMaterial({
    //wireframe: true,
    transparent: true,
    opacity: 0, // initially transparent
  });
  let home = toolHandle.clone(false);
  home.position.set(...exp.cfg.targetPosn);
  home.position.z += exp.cfg.targetDistance;
  home.quaternion.setFromAxisAngle(
    new Vector3(1, 0, 0),
    exp.cfg.handleStartTiltRadians
  );
  home.material = homeMaterial;
  home.fadeTween = new Tween(home)
    .to(
      { material: { opacity: 0 }, scale: { x: 1.18, y: 1.18, z: 1.18 } },
      exp.cfg.startDelay * 1000
    )
    .onStop(function () {
      home.scale.setScalar(1);
      home.material.opacity = 0;
    })
    .onComplete(function () {
      home.scale.setScalar(1);
      home.material.opacity = 0;
    })
    .easing(Easing.Back.In);
  home.glowTween = new Tween(home.material)
    .to({ opacity: 0.33 }, 400)
    .repeat(Infinity)
    .yoyo(true)
    .easing(Easing.Exponential.InOut)
    .onStop((m) => (m.opacity = 0.33));
  let homeBar = toolBar.clone(false);
  homeBar.position.set(0, exp.cfg.handleLength / 2, 0);
  homeBar.material = homeMaterial;
  home.add(homeBar);
  scene.add(home);
  home.visible = false;

  const visor = {};
  visor.container = new ThreeMeshUI.Block({
    width: 0.01,
    height: 0.01,
    backgroundOpacity: 0,
    fontFamily: FontJSON,
    fontTexture: FontImage,
    fontSize: 0.07,
  });
  visor.container.position.set(0, 0, 0.45);
  visor.text = new ThreeMeshUI.Text({
    content: '',
  });
  visor.container.add(visor.text);
  camera.add(visor.container);

  // Raycasters
  const collisionDetector = new Raycaster();
  collisionDetector.localVertex = new Vector3();
  collisionDetector.tmpQuat = new Quaternion();
  const xrPointer = {
    object: MeshFactory.xrPointer({}),
    dot: MeshFactory.xrPointerDot(),
    raycaster: new Raycaster(),
  };

  // Create trial structure using an array of block objects (in desired order)
  exp.createTrialSequence([
    // The keys of a block object are the variables, the values must be equal-length arrays
    // The combination of elements at index i are the variable values for one trial
    {
      targetId: [...exp.cfg.targetIds],
      // BlockOptions control trial sequencing behavior
      options: new BlockOptions(
        'gradual',
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
      t.rotation = exp.cfg.numRampCycles * exp.cfg.rampDegreesPerCycle;
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

  function calcFunc() {}

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
          UI.instructions.set({
            content:
              'Welcome!\nIn this study, you will use the T-shaped tool in your right hand to hit red and blue targets. \
              You can sit or stand.\nOnce you are comfortable, you may want to reset your view.',
          });
          UI.backButton.setState('disabled');
          UI.nextButton.states['selected'].onSet = function () {
            exp.proceed = true;
            UI.nextButton.states['selected'].onSet = null;
          };
        });

        if (exp.proceed) {
          exp.proceed = false;
          state.next(state.WELCOME2);
        }
        break;
      }

      case state.WELCOME2: {
        state.once(function () {
          UI.instructions.set({
            content: `Please find the start position (the flashing outline). \
            You will reach from this position to hit the colored targets.\n\
            Next, you will use your right hand to adjust the height of the start position.`,
          });
          home.visible = true;
          targets.forEach((o) => (o.visible = true));
          home.glowTween.start();

          home.position.setY(exp.grip.position.y);
          // target height = grip + half of handle length * account for forward tilt at start posn
          let targetY =
            exp.grip.position.y +
            (exp.cfg.handleLength / 2) *
              Math.cos(exp.cfg.handleStartTiltRadians);
          exp.cfg.targetPosn.y = targetY;
          targets.forEach((o) => (o.position.y = targetY));

          UI.backButton.setState('idle');
          UI.nextButton.states['selected'].onSet = function () {
            exp.proceed = true;
            UI.nextButton.states['selected'].onSet = null;
          };
          UI.backButton.states['selected'].onSet = function () {
            exp.goBack = true;
            UI.backButton.states['selected'].onSet = null;
          };
        });

        if (exp.proceed) {
          exp.proceed = false;
          state.next(state.SETHOME);
        } else if (exp.goBack) {
          exp.goBack = false;
          state.next(state.WELCOME);
        }
        break;
      }

      case state.SETHOME: {
        state.once(function () {
          UI.backButton.setState('disabled');
          UI.nextButton.setState('disabled');
          UI.instructions.set({
            content: `Raise or lower your hand to adjust the start position. \
            Set it near chest height so you can comfortably reach the targets. \
            Press the trigger to continue.`,
          });
          // require new select action
          exp.ray.userData.isSelecting = false;
        });

        // Adjust the things
        home.position.setY(exp.grip.position.y);
        // target height = grip + half of handle length * account for forward tilt at start posn
        let targetY =
          exp.grip.position.y +
          (exp.cfg.handleLength / 2) * Math.cos(exp.cfg.handleStartTiltRadians);
        exp.cfg.targetPosn.y = targetY;
        targets.forEach((o) => (o.position.y = targetY));

        if (exp.ray.userData.isSelecting) {
          state.next(state.CONFIRMSETHOME);
        }
        break;
      }

      case state.CONFIRMSETHOME: {
        state.once(function () {
          UI.backButton.setState('idle');
          UI.nextButton.setState('idle');
          UI.backButton.states['selected'].onSet = function () {
            exp.goBack = true;
            UI.backButton.states['selected'].onSet = null;
            UI.nextButton.states['selected'].onSet = null;
          };
          UI.nextButton.states['selected'].onSet = function () {
            exp.homePositionConfirmed = true;
            UI.backButton.states['selected'].onSet = null;
            UI.nextButton.states['selected'].onSet = null;
          };
          UI.instructions.set({
            content: `Make sure you can comfortably reach the targets from the start.\n\
            If you are ready to begin, click Next.\n\
            To adjust the start position more, click Back.`,
          });
        });

        if (exp.goBack) {
          exp.goBack = false;
          //exp.homePositionSet = false;
          state.next(state.SETHOME);
        }
        if (exp.homePositionConfirmed) {
          exp.ray.traverse((o) => (o.visible = false));
          UI.buttonPanel.visible = false;
          UI.backButton.setState('disabled');
          //UI.nextButton.setState('disabled');
          targets.forEach((o) => (o.visible = false));
          state.next(state.SETUP);
        }
        break;
      }

      case state.SETUP: {
        // Grab anything we might need from the previous trial

        // Start with a deep copy of the initialized trial from exp.trials
        trial = structuredClone(exp.trials[exp.trialNumber]);
        trial.trialNumber = exp.trialNumber;
        trial.startTime = performance.now();

        // Reset data arrays and other weblab defaults
        trial = { ...trial, ...structuredClone(trialInitialize) };

        // Set trial parameters
        trial.demoTrial = exp.trialNumber === 0;

        trial.rotation *= exp.cfg.targetRotationSigns[trial.targetId];

        state.next(state.START);
        break;
      }

      case state.START: {
        state.once(function () {
          home.visible = true;
          UI.titleText.set({
            content: `Trial ${trial.trialNumber + 1} of ${exp.trials.length}`,
          });
          if (trial.demoTrial) {
            UI.instructions.set({
              content: `Hold the tool inside the start position.`,
            });
          }
        });

        if (checkAlignment(toolHandle, home)) {
          home.glowTween.stop();
          home.fadeTween.start();
          controlPoints[trial.targetId].glowTween.start();
          // clear the frame data before we start recording
          trial.t = [];
          trial.state = [];
          trial.rhPos = [];
          trial.rhOri = [];
          state.next(state.DELAY);
        }
        break;
      }

      case state.DELAY: {
        // push device data to arrays
        handleFrameData();

        if (!checkAlignment(toolHandle, home)) {
          controlPoints[trial.targetId].glowTween.stop();
          home.fadeTween.stop();
          home.glowTween.start();
          state.next(state.START);
        } else if (state.expired(exp.cfg.startDelay)) {
          home.visible = false;
          targets[trial.targetId].visible = true;
          // we update the rotation origin on each trial to avoid jitter
          trial.rotationOrigin = exp.grip.position.clone();
          // rotationRadians is used to actually do the rotation
          // so we don't update it until here otherwise will see a blip
          trial.rotationRadians = (trial.rotation * Math.PI) / 180;

          state.next(state.REACH);
        }
        break;
      }

      case state.REACH: {
        state.once(function () {
          let col = exp.cfg.targetColors[trial.targetId];
          UI.instructions.set({
            content: `Reach forward to hit the ${col} target with the ${col} part of the tool.
            Then return to the start position.`,
          });
        });

        // push device data to arrays
        handleFrameData();

        if (collisionDetect()) {
          targets[trial.targetId].userData.sound.play();

          if (exp.cfg.supportHaptic) {
            exp.grip.gamepad.hapticActuators[0].pulse(0.6, 80);
          }

          controlPoints[trial.targetId].glowTween.stop();

          // object scale is set to exp.cfg.targetWidth
          new Tween(targets[trial.targetId].scale)
            .to({ x: 0, y: 0, z: 0 }, 100)
            .onComplete(function () {
              targets[trial.targetId].visible = false;
              targets[trial.targetId].scale.setScalar(1);
            })
            .start();

          home.visible = true;
          state.next(state.RETURN);
        }
        break;
      }

      case state.RETURN: {
        state.once(function () {
          home.glowTween.start();
        });

        // push device data to arrays
        if (exp.grip) {
          handleFrameData();
        }

        if (
          checkAlignment(toolHandle, home) &&
          exp.grip.linearVelocity.length() < 0.02
        ) {
          // TODO: Handle proceed
          state.next(state.FINISH);
        }
        break;
      }

      case state.FINISH: {
        state.once(function () {
          // demo trial requires button press.
          if (trial.demoTrial) {
            UI.instructions.set({
              content: `Great! On each trial, aim the tip of the tool \
              directly at the target (follow the arrow). Avoid rotating the tool. \
              There are short rest breaks after trials ${exp.cfg.restTrials[0]} and ${exp.cfg.restTrials[1]}. \
              Please rest your arm during these breaks.`,
            });
            exp.ray.traverse((o) => (o.visible = true));
            UI.buttonPanel.visible = true;
            UI.nextButton.setState('idle');
            UI.nextButton.states['selected'].onSet = function () {
              UI.nextButton.states['selected'].onSet = null;
              exp.demoTrialComplete = true;
              exp.ray.traverse((o) => (o.visible = false));
              UI.buttonPanel.visible = false;
              //UI.nextButton.setState('disabled');
              UI.textPanel.visible = false;
            };
          }
        });

        // Wait for trigger press on demo trial
        if (trial.demoTrial && !exp.demoTrialComplete) {
          break;
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

        if (exp.trialNumber < exp.numTrials) {
          if (
            exp.cfg.restTrials &&
            exp.cfg.restTrials.includes(exp.trialNumber)
          ) {
            state.next(state.REST);
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
          UI.instructions.set({
            content: `Good work! Please take a short rest break. \
            Do not leave the game or remove your headset. \
            Relax your arm until the timer reaches zero.`,
          });
          trial.rotation = 0; // shut off the rotation
          exp.grip.traverse((o) => (o.visible = false));
          exp.ray.traverse((o) => (o.visible = false));
          UI.textPanel.visible = true;
          UI.buttonPanel.visible = true;
          if (!exp.cfg.restBreakDuration) {
            exp.cfg.restBreakDuration = 30;
          }
          if (!exp.restClock) {
            exp.restClock = new Clock();
          }
          if (!exp.restClock.running) {
            exp.restClock.start();
            (function countdown() {
              let rem =
                exp.cfg.restBreakDuration -
                Math.round(exp.restClock.getElapsedTime());
              if (rem > 0) {
                setTimeout(countdown, 1000);
                UI.nextButton.text.set({
                  content: `${rem}`,
                });
              } else {
                UI.nextButton.text.set({
                  content: 'Resume',
                });
              }
            })();
          }
        });
        if (exp.restClock.getElapsedTime() > exp.cfg.restBreakDuration) {
          exp.restClock.stop();
          exp.countdownInterval = clearInterval(exp.countdownInterval);
          state.next(state.RESUME);
        }
        break;
      }

      case state.RESUME: {
        state.once(function () {
          UI.instructions.set({
            content: `You may resume the experiment.`,
          });
          UI.nextButton.text.set({
            content: `Resume`,
          });
          exp.grip.traverse((o) => (o.visible = true));
          exp.ray.traverse((o) => (o.visible = true));
          UI.nextButton.setState('idle');
          UI.nextButton.states['selected'].onSet = function () {
            UI.nextButton.states['selected'].onSet = null;
            exp.ray.traverse((o) => (o.visible = false));
            UI.buttonPanel.visible = false;
            UI.textPanel.visible = false;
            state.next(state.SETUP);
          };
        });
        break;
      }

      case state.SURVEY: {
        exp.cfg.trialNumber = 'info';
        exp.firebase.saveTrial(exp.cfg, 'survey');
        state.next(state.CODE);
        // if (survey.hidden) {
        //   survey.show();
        // }
        // if (exp.surveysubmitted) {
        //   // we save the config object
        //   exp.firebase.saveTrial(exp.cfg, 'info');
        //   survey.hide();
        //   state.next(state.CODE);
        // }
        break;
      }

      case state.CODE: {
        if (!survey.saveSuccessful) {
          // don't do anything until firebase save returns successful
          break;
        }
        state.once(function () {
          exp.goodbye.show(); // show the goodbye screen w/ code & prolific link
          UI.titleText.set({
            content: `Complete`,
          });
          UI.instructions.set({
            content: `Thank you. Exit VR to find the submission link on the study web page.`,
          });
          exp.ray.traverse((o) => (o.visible = true));
          UI.textPanel.visible = true;
          UI.buttonPanel.visible = true;
          UI.nextButton.setState('idle');
          UI.nextButton.text.set({ content: 'Exit' });
          UI.nextButton.states['selected'].onSet = function () {
            UI.nextButton.states['selected'].onSet = null;
            exp.xrSession.end();
            UI.nextButton.setState('disabled');
          };
        });
        break;
      }

      case state.CONTROLLER: {
        state.once(function () {
          if (state.last !== state.REST) {
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
    if (UI.buttonPanel.visible && state.current !== state.REST) {
      updateButtons(exp.ray, UI.buttons);
    }
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
      exp.grip.children.forEach((o) => exp.grip.remove(o));
      scene.remove(exp.grip);
      exp.grip = undefined;
    }
  }

  function handleRayDisconnected(event) {
    if (exp.ray && !event.data.hand && event.data.handedness === 'right') {
      console.log('RH ray disconnect');
      exp.ray.children.forEach((o) => exp.ray.remove(o));
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
      exp.ray.add(xrPointer.object);
      exp.ray.add(xrPointer.dot);
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

    document.body.addEventListener('savesuccessful', (e) => {
      console.log('document.body received savesuccessful event, trial saved');
      if (e.detail === 'survey') {
        survey.saveSuccessful = true;
      }
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
      new LineBasicMaterial({ color: 0x808080 })
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
      if (exp.listener) {
        exp.listener.context.resume();
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

  function checkAlignment(
    o1,
    o2,
    distanceThresh = 0.025,
    angleThreshRads = 0.15
  ) {
    let aOkay = !angleThreshRads;
    let dOkay = !distanceThresh;

    if (!dOkay) {
      let o1p = o1.getWorldPosition(new Vector3());
      let o2p = o2.getWorldPosition(new Vector3());
      let d = o1p.distanceTo(o2p); // distance
      dOkay = d < distanceThresh;
    }
    if (angleThreshRads) {
      let o1a = o1.getWorldDirection(new Vector3());
      let o2a = o2.getWorldDirection(new Vector3());
      let a = Math.abs(Math.acos(o1a.dot(o2a))); // angle
      aOkay = a < angleThreshRads;
    }
    return dOkay && aOkay;
  }

  function updateTargetRay(raycaster, controller) {
    if (raycaster.dummyMatrix === undefined) {
      raycaster.dummyMatrix = new Matrix4();
    }
    raycaster.dummyMatrix.identity().extractRotation(controller.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(raycaster.dummyMatrix);
  }

  function updatePointerDot(dot, targetRay, location) {
    const localVec = targetRay.worldToLocal(location);
    dot.position.copy(localVec);
    dot.visible = true;
  }

  function updateButtons(targetRay, buttons) {
    if (!targetRay || !buttons || buttons.length === 0) return;

    // Find closest intersecting object
    let intersect;
    if (renderer.xr.isPresenting) {
      updateTargetRay(xrPointer.raycaster, targetRay);
      intersect = getClosestIntersection(buttons, xrPointer.raycaster);
      //intersect = xrPointer.raycaster.intersectObjects(buttons, false)[0];
      // Position the little white dot at the end of the controller pointing ray
      if (intersect) {
        updatePointerDot(xrPointer.dot, targetRay, intersect.point);
      } else {
        xrPointer.dot.visible = false;
      }
    }

    // Update targeted button state (if any)
    if (
      intersect &&
      intersect.object.isUI &&
      intersect.object.currentState !== 'disabled'
    ) {
      if (targetRay.userData.isSelecting) {
        // Component.setState internally call component.set with the options you defined in component.setupState
        intersect.object.setState('selected');
      } else {
        // Component.setState internally call component.set with the options you defined in component.setupState
        intersect.object.setState('hovered');
      }
    }

    // Update non-targeted buttons state
    buttons.forEach((obj) => {
      if (
        (!intersect || obj !== intersect.object) &&
        obj.isUI &&
        obj.currentState !== 'disabled'
      ) {
        // Component.setState internally call component.set with the options you defined in component.setupState
        obj.setState('idle');
      }
    });
  }

  function getClosestIntersection(objsToTest, raycaster) {
    return objsToTest.reduce((closestIntersection, obj) => {
      const intersection = raycaster.intersectObject(obj, true);

      if (!intersection[0]) return closestIntersection;

      if (
        !closestIntersection ||
        intersection[0].distance < closestIntersection.distance
      ) {
        intersection[0].object = obj;

        return intersection[0];
      }

      return closestIntersection;
    }, null);
  }

  function collisionDetect() {
    // collision detection
    let cpi = controlPoints[trial.targetId];
    for (
      let vertexIndex = 0;
      vertexIndex < cpi.geometry.attributes.position.count;
      vertexIndex++
    ) {
      collisionDetector.localVertex.fromBufferAttribute(
        cpi.geometry.attributes.position,
        vertexIndex
      ); // get vertex position on object A
      collisionDetector.localVertex.applyMatrix4(cpi.matrix); // apply local transform
      collisionDetector.localVertex.sub(cpi.position); // remove position component of local transform -> direction vector
      // get world space rotation of object A
      cpi.getWorldQuaternion(collisionDetector.tmpQuat);
      // rotate direction vector so it is in world space
      collisionDetector.localVertex.applyQuaternion(collisionDetector.tmpQuat);
      // set origin and direction of raycaster
      cpi.getWorldPosition(collisionDetector.ray.origin);
      collisionDetector.ray.direction = collisionDetector.localVertex
        .clone()
        .normalize();
      // check for intersection
      let collisionResults = collisionDetector.intersectObject(
        targets[trial.targetId],
        false
      );
      // collision occurred if there is an intersection that is closer than the vertex
      if (
        collisionResults.length > 0 &&
        collisionResults[0].distance < collisionDetector.localVertex.length()
      ) {
        return true;
      }
    }
    return false;
  }
}

window.addEventListener('DOMContentLoaded', main);
