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
  Quaternion,
} from 'three';
import { Easing, Tween, update as tweenUpdate } from '@tweenjs/tween.js';
import { shuffle } from 'd3-array';

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
import targetNormalMapURL from 'ouvrai/lib/textures/Terrazzo018_1K-JPG/Terrazzo018_1K_NormalGL.jpg';
import targetRoughnessMapURL from 'ouvrai/lib/textures/Terrazzo018_1K-JPG/Terrazzo018_1K_Roughness.jpg';

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

    // Procedure (180 trials total; adapted from Vetter, Goodbody, & Wolpert, 1999)
    maxDemoTrials: 3,
    numFamiliarizationCycles: 1, // 1 cycle = 6 trials (1 to each target with feedback)
    numPreExposureCycles: 1, // 1 cycle = 14 trials (1 exposure 1 test, interleaved 7 x)
    numExposureRampCycles: 7, // 1 cycle = 1 trial (exposure target only), ramp up perturbation
    numExposurePlateauCycles: 3, // 1 cycle = 1 trial (exposure target only)
    numPostExposureCycles: 1, // same as preexposure
    restDuration: 5, // minimum duration of rest state
    restTrials: [], // // rest before which trials?
    startNoFeedbackDuration: 10, // minimum duration of notification state
    startNoFeedbackTrial: 6, // remove feedback before which trial?
    startDelay: 0.2, // time to remain in start position
    // Target arrangement
    targetIds: [0, 1, 2, 3, 4, 5, 6],
    targetDims: [0, 0, 0, 1, 1, 2, 2],
    targetMags: [0, -2, 2, -2, 2, -2, 2],
    targetSpacing: 0.04,
  });

  /**
   * Finite State Machine manages the flow of your experiment.
   * Define states here. Define behavior & transitions in stateFunc().
   */
  exp.cfg.stateNames = [
    'BROWSER',
    'CONSENT',
    'SIGNIN',
    'WELCOME',
    'CALIBRATE',
    'DEMO',
    // Begin customizable states
    'SETUP',
    'START',
    'DELAY',
    'REACH',
    'RETURN',
    'FINISH',
    'ADVANCE',
    // End customizable states
    'REST',
    'STARTNOFEEDBACK',
    'SURVEY',
    'CODE',
    'CONTROLLER',
    'DBCONNECT',
    'BLOCKED',
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
  // cube of edge length 1.414*r forms tight cage around sphere of radius r
  home.scale.setScalar(1.5); // we go slightly larger
  home.pulseTween = new Tween(home.scale)
    .to({ x: 1.8, y: 1.8, z: 1.8 }, 350)
    .repeat(Infinity)
    .yoyo(true)
    .easing(Easing.Sinusoidal.InOut)
    .onStop((scale) => scale.setScalar(1.5));
  workspace.add(home);

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
  // cylinder height is along local +Y but controller in grip space is along -Z
  // so rotate cylinder -90 degrees around X to align +Y with -Z
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
    [targetColorMapURL, targetNormalMapURL, targetRoughnessMapURL],
    { xRepeatTimes: 0.5, yRepeatTimes: 0.5 }
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
        exp.state.once(() => {
          exp.VRUI.edit({
            title: 'Instructions',
            instructions: `Welcome!\n\
            Please sit up straight or stand.\n\
            Notice the tool in your right hand.\n\
            You will reach in this direction to touch various targets with this tool.`,
            interactive: true,
            backButtonState: 'disabled',
            nextButtonState: 'idle',
          });
          home.visible = false;
        });
        if (exp.VRUI.clickedNext) exp.state.next('CALIBRATE');
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
          home.visible = false;
        });
        if (exp.ray?.userData.isSelecting) {
          let adjustHeight = cp.getWorldPosition(new Vector3()).y;
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
            instructions: `Can you perform these movements?\n\
            Adjust your position or reset your view so that you are positioned comfortably behind the start cube.\n\
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
        trial.cameraGroupPosn = exp.sceneManager.cameraGroup.position.clone();
        trial.cameraGroupOri = exp.sceneManager.cameraGroup.rotation.clone();
        // Reset data arrays and other defaults
        trial = { ...trial, ...structuredClone(trialInitialize) };
        // Set trial parameters
        trial.demoTrial =
          exp.trialNumber === 0 ||
          (exp.trialNumber < exp.cfg.maxDemoTrials && exp.repeatDemoTrial);
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
              ? `To start a trial, hold the end of the tool inside the cube.\n\
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
          // Update origin then radians to reduce/mask blips when rotation changes
          trial.rotationOrigin = home.getWorldPosition(new Vector3());
          trial.rotationRadians = (trial.rotation * Math.PI) / 180;
          exp.state.next('START');
        } else if (exp.state.expired(exp.cfg.startDelay)) {
          target.visible = true;
          target.rotateY((Math.random() - 0.5) * 2 * Math.PI); // random rotation to change appearance
          // Update origin then radians to reduce/mask blips when rotation changes
          trial.rotationOrigin = home.getWorldPosition(new Vector3());
          trial.rotationRadians = (trial.rotation * Math.PI) / 180;
          exp.state.next('REACH');
        }
        break;

      case 'REACH':
        exp.state.once(() => {
          exp.VRUI.edit({
            title: 'Hit target',
          });
        });
        handleFrameData();
        let cpWorld = cp.getWorldPosition(new Vector3());
        cp.onTarget =
          target.getWorldPosition(new Vector3()).distanceTo(cpWorld) <
          exp.cfg.targetRadius + exp.cfg.controlPointRadius;
        // Set the instructions conditionally in this state
        exp.VRUI.edit({
          instructions: trial.demoTrial
            ? !cp.onTarget
              ? `Touch the textured sphere with the white tip of the tool.`
              : `Press the trigger to clear the sphere.`
            : false,
        });
        // Stop them from just holding the trigger down
        if (exp.ray?.userData.isSelecting) {
          if (cpWorld.z > exp.cfg.homePosn.z - 0.05) {
            exp.ray.userData.isSelecting = false; // not beyond minimum reach distance
          } else if (!trial.noFeedback && !cp.onTarget) {
            exp.ray.userData.isSelecting = false; // off-target
          } else {
            // Visual, auditory, and haptic feedback of target hit
            if (!trial.noFeedback) {
              target.hitTween.start();
              target.userData.sound.play();
              exp.grip.gamepad.hapticActuators?.['0'].pulse(0.6, 40);
            } else {
              target.pulseTween.start();
              exp.grip.gamepad.hapticActuators?.['0'].pulse(0.6, 80);
            }
            exp.state.next('RETURN');
          }
        }
        break;

      case 'RETURN':
        exp.state.once(function () {
          exp.VRUI.edit({
            title: 'Go to start',
            instructions: trial.demoTrial
              ? `Good! Return to the start cube when you are ready for the next trial.\n\
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
          let canRepeatDemo = exp.trialNumber < exp.cfg.maxDemoTrials - 1;
          trial.demoTrial &&
            exp.VRUI.edit({
              title: 'Make sense?',
              instructions: `You will perform ${
                exp.numTrials - exp.trialNumber - 1
              } movements with different targets. \
              There will be ${
                exp.cfg.restTrials.length
              } rest breaks, but you may rest at any time before returning to the start cube.
              ${
                canRepeatDemo ? 'To repeat the instructions, click Back.\n' : ''
              }\
              If you are ready to start, click Next.`,
              interactive: true,
              backButtonState: canRepeatDemo ? 'idle' : 'disabled',
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
          exp.blocker.fatal(exp.firebase.saveFailed);
        }
        exp.nextTrial();
        if (exp.trialNumber < exp.numTrials) {
          // Many possible next states for different trial types
          if (exp.cfg.restTrials?.includes(exp.trialNumber)) {
            exp.state.next('REST');
            //exp.grip.visible = false; // hide hand during rest breaks
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
          // NB: Must call exp.complete()
          exp.complete();
          // Clean up
          workspace.visible = false;
          trial.rotation = 0;
          toolHandle.position.set(0, 0, 0);
          DisplayElement.hide(exp.sceneManager.renderer.domElement);
          exp.state.next('SURVEY');
        }
        break;

      case 'SURVEY':
        exp.state.once(() => exp.survey?.hidden && exp.survey.show());
        if (exp.cfg.completed && (!exp.survey || exp.surveysubmitted)) {
          exp.survey?.hide();
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
            Take a short break to stretch and relax your arm.\n\
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
            instructions: `Try to touch the targets without visual feedback! \
            Sometimes the tool will disappear as you reach forward.\n\
            Press the trigger when you think you are touching the target.\n\
            Try it out now before continuing.`,
            backButtonState: 'disabled',
            nextButtonState: 'idle',
          });
          trial.noFeedback = true; // not a problem bc we've already saved this trial
        });
        if (exp.VRUI.clickedNext) {
          // Hide UI
          exp.VRUI.edit({
            interactive: false,
            buttons: false,
            instructions: false,
          });
          exp.state.next('SETUP');
          break;
        }

        // Simulate a no-feedback trial
        if (home.atHome && !exp.demoTargetOn) {
          target.position.set(0, 0, -exp.cfg.targetDistance);
          target.visible = true;
          exp.demoTargetOn = true;
        }
        if (exp.ray?.userData.isSelecting && exp.demoTargetOn) {
          let cpWorld = cp.getWorldPosition(new Vector3());
          if (cpWorld.z > exp.cfg.homePosn.z - 0.05) {
            //exp.ray.userData.isSelecting = false; // not beyond minimum reach distance
          } else {
            target.pulseTween.start();
            exp.grip.gamepad.hapticActuators?.['0'].pulse(0.6, 80);
            exp.demoTargetOn = false;
          }
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

    let cpWorld = cp.getWorldPosition(new Vector3());

    // Hide feedback
    if (['REST'].includes(exp.state.current)) {
      toolHandle.visible = false;
    } else if (trial.noFeedback) {
      let d = home.getWorldPosition(new Vector3()).distanceTo(cpWorld);
      let opacity = 1 - clamp(d / 0.05, 0, 1);
      if (opacity > 0) {
        cp.material = cpTransMat;
        toolHandle.material = handleTransMat;
        toolHandle.visible = true;
        cp.material.opacity = toolHandle.material.opacity = opacity;
      } else {
        cp.material = cpMat;
        toolHandle.material = handleMat;
        toolHandle.visible = false;
      }
    } else if (cp.material.transparent || !toolHandle.visible) {
      cp.material = cpMat;
      toolHandle.material = handleMat;
      toolHandle.visible = true;
    }

    // Visuomotor rotation
    if (exp.grip && trial.rotationOrigin && trial.rotation !== 0) {
      let x = exp.grip.getWorldPosition(new Vector3()); // get grip position (world)
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
      // getWorld...() bc grip is child of cameraGroup
      trial.rhPos.push(exp.grip.getWorldPosition(new Vector3()));
      trial.rhOri.push(exp.grip.getWorldQuaternion(new Quaternion()));
    }
  }

  // Record data on each state transition
  function handleStateChange() {
    trial.stateChange?.push(exp.state.current);
    trial.stateChangeTime?.push(performance.now());
    // Head data at state changes only (see handleFrameData)
    trial.stateChangeHeadPos?.push(
      exp.sceneManager.camera.getWorldPosition(new Vector3())
    );
    trial.stateChangeHeadOri?.push(
      exp.sceneManager.camera.getWorldQuaternion(new Quaternion())
    );
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
