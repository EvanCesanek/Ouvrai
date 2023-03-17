// Third-party imports
import {
  Color,
  Vector3,
  PositionalAudio,
  Group,
  BoxGeometry,
  MeshStandardMaterial,
  SphereGeometry,
  Mesh,
  CylinderGeometry,
  RingGeometry,
} from 'three';
import { Easing, Tween, update as tweenUpdate } from '@tweenjs/tween.js'; // https://github.com/tweenjs/tween.js/

// Package imports
import {
  Experiment,
  BlockOptions,
  DisplayElement,
  MeshFactory,
  InstructionsPanel,
  checkAlignment,
  generateDemoReaches,
  linspace,
  clamp,
} from 'ouvrai';

// Static asset imports (https://vitejs.dev/guide/assets.html)
import environmentLightingURL from 'ouvrai/lib/environments/IndoorHDRI003_1K-HDR.exr?url'; // absolute path from ouvrai
import bubbleSoundURL from './bubblePopping.mp3?url'; // relative path from src
import targetColorMapURL from 'ouvrai/lib/textures/Terrazzo018_1K-JPG/Terrazzo018_1K_Color.jpg';
import targetDisplacementMapURL from 'ouvrai/lib/textures/Terrazzo018_1K-JPG/Terrazzo018_1K_Displacement.jpg';
import targetNormalMapURL from 'ouvrai/lib/textures/Terrazzo018_1K-JPG/Terrazzo018_1K_NormalGL.jpg';
import targetRoughnessMapURL from 'ouvrai/lib/textures/Terrazzo018_1K-JPG/Terrazzo018_1K_Roughness.jpg';
import { range, shuffle } from 'd3-array';

/**
 * Main function contains all experiment logic. At a minimum you should:
 * 1. Create a `new Experiment({...config})`
 * 2. Initialize the state machine with `exp.state.init(states, changeFunc)`
 * 3. Create stimuli and add them to the three.js scene: `exp.sceneManager.scene`
 * 4. Create trial sequence with `exp.createTrialSequence([...blocks])`
 * 5. Start the main experiment loop with `exp.start(mainLoopFunc)`
 * 6. Create experiment flow by editing `calcFunc`, `stateFunc`, and `displayFunc`.
 */
async function main() {
  // Configure your experiment
  const exp = new Experiment({
    // Debug mode?
    debug: true,

    // Platform settings
    requireVR: true,
    handTracking: false,
    controllerModels: false,

    // Three.js settings
    environmentLighting: environmentLightingURL,
    orbitControls: true,
    gridRoom: true,
    audio: true,

    // Scene quantities
    // Assume meters and seconds for three.js, but note tween.js uses milliseconds
    maxRotation: 16, // degrees
    handleLength: 0.09,
    controlPointRadius: 0.01,
    targetRadius: 0.014,
    targetDistance: 0.2,
    homePosn: new Vector3(0, 0.9, -0.3),

    // Procedure (adapted from Vetter, Goodbody, & Wolpert, 1999)
    numFamiliarizationCycles: 2, // 1 cycle = 13 trials (1 to each target with feedback), end 26
    numPreExposureCycles: 2, // 1 cycle = 26 trials (1 exposure 1 test, interleaved 13 x), end 78
    numExposureRampCycles: 20, // 1 cycle = 1 trial (exposure target only), ramp up perturbation
    numExposurePlateauCycles: 30, // 1 cycle = 1 trial (exposure target only), constant perturbation end 128
    numPostExposureCycles: 2, // same as preexposure, end 180
    restDuration: 15, // minimum duration of rest state
    restTrials: [20, 60, 100, 140], // rest before which trials?
    startNoFeedbackDuration: 10, // minimum duration of notification state
    startNoFeedbackTrial: 26, // remove feedback before which trial?
    startDelay: 0.25, // time to remain in start position
    // Target arrangement
    targetIds: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    targetDims: [0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2],
    targetMags: [0, -2, -1, 1, 2, -2, -1, 1, 2, -2, -1, 1, 2],
    targetSpacing: 0.04,
  });

  /**
   * Finite State Machine manages the flow of your experiment.
   * Define states here. Define behavior & transitions in stateFunc().
   */
  exp.cfg.stateNames = [
    // Begin required states
    'BROWSER',
    'CONSENT',
    'SIGNIN',
    'WELCOME',
    'CALIBRATE',
    'DEMO',
    // End required states
    // Begin customizable states
    'SETUP',
    'START',
    'DELAY',
    'REACH',
    'RETURN',
    'FINISH',
    'ADVANCE',
    // End customizable states
    // Begin required states
    'REST',
    'STARTNOFEEDBACK',
    'SURVEY',
    'CODE',
    'CONTROLLER',
    'DBCONNECT',
    'BLOCKED',
    // End required states
  ];

  // Initialize the state machine
  exp.state.init(exp.cfg.stateNames, handleStateChange);

  // An instructions panel (HTML so use <br> for newlines)
  exp.instructions = new InstructionsPanel({
    content: `Click the ENTER VR button to start.<br>
    You will see more instructions in VR.`,
    collapsible: false,
  });

  // Declare trial variables that you want to reset on every trial
  const trialInitialize = {
    // render frames
    t: [],
    state: [],
    rhPos: [],
    rhOri: [],
    // state change events
    stateChange: [],
    stateChangeTime: [],
    stateChangeHeadPos: [],
    stateChangeHeadOri: [],
  };
  let trial = structuredClone(trialInitialize);

  /**
   * Objects
   */
  // Red patch shows where to stand
  const standHere = new Mesh(
    new RingGeometry(0, 0.2, 24, 1),
    new MeshStandardMaterial({ color: 'darkred' })
  );
  standHere.translateZ(0.05);
  standHere.translateY(0.01); // avoid z-fighting with GridRoom
  standHere.rotateX(-Math.PI / 2);
  exp.sceneManager.scene.add(standHere);

  // Workspace "root" (helpful for individual height calibration)
  const workspace = new Group();
  exp.sceneManager.scene.add(workspace);
  workspace.position.set(...exp.cfg.homePosn);

  // Home position
  const home = MeshFactory.edges({
    geometry: new BoxGeometry(
      exp.cfg.controlPointRadius,
      exp.cfg.controlPointRadius,
      exp.cfg.controlPointRadius,
      1,
      1
    ),
    color: 'orangered',
  });
  // cube of edge length 2r "contains" the sphere but looks too big as wireframe
  // cube of edge length 2r/sqrt(3) ~= 1.15 is contained by the sphere
  home.scale.setScalar(1.5); // so we pick a size between 1.15 and 2
  home.pulseTween = new Tween(home.scale)
    .to({ x: 1.8, y: 1.8, z: 1.8 }, 350)
    .repeat(Infinity)
    .yoyo(true)
    .easing(Easing.Sinusoidal.InOut)
    .onStop((scale) => scale.setScalar(1.5));
  workspace.add(home);
  home.visible = false;

  // Create tool
  let handleTransMat = new MeshStandardMaterial({
    color: 'slategray',
    roughness: 0.7,
    metalness: 1,
    transparent: true,
  });
  let handleMat = new MeshStandardMaterial({
    color: 'slategray',
    roughness: 0.7,
    metalness: 1,
  });
  const toolHandle = new Mesh(
    new CylinderGeometry(
      exp.cfg.controlPointRadius,
      exp.cfg.controlPointRadius,
      exp.cfg.handleLength,
      24
    ),
    handleMat
  );
  // cylinders in world space are oriented along +Y
  // but grip in grip space is oriented along -Z
  // rotate cylinder -90deg around X so +Y moves along the grip
  toolHandle.rotateX(-Math.PI / 2);
  // Create control point at end of tool
  let cpTransMat = new MeshStandardMaterial({
    transparent: true,
  });
  let cpMat = new MeshStandardMaterial();
  const cp = new Mesh(new SphereGeometry(exp.cfg.controlPointRadius), cpMat);
  cp.translateY(exp.cfg.handleLength / 2);
  toolHandle.add(cp);

  // Put the tool in the right hand
  exp.rhObject = toolHandle;
  exp.lhObject; // TODO: left hand not yet supported!

  // Create the reach target
  const target = new Mesh(
    new SphereGeometry(exp.cfg.targetRadius),
    new MeshStandardMaterial({
      transparent: true,
    })
  );
  target.translateZ(-exp.cfg.targetDistance);
  target.hitTween = new Tween(target)
    .to({ scale: { x: 0, y: 0, z: 0 } }, 220)
    .easing(Easing.Back.InOut)
    .onComplete((o) => {
      o.visible = false;
      o.scale.setScalar(1);
    })
    .start();
  target.pulseTween = new Tween(target)
    .to({ scale: { x: 1.2, y: 1.2, z: 1.2 } }, 180)
    .repeat(1)
    .yoyo(true)
    .onComplete((o) => {
      o.visible = false;
      o.scale.setScalar(1);
    });
  target.visible = false;
  // Give it a material
  exp.sceneManager.pbrMapper.applyNewTexture(
    [target],
    'terrazzo',
    [
      targetColorMapURL,
      targetDisplacementMapURL,
      targetNormalMapURL,
      targetRoughnessMapURL,
    ],
    { xRepeatTimes: 0.65, yRepeatTimes: 0.65, displacementScale: 1 }
  );
  workspace.add(target);

  // Attach a sound to the target
  target.userData.sound = new PositionalAudio(exp.audioListener);
  exp.audioLoader.load(bubbleSoundURL, function (buffer) {
    target.userData.sound.setBuffer(buffer);
  });
  target.add(target.userData.sound);

  // Create a tool avatar to demonstrate reaching movements
  const demo = new Group();
  workspace.add(demo);
  demo.visible = false;
  const demoTool = toolHandle.clone(true);
  demo.add(demoTool);
  demoTool.rotateX(Math.PI / 3); // Tilted forward 30 degrees
  demoTool.material = new MeshStandardMaterial({
    color: '#1c2a29',
    roughness: 1,
    metalness: 1,
  });
  const democp = demoTool.children[0];

  /**
   * Create trial sequence (exp.trials) from array of block objects
   */
  exp.createTrialSequence([
    // The keys of a block object are the variables, the values must be equal-length arrays
    // The combination of elements at index i are the variable values for one trial
    // options is required: create a new BlockOptions object to control sequencing
    {
      targetId: exp.cfg.targetIds,
      targetDim: exp.cfg.targetDims,
      targetMag: exp.cfg.targetMags,
      rotation: 0,
      options: new BlockOptions({
        name: 'fam',
        reps: exp.cfg.numFamiliarizationCycles,
        order: (trials) => [0, ...shuffle(trials.slice(1))],
      }),
    },
    {
      targetId: exp.cfg.targetIds,
      targetDim: exp.cfg.targetDims,
      targetMag: exp.cfg.targetMags,
      rotation: 0,
      options: new BlockOptions({
        name: 'pre',
        reps: exp.cfg.numPreExposureCycles,
        // Custom trial-ordering function (shuffle the test trials, interleave exposure trials)
        order: (trials) =>
          shuffle(trials).reduce((out, ti) => out.concat(0, ti), []),
      }),
    },
    {
      targetId: 0,
      targetDim: 0,
      targetMag: 0,
      rotation: [
        ...linspace(0, exp.cfg.maxRotation, exp.cfg.numExposureRampCycles),
        ...new Array(exp.cfg.numExposurePlateauCycles).fill(
          exp.cfg.maxRotation
        ),
      ],
      options: new BlockOptions({
        name: 'exp',
        shuffle: false,
        reps: 1,
      }),
    },
    {
      targetId: exp.cfg.targetIds,
      targetDim: exp.cfg.targetDims,
      targetMag: exp.cfg.targetMags,
      rotation: exp.cfg.maxRotation,
      options: new BlockOptions({
        name: 'post',
        reps: exp.cfg.numPostExposureCycles,
        order: (trials) =>
          shuffle(trials).reduce((out, ti) => out.concat(0, ti), []), // see above
      }),
    },
  ]);

  /**
   * Set up replay machine
   */
  if (exp.replay) {
    // Move these two lines into handleReplayInfo?
    exp.replay.avatar.add(toolHandle);
    exp.sceneManager.scene.add(exp.replay.avatar);
    document.body.addEventListener('replayinfo', handleReplayInfo);
    document.body.addEventListener('replaytrial', handleReplayTrial);
  }

  /**
   * Debug options
   */
  if (exp.cfg.debug) {
    exp.consented = true; // skip consent in debug
  }

  /**
   * Start the main experiment loop
   */
  exp.start(calcFunc, stateFunc, displayFunc);

  /////////// End setup /////////////

  /////////// Begin functions ///////

  /**
   * Use `calcFunc` for calculations used in _multiple states_
   */
  function calcFunc() {
    exp.replay?.update(); // Update any replay animations

    // During DEMO, the demo avatar is in control
    let toolcp = exp.state.current === 'DEMO' ? democp : cp;

    // Check if control point is in the home position
    home.atHome = checkAlignment({
      o1: home,
      o2: toolcp,
      angleThresh: false,
    });
  }

  /**
   * Define your procedure as a switch statement implementing a Finite State Machine.
   * Ensure that all states are listed in the array given to the constructor.
   * @method `exp.state.next(state)` Transitions to new state on next loop.
   * @method `exp.state.once(function)` Runs function one time on entering state.
   */
  function stateFunc() {
    // Process interrupt flags (database, controllers)
    exp.processInterrupts();

    switch (exp.state.current) {
      case 'BLOCKED':
        break;

      case 'BROWSER':
        exp.processBrowser();
        break;

      case 'CONSENT':
        exp.processConsent();
        break;

      case 'SIGNIN':
        exp.processSignIn();
        break;

      case 'WELCOME':
        exp.state.once(function () {
          exp.VRUI.edit({
            title: 'Instructions',
            instructions: `Welcome! Please sit up straight or stand. \
            Look down; you should be right above the red patch. \
            If not, move there now, or reset your view to teleport there. \
            Then click Next.`,
            interactive: true,
            backButtonState: 'disabled',
            nextButtonState: 'disabled',
          });
        });
        let cameraDistanceXZ = Math.sqrt(
          exp.sceneManager.camera.position.x ** 2 +
            (exp.sceneManager.camera.position.z + 0.05) ** 2
        );
        let posnOk = cameraDistanceXZ < 0.12;
        if (exp.VRUI.clickedNext) {
          exp.state.next('CALIBRATE');
        } else if (!posnOk) {
          exp.VRUI.edit({ nextButtonState: 'disabled' });
        } else {
          exp.VRUI.edit({ nextButtonState: 'idle' });
        }
        break;

      case 'CALIBRATE':
        exp.state.once(function () {
          exp.VRUI.edit({
            title: 'Calibrate',
            instructions: `Please calibrate your chest height.\n\
            Hold the controller against your chest and press the trigger.`,
            interactive: false,
            buttons: false,
          });
        });
        if (exp.ray?.userData.isSelecting) {
          let cpWorld = cp.getWorldPosition(new Vector3());
          let adjustHeight = cpWorld.y;
          exp.grip.gamepad.hapticActuators?.['0'].pulse(0.6, 80);
          workspace.position.setY(adjustHeight);
          exp.cfg.homePosn.y = adjustHeight;
          exp.state.next('DEMO');
        }
        break;

      case 'DEMO':
        exp.state.once(function () {
          exp.VRUI.edit({
            title: 'Comfortable?',
            instructions: `Please watch the demonstration.\n\
            Can you perform similar reaches?\n\
            Click Back to recalibrate chest height.\n\
            Click Next to continue.`,
            interactive: true,
            backButtonState: 'idle',
            nextButtonState: 'idle',
          });
          // Demonstration of the required movement with demo avatar
          home.visible = true;
          demo.visible = true;
          // Align the avatar control point with the home position
          demo.position.add(
            new Vector3().subVectors(
              home.getWorldPosition(new Vector3()),
              democp.getWorldPosition(new Vector3())
            )
          );
          if (!demo.demoTween?.isPlaying()) {
            demo.demoTween = generateDemoReaches({
              object: demo,
              maxAngle: Math.PI / 8,
              distance: exp.cfg.targetDistance * 1.5,
              duration: 750,
            });
          }
          demo.demoTween.start();
        });
        // Note there is no target for demo reaches in this experiment
        if (exp.VRUI.clickedNext) {
          demo.demoTween.stop();
          demo.visible = false;
          exp.state.next('SETUP');
        } else if (exp.VRUI.clickedBack) {
          demo.demoTween.stop();
          demo.visible = false;
          exp.state.next('CALIBRATE');
        }
        break;

      case 'SETUP':
        // Start with a deep copy of the initialized trial from exp.trials
        trial = structuredClone(exp.trials[exp.trialNumber]);
        trial.trialNumber = exp.trialNumber;
        trial.startTime = performance.now();
        // Reset data arrays and other defaults
        trial = { ...trial, ...structuredClone(trialInitialize) };
        // Set trial parameters
        trial.demoTrial =
          exp.trialNumber === 0 || (exp.trialNumber < 6 && exp.repeatDemoTrial);
        trial.noFeedback = !(
          trial.blockName === 'fam' ||
          trial.blockName === 'exp' ||
          trial.blockTrial % 2 === 0
        );
        // Position the target based on trial parameters
        target.position
          .set(0, 0, -exp.cfg.targetDistance) // exposure
          .add(
            new Vector3().setComponent(
              trial.targetDim,
              trial.targetMag * exp.cfg.targetSpacing
            ) // offset
          );
        trial.targetPosn = target.position.clone();
        exp.state.next('START');
        break;

      case 'START':
        exp.state.once(function () {
          exp.VRUI.edit({
            title: 'Go to start',
            instructions: trial.demoTrial
              ? `To start a trial, hold the end of the tool inside the cube. \
            The cube will turn black when you are in the right place.`
              : false,
            interactive: false,
            buttons: false,
            backButtonState: 'disabled',
            nextButtonState: 'disabled',
          });
          target.visible = false;
        });
        // Shorthand if statement
        home.atHome && exp.state.next('DELAY');
        break;

      case 'DELAY':
        exp.state.once(function () {
          // clear frame data from possible prior visits to DELAY
          trial.t = [];
          trial.state = [];
          trial.rhPos = [];
          trial.rhOri = [];
        });
        handleFrameData();
        if (!home.atHome) {
          exp.state.next('START');
        } else if (exp.state.expired(exp.cfg.startDelay)) {
          target.visible = true;
          // Update origin then radians to reduce/mask blips when rotation changes
          trial.rotationOrigin = home.getWorldPosition(new Vector3());
          //exp.grip?.position.clone() || trial.rotationOrigin;
          trial.rotationRadians = (trial.rotation * Math.PI) / 180;
          exp.state.next('REACH');
        }
        break;

      case 'REACH':
        handleFrameData();
        let cpWorld = cp.getWorldPosition(new Vector3());
        cp.onTarget =
          target.getWorldPosition(new Vector3()).distanceTo(cpWorld) <
          exp.cfg.targetRadius + exp.cfg.controlPointRadius;
        // Set the instructions conditionally in this state
        // -- could be two states but this is simpler
        exp.VRUI.edit({
          title: 'Hit target',
          instructions: trial.demoTrial
            ? !cp.onTarget
              ? `Touch the textured sphere with the white tip of the tool.`
              : `Press the trigger to clear the sphere.`
            : false,
        });
        // Stop them from just holding the trigger down
        if (exp.ray?.userData.isSelecting) {
          if (cpWorld.z > exp.cfg.homePosn.z - 0.05) {
            exp.ray.userData.isSelecting = false;
          } else if (trial.noFeedback || cp.onTarget) {
            // Visual, auditory, and haptic feedback of target hit
            if (!trial.noFeedback) {
              target.hitTween.start();
              target.userData.sound.play();
            } else {
              target.pulseTween.start();
            }
            exp.grip.gamepad.hapticActuators?.['0'].pulse(0.6, 80);
            exp.state.next('RETURN');
          }
        }
        break;

      case 'RETURN':
        exp.state.once(function () {
          exp.VRUI.edit({
            title: 'Go to start',
            instructions: trial.demoTrial
              ? `Now touch the start cube to finish the trial. \
              You don't need to press the trigger at the start cube.`
              : false,
          });
        });
        // Time limit avoids excessive data if they meander
        !exp.state.expired(2) && handleFrameData();
        home.atHome && exp.state.next('FINISH');
        break;

      case 'FINISH':
        exp.state.once(function () {
          trial.demoTrial &&
            exp.VRUI.edit({
              title: 'Make sense?',
              instructions: `You will repeat that sequence ${
                exp.numTrials - 1
              } times with different targets.\n\
              There will be ${exp.cfg.restTrials.length} rest breaks.\n\
              To repeat the instructions, click Back.\n\
              If you are ready to start, click Next.`,
              interactive: true,
              backButtonState: 'idle',
              nextButtonState: 'idle',
            });
          target.visible = false;
        });
        // Wait for button click on demo trial
        if (trial.demoTrial) {
          if (exp.VRUI.clickedNext) {
            exp.repeatDemoTrial = false;
          } else if (exp.VRUI.clickedBack) {
            exp.repeatDemoTrial = true;
          } else {
            break;
          }
        }
        // Save immediately prior to state transition (ensures one save per trial)
        exp.firebase.saveTrial(trial);
        exp.state.next('ADVANCE');
        break;

      case 'ADVANCE':
        if (!exp.firebase.saveSuccessful) {
          break; // wait until firebase save returns successful
        } else if (exp.firebase.saveFailed) {
          // go to fatal screen if save failed
          exp.state.push('BLOCKED');
          exp.blocker.fatal(err);
        }
        exp.nextTrial();
        if (exp.trialNumber < exp.numTrials) {
          // Many possible next states for different trial types
          if (exp.cfg.restTrials?.includes(exp.trialNumber)) {
            exp.state.next('REST');
            exp.VRUI.countdown(exp.cfg.restDuration); // start countdown *before new state*
          } else if (exp.trialNumber === exp.cfg.startNoFeedbackTrial) {
            exp.state.next('STARTNOFEEDBACK');
            exp.VRUI.countdown(exp.cfg.startNoFeedbackDuration); // start countdown *before new state*
          } else if (exp.repeatDemoTrial) {
            exp.state.next('WELCOME');
          } else {
            exp.state.next('SETUP');
          }
        } else {
          exp.firebase.recordCompletion();
          exp.goodbye.updateGoodbye(exp.firebase.uid);
          DisplayElement.hide(exp.sceneManager.renderer.domElement);
          workspace.visible = false;
          // Turn off any perturbations
          trial.errorClamp = false;
          trial.rotation = 0;
          toolHandle.position.set(0, 0, 0);
          exp.state.next('SURVEY');
        }
        break;

      case 'SURVEY':
        exp.state.once(() => exp.survey?.hidden && exp.survey.show());
        if (!exp.survey || exp.surveysubmitted) {
          exp.survey?.hide();
          exp.cfg.trialNumber = 'info';
          exp.firebase.saveTrial(exp.cfg);
          exp.state.next('CODE');
        }
        break;

      case 'CODE':
        if (!exp.firebase.saveSuccessful) {
          break;
        }
        exp.state.once(function () {
          exp.goodbye.show(); // show the goodbye screen
          exp.VRUI.edit({
            title: 'Complete',
            instructions:
              'Thank you. Exit VR to find the submission link on the study web page.',
            interactive: true,
            backButtonState: 'disabled',
            nextButtonState: 'idle',
            nextButtonText: 'Exit',
          });
        });
        if (exp.VRUI.clickedNext) {
          exp.xrSession.end();
        }
        break;

      case 'REST':
        exp.state.once(function () {
          exp.VRUI.edit({
            title: 'Rest break',
            instructions: `Good work! \
            Take a short break to stretch and relax your arm. \
            Do not exit or remove your headset.`,
            backButtonState: 'disabled',
            nextButtonState: 'idle',
          });
          trial.rotation = 0; // shut off the rotation
        });
        if (exp.VRUI.clickedNext) {
          // Hide UI
          exp.VRUI.edit({
            interactive: false,
            buttons: false,
            instructions: false,
          });
          exp.state.next('SETUP');
        }
        break;

      case 'STARTNOFEEDBACK':
        exp.state.once(function () {
          exp.VRUI.edit({
            title: 'Challenge',
            instructions: `Try to touch the targets without visual feedback!\
            Sometimes the tool will disappear as you reach forward. \
            Please pull the trigger when you think you are touching the target.`,
            backButtonState: 'disabled',
            nextButtonState: 'idle',
          });
          trial.noFeedback = true; // for convenience - we've already saved this trial
        });
        if (exp.VRUI.clickedNext) {
          // Hide UI
          exp.VRUI.edit({
            interactive: false,
            buttons: false,
            instructions: false,
          });
          exp.state.next('SETUP');
        }
        break;

      case 'CONTROLLER':
        exp.state.once(function () {
          // Ok to put down controller during rest
          if (exp.state.last !== 'REST') {
            exp.VRUI.edit({
              title: 'Controller',
              instructions: 'Please connect right hand controller.',
            });
          }
        });
        if (exp.ray && exp.grip) {
          exp.state.pop();
        }
        break;

      case 'DBCONNECT':
        exp.state.once(function () {
          exp.blocker.show('connection');
          exp.VRUI.edit({
            title: 'Not connected',
            instructions:
              'Your device is not connected to the internet. Reconnect to resume.',
            buttons: false,
            interactive: true,
          });
        });
        if (exp.firebase.databaseConnected) {
          exp.blocker.hide();
          exp.state.pop();
        }
        break;
    }
  }

  /**
   * Compute and update stimulus and UI presentation.
   */
  function displayFunc() {
    // Set home color and pulse animation
    if (home.atHome || exp.state.current === 'REACH') {
      home.material.color = new Color('black');
      home.pulseTween.stop();
    } else {
      home.material.color = new Color('orangered');
      home.pulseTween.start();
    }

    if (!trial.noFeedback && cp.onTarget) {
      target.material.opacity = 0.85;
    } else {
      target.material.opacity = 1;
    }

    // Hide feedback
    let cpWorld = cp.getWorldPosition(new Vector3());
    if (trial.noFeedback && cpWorld.z < exp.cfg.homePosn.z) {
      cp.material = cpTransMat;
      toolHandle.material = handleTransMat;
      let d = home.getWorldPosition(new Vector3()).distanceTo(cpWorld);
      let opacity = 1 - clamp(d / 0.05, 0, 1);
      cp.material.opacity = toolHandle.material.opacity = opacity;
    } else if (cp.material.transparent) {
      cp.material = cpMat;
      toolHandle.material = handleMat;
    }

    // Visuomotor rotation
    if (exp.grip && trial.rotationOrigin && trial.rotation !== 0) {
      let x = exp.grip.position.clone(); // get grip position (world)
      x.sub(trial.rotationOrigin); // subtract origin (world)
      x.applyAxisAngle(new Vector3(0, 1, 0), trial.rotationRadians); // rotate around world up
      x.add(trial.rotationOrigin); // add back origin
      exp.grip.worldToLocal(x); // convert to grip space
      toolHandle.position.copy(x); // set as tool position
    }

    tweenUpdate();
    exp.VRUI.updateUI();
    exp.sceneManager.render();
  }

  /**
   * Event handlers
   */

  // Record data on each main loop iteration
  function handleFrameData() {
    if (exp.grip) {
      trial.t.push(performance.now());
      trial.state.push(exp.state.current);
      // clone or you will get a reference
      trial.rhPos.push(exp.grip.position.clone());
      trial.rhOri.push(exp.grip.rotation.clone());
    }
  }

  // Record data on each state transition
  function handleStateChange() {
    trial.stateChange?.push(exp.state.current);
    trial.stateChangeTime?.push(performance.now());
    // Head data at state changes only (see handleFrameData)
    trial.stateChangeHeadPos?.push(exp.sceneManager.camera.position.clone());
    trial.stateChangeHeadOri?.push(exp.sceneManager.camera.rotation.clone());
  }

  // Subject-specific replay configuration
  function handleReplayInfo(e) {
    let cfg = e.detail;
    workspace.position.setY(cfg.homePosn.y);
    home.visible = true;
    toolHandle.visible = true;
    exp.grip = exp.replay.avatar;
  }

  // Trial-specific replay configuration
  function handleReplayTrial(e) {
    trial = e.detail;
    trial.isReplay = true;
    exp.state.next(e.detail['state'][0]);
  }
}

window.addEventListener('DOMContentLoaded', main);
