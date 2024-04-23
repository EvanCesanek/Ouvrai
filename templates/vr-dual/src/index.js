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
  TorusGeometry,
  CylinderGeometry,
  LineBasicMaterial,
  Object3D,
  Quaternion,
} from 'three';
import { Easing, Tween, update as tweenUpdate } from '@tweenjs/tween.js'; // https://github.com/tweenjs/tween.js/

// Package imports
import {
  Experiment,
  DisplayElement,
  MeshFactory,
  Collider,
  InstructionsPanel,
  checkAlignment,
  generateDemoReaches,
  clamp,
  quantizeAngle,
  Block,
} from 'ouvrai';

import * as fileContents from './fileContent.js';

// Static asset imports (https://vitejs.dev/guide/assets.html)
import environmentLightingURL from 'ouvrai/lib/environments/IndoorHDRI003_1K-HDR.exr?url'; // absolute path from ouvrai
import bubbleSoundURL from './bubblePopping.mp3?url'; // relative path from src

/*
 * Main function contains all experiment logic. At a minimum you should:
 * 1. Create a `new Experiment({...config})`
 * 2. Initialize the state machine with `exp.state.init(states, changeFunc)`
 * 3. Create stimuli and add them with `exp.sceneManager.scene.add(...objects)`
 * 4. Create trial sequence with `exp.createTrialSequence([...blocks])`
 * 5. Start the main loop with `exp.start(calcFunc, stateFunc, displayFunc)`
 * 6. Design your experiment by editing `calcFunc`, `stateFunc`, and `displayFunc`
 */

async function main() {
  // Configure your experiment
  const exp = new Experiment({
    // Options to make development easier
    devOptions: {
      skipConsent: true,
      orbitControls: false,
    },
    demo: false,

    // Platform settings
    requireVR: true,
    handTracking: false,
    controllerModels: false,

    // Three.js settings
    environmentLighting: environmentLightingURL,
    gridRoom: true,
    audio: true,

    // Scene quantities
    // Assume meters and seconds for three.js, but note tween.js uses milliseconds
    maxRotation: 15, // degrees
    handleLength: 0.09,
    controlPointRadius: 0.01,
    targetRadius: 0.02,
    targetDistance: 0.2,
    targetSeparation: 0.16,
    homePosn: new Vector3(0, 0.9, -0.3),

    // Procedure (reduced-length version)
    maxDemoTrials: 3,
    numBaselineCycles: 3,
    numRampCycles: 3,
    numPlateauCycles: 3,
    numWashoutCycles: 3,
    restDuration: 15, // minimum duration of rest state
    restTrials: [30, 70], // rest before which trials?
    startNoFeedbackDuration: 3, // minimum duration of notification state
    startNoFeedbackTrial: 6, //14, // remove feedback before which trial?
    //startClampTrial: 100, // no clamp?
    noFeedbackNear: 0.03, // radius beyond which feedback is off
    startDelay: 0.2, // time to remain in start position
  });

  /**
   * Initialize Finite State Machine (FSM) that manages the flow of your experiment.
   * You will define the behavior and transitions of the FSM below in stateFunc().
   */
  exp.state.init(
    [
      'CONSENT',
      'SIGNIN',
      'WELCOME',
      'CALIBRATE',
      'DEMO',
      'SETUP',
      'START',
      'DELAY',
      'REACH',
      'RETURN',
      'FINISH',
      'ADVANCE',
      'REST',
      'STARTNOFEEDBACK',
      'SURVEY',
      'CODE',
      'CONTROLLER',
      'DATABASE',
      'BLOCKED',
    ],
    handleStateChange
  );

  // Short instruction panel telling them to click ENTER VR
  exp.instructions = new InstructionsPanel({
    content: `Click the ENTER VR button to start.\nYou will see more instructions in VR.`,
    collapsible: false,
  });

  /*
   * Create visual stimuli with three.js
   */

  // Workspace "root" (helpful for individual height calibration)
  const workspace = new Group();
  workspace.position.copy(exp.cfg.homePosn);
  exp.sceneManager.scene.add(workspace);

  // Home will be a Group of two home positions because we have two control points
  const home = new Group();
  home.visible = false;
  workspace.add(home);

  // Home position (generic)
  const homecp = MeshFactory.edges({
    geometry: new BoxGeometry(
      exp.cfg.controlPointRadius,
      exp.cfg.controlPointRadius,
      exp.cfg.controlPointRadius,
      1,
      1
    ),
  });
  // cube of edge length 1.414*r forms tight cage around sphere of radius r
  homecp.scale.setScalar(1.5); // we go slightly larger

  // Create tool
  // We will switch between opaque and transparent version of this material
  let handleMat = new MeshStandardMaterial({
    color: 'slategray',
    roughness: 0.7,
    metalness: 1,
  });
  let handleTransMat = new MeshStandardMaterial({
    color: 'slategray',
    roughness: 0.7,
    metalness: 1,
    transparent: true,
  });
  // Handle of the tool
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
  // Top of the T-shaped tool
  const toolBar = new Mesh(
    new CylinderGeometry(
      exp.cfg.controlPointRadius * 0.99,
      exp.cfg.controlPointRadius,
      exp.cfg.targetSeparation,
      24,
      1,
      true
    ),
    handleMat
  );
  // Rotate 90 degrees to get T-shape; -X along grip, +Y to the right
  toolBar.rotateZ(-Math.PI / 2);
  // Gimbal: Add toolBar to scene, independent of toolHandle, so we can lock x-axis to world space
  exp.sceneManager.scene.add(toolBar);
  // We put a "dummy" object at the end of the handle and the toolBar will follow its position (but not orientation)
  const toolBarDummy = new Object3D();
  toolBarDummy.translateY(exp.cfg.handleLength / 2);
  toolHandle.add(toolBarDummy);

  // Create tool control point (generic) with a Collider to detect collisions
  const cp = new Mesh(new SphereGeometry(exp.cfg.controlPointRadius, 24, 12));
  cp.add(new Collider(new SphereGeometry(exp.cfg.controlPointRadius, 8, 4)));

  // Need to use a listener to add the tool to the hand on connect
  document.body.addEventListener('gripconnect', (e) => {
    if (e.detail.hand === 'right') {
      exp.rightGrip.add(toolHandle);
    }
  });

  // Create reach target (generic)
  const target = new Mesh(
    new TorusGeometry(exp.cfg.targetRadius, exp.cfg.targetRadius / 10, 8, 24),
    new MeshStandardMaterial()
  );
  target.translateZ(-exp.cfg.targetDistance);
  target.visible = false;
  // To register collision when control point goes through the ring, create a solid invisible object
  const targetCenter = new Mesh(
    new CylinderGeometry(
      target.geometry.parameters.radius,
      target.geometry.parameters.radius,
      target.geometry.parameters.tube
    ),
    new MeshStandardMaterial()
  );
  targetCenter.visible = false;
  targetCenter.rotateX(-Math.PI / 2);
  target.add(targetCenter);

  // Now we will use the generic objects to create parameterized clones
  // using a per-target (i.e., per-control point) loop
  exp.cfg.targetIds = [0, 1];
  exp.cfg.targetRotationSigns = [-1, 1];
  exp.cfg.targetColors = ['red', 'blue'];
  const targets = [];
  const controlPoints = [];
  const homePoints = [];
  for (let oi of exp.cfg.targetIds) {
    // Create a parameterized instance of target
    let targi = target.clone();
    targi.translateX((oi - 0.5) * exp.cfg.targetSeparation);
    targi.material = new MeshStandardMaterial({
      color: exp.cfg.targetColors[oi],
    });
    // Attach a sound
    targi.userData.sound = new PositionalAudio(exp.audioListener);
    targi.add(targi.userData.sound);
    // Animation that makes the target shrink down to nothing when touched with trigger
    targi.hitTween = new Tween(targi)
      .to({ scale: { x: 0, y: 0, z: 0 } }, 220)
      .easing(Easing.Back.InOut)
      .onComplete(function (o) {
        o.visible = false;
        o.scale.setScalar(1);
      });
    workspace.add(targi);

    // Create parameterized control point instance
    let cpi = cp.clone();
    // We can store the two materials without applying them in the userData field
    cpi.userData.mat = new MeshStandardMaterial({
      color: exp.cfg.targetColors[oi],
    });
    cpi.userData.transMat = new MeshStandardMaterial({
      transparent: true,
      color: exp.cfg.targetColors[oi],
    });
    cpi.material = cpi.userData.mat;
    cpi.translateY((oi - 0.5) * exp.cfg.targetSeparation);
    // glow effect
    cpi.material.emissive = new Color('white');
    cpi.material.emissiveIntensity = 0;
    cpi.glowTween = new Tween(cpi.material)
      .to({ emissiveIntensity: 0.15 }, 500)
      .repeat(Infinity)
      .yoyo(true)
      .easing(Easing.Sinusoidal.InOut)
      .onStop((m) => (m.emissiveIntensity = 0));
    toolBar.add(cpi);

    // Create home point instance
    let homecpi = homecp.clone();
    homecpi.material = new LineBasicMaterial({
      color: exp.cfg.targetColors[oi],
    });
    homecpi.material.color.offsetHSL(0, -0.25, 0);
    homecpi.translateX((oi - 0.5) * exp.cfg.targetSeparation);
    homecpi.pulseTween = new Tween(homecpi.scale)
      .to({ x: 1.8, y: 1.8, z: 1.8 }, 350)
      .repeat(Infinity)
      .yoyo(true)
      .easing(Easing.Sinusoidal.InOut)
      .onStop((scale) => scale.setScalar(1.5));
    home.add(homecpi);

    // Push to arrays for easy access
    targets.push(targi);
    controlPoints.push(cpi);
    homePoints.push(homecpi);
  }

  // Create a tool avatar to demonstrate reaching movements
  const demo = new Group();
  demo.visible = false;
  workspace.add(demo);
  const demoTool = toolHandle.clone(true);
  demoTool.rotateX(Math.PI / 3); // Tilted forward 30 degrees
  demoTool.material = new MeshStandardMaterial({
    color: '#1c2a29',
    roughness: 1,
    metalness: 1,
  });
  demo.add(demoTool);
  // Clone the tool bar and add it to the cloned dummy object
  const demoToolBar = toolBar.clone(true);
  demoTool.children[0].add(demoToolBar);
  demoToolBar.material = demoTool.material;
  const demoControlPoints = demoToolBar.children;

  // No feedback region
  const region = MeshFactory.noFeedbackZone({
    near: exp.cfg.noFeedbackNear,
    far: exp.cfg.targetDistance - exp.cfg.noFeedbackNear,
  });
  region.translateZ(-0.01); // local Z is world Y (vertical)
  region.visible = false;
  workspace.add(region);

  // Same sound added to each target
  exp.audioLoader.load(bubbleSoundURL, function (buffer) {
    targets.forEach((o) => o.userData.sound.setBuffer(buffer));
  });

  /*
   * Create trial sequence from array of block objects.
   */
  exp.createTrialSequence([
    new Block({
      variables: {
        targetId: exp.cfg.targetIds,
        rotation: 0,
      },
      options: {
        name: 'baseline',
        shuffle: true,
        reps: exp.cfg.numBaselineCycles,
      },
    }),
    new Block({
      variables: {
        targetId: exp.cfg.targetIds,
        rotation: 0, // placeholder, real values assigned below
      },
      options: {
        name: 'ramp',
        shuffle: true,
        reps: exp.cfg.numRampCycles,
      },
    }),
    new Block({
      variables: {
        targetId: exp.cfg.targetIds,
        rotation: exp.cfg.maxRotation,
      },
      options: {
        name: 'plateau',
        shuffle: true,
        reps: exp.cfg.numPlateauCycles,
      },
    }),
    new Block({
      variables: {
        targetId: exp.cfg.targetIds,
        rotation: 0,
      },
      options: {
        name: 'washout',
        shuffle: true,
        reps: exp.cfg.numWashoutCycles,
      },
    }),
  ]);

  // Manually assign the rotation magnitude on the ramp-phase trials
  const rampDegPerCycle = exp.cfg.maxRotation / exp.cfg.numRampCycles;
  for (let t of exp.trials) {
    if (t.block.name == 'ramp') {
      t.rotation = (1 + t.block.repetition) * rampDegPerCycle;
    }
  }

  /*
   * You must initialize an empty object called trial
   */
  let trial = {};

  // Start the main loop! These three functions will take it from here.
  exp.start(calcFunc, stateFunc, displayFunc);

  /**
   * Use `calcFunc` for calculations used in _multiple states_
   */
  function calcFunc() {
    // During DEMO, the demo avatar is in control
    let toolPoints = exp.state.is('DEMO') ? demoControlPoints : controlPoints;

    // Check if each control point is in the home position
    home.check = homePoints.map((homePoint, i) =>
      checkAlignment({ o1: homePoint, o2: toolPoints[i], angleThresh: false })
    );
    home.atHome = home.check.every((x) => x);
  }

  /**
   * Define your procedure as a switch statement implementing a Finite State Machine.
   * Ensure that all states are listed in the array given to `exp.state.init()`
   * @method `exp.state.next(state)` Transitions to new state on next loop.
   * @method `exp.state.once(function)` Runs function one time on entering state.
   */
  function stateFunc() {
    /**
     * If one of these checks fails, divert into an interrupt state.
     * Interrupt states wait for the condition to be satisfied, then return to the previous state.
     * Interrupt states are included at the end of the stateFunc() switch statement.
     */
    if (exp.databaseInterrupt()) {
      exp.blocker.show('database');
      exp.state.push('DATABASE');
    } else if (exp.controllerInterrupt(false, true)) {
      exp.state.push('CONTROLLER');
    }

    switch (exp.state.current) {
      // CONSENT state can be left alone
      case 'CONSENT':
        exp.state.once(function () {
          if (exp.checkDeviceCompatibility()) {
            exp.state.next('BLOCKED');
          } else {
            exp.consent.show();
          }
        });
        if (exp.waitForConsent()) {
          exp.state.next('SIGNIN');
        }
        break;

      // SIGNIN state can be left alone
      case 'SIGNIN':
        if (exp.waitForAuthentication()) {
          exp.state.next('WELCOME');
        }
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
        if (exp.rightRay?.userData.isSelecting) {
          let adjustHeight = toolBar.getWorldPosition(new Vector3()).y;
          exp.rightGrip.input.gamepad.hapticActuators?.['0'].pulse(0.6, 80);
          workspace.position.setY(adjustHeight);
          exp.cfg.homePosn.y = adjustHeight;
          exp.demoTargetOn = false;
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
          // Align the avatar with the home position
          demo.position.add(
            new Vector3().subVectors(
              home.getWorldPosition(new Vector3()),
              demoTool.children[0].getWorldPosition(new Vector3())
            )
          );
          if (!demo.demoTween?.isPlaying()) {
            demo.demoTween = generateDemoReaches({
              object: demo,
              maxAngle: Math.PI / 30,
              distance: exp.cfg.targetDistance * 1.2,
              duration: 750,
            });
          }
          demo.demoTween.start();
        });
        // Display the target when avatar returns home
        if (home.atHome && exp.demoTargetOn === false) {
          exp.demoTargetOn = Math.round(Math.random());
          targets[exp.demoTargetOn].visible = true;
        }
        // Provide feedback when avatar hits the target
        if (
          Number.isInteger(exp.demoTargetOn) &&
          demoControlPoints[exp.demoTargetOn].collider.test(
            targets[exp.demoTargetOn].children[0]
          )
        ) {
          targets[exp.demoTargetOn].userData.sound.play(); // Auditory feedback
          targets[exp.demoTargetOn].hitTween.start(); // Animate target hit
          exp.demoTargetOn = false; // Prime for reset
        }
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
        // Remember rotation from last trial so we can cross-fade to minimize blips
        let previousRotation = trial.rotationRadians ?? 0;
        // Start with a deep copy of the initialized trial from exp.trials
        trial = structuredClone(exp.trials[exp.trialNumber]);
        trial.trialNumber = exp.trialNumber;
        trial.startTime = performance.now();
        trial.cameraGroupPosn = exp.sceneManager.cameraGroup.position.clone();
        trial.cameraGroupOri = exp.sceneManager.cameraGroup.rotation.clone();
        trial.rotationRadians = previousRotation;
        // Reset data arrays
        trial.t = [];
        trial.state = [];
        trial.rhPos = [];
        trial.rhOri = [];
        trial.stateChange = [];
        trial.stateChangeTime = [];
        trial.stateChangeHeadPos = [];
        trial.stateChangeHeadOri = [];
        // Set trial parameters
        trial.demoTrial =
          exp.trialNumber === 0 ||
          (exp.trialNumber < exp.cfg.maxDemoTrials && exp.repeatDemoTrial);
        trial.noFeedback = trial.trialNumber >= exp.cfg.startNoFeedbackTrial;
        trial.rotation *= exp.cfg.targetRotationSigns[trial.targetId];
        trial.rotationOrigin = home.getWorldPosition(new Vector3());
        // Tween rotationRadians from old value to mask blips on sign-change
        let newRotation = (trial.rotation * Math.PI) / 180;
        new Tween(trial).to({ rotationRadians: newRotation }, 50).start();
        exp.state.next('START');
        break;

      case 'START':
        exp.state.once(function () {
          exp.VRUI.edit({
            title: 'Go to start',
            instructions: trial.demoTrial
              ? `To start a trial, hold the ends of the tool inside the cubes. \
            The cubes will turn black when you are in the right place.`
              : false,
            interactive: false,
            buttons: false,
            backButtonState: 'disabled',
            nextButtonState: 'disabled',
          });
          targets[trial.targetId].visible = false;
        });
        // Shorthand if statement
        home.atHome && exp.state.next('DELAY');
        break;

      case 'DELAY':
        exp.state.once(function () {
          controlPoints[trial.targetId].glowTween.start();
          // clear frame data from possible prior visits to DELAY
          trial.t = [];
          trial.state = [];
          trial.rhPos = [];
          trial.rhOri = [];
        });
        handleFrameData();
        if (!home.atHome) {
          controlPoints[trial.targetId].glowTween.stop();
          exp.state.next('START');
        } else if (exp.state.expired(exp.cfg.startDelay)) {
          targets.map((x, i) => (x.visible = i === trial.targetId));
          exp.state.next('REACH');
        }
        break;

      case 'REACH':
        exp.state.once(() => {
          let col = exp.cfg.targetColors[trial.targetId];
          exp.VRUI.edit({
            title: 'Hit target',
            instructions: trial.demoTrial
              ? `Reach forward so the ${col} end of the tool goes through the ${col} ring.`
              : false,
          });
        });
        handleFrameData();
        // Check for target hit
        if (
          controlPoints[trial.targetId].collider.test(
            targets[trial.targetId].children[0]
          )
        ) {
          // Visual, auditory, and haptic feedback of hit
          targets[trial.targetId].hitTween.start();
          controlPoints[trial.targetId].glowTween.stop();
          targets[trial.targetId].userData.sound.play();
          exp.rightGrip.input.gamepad.hapticActuators?.['0'].pulse(0.6, 40);
          exp.state.next('RETURN');
        }
        break;

      case 'RETURN':
        exp.state.once(function () {
          exp.VRUI.edit({
            title: 'Go to start',
            instructions: trial.demoTrial
              ? `Good! Return to the start cubes when you are ready for the next trial.`
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
              } movements with red and blue targets. \
              There will be ${
                exp.cfg.restTrials.length
              } rest breaks, but you may rest at any time before returning to the start cubes.
              ${
                canRepeatDemo ? 'To repeat the instructions, click Back.\n' : ''
              }\
              If you are ready to start, click Next.`,
              interactive: true,
              backButtonState: canRepeatDemo ? 'idle' : 'disabled',
              nextButtonState: 'idle',
            });
          targets[trial.targetId].visible = false;
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
          exp.blocker.fatal(err);
          exp.state.push('BLOCKED');
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
          exp.complete(); // !!! Critical !!! Must call at end of experiment !!!

          // Clean up
          workspace.visible = false;
          trial.noFeedback = false;
          trial.rotation = 0;
          toolHandle.position.set(0, 0, 0);
          DisplayElement.hide(exp.sceneManager.renderer.domElement);
          exp.state.next('SURVEY');
        }
        break;

      case 'SURVEY':
        // There's no survey so we just save the cfg again
        if (exp.cfg.completed) {
          exp.cfg.trialNumber = 'info';
          exp.firebase
            .uploadCodeString(fileContents)
            .then(() => console.log('All file contents uploaded successfully'))
            .catch((error) =>
              console.error('Error uploading file contents:', error)
            );
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
          trial.noFeedback = false;
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
            instructions: `Try to hit the targets without visual feedback! \
            In the gray area, the tool will disappear. A dark ring shows your distance.\n\
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
        }
        break;

      case 'CONTROLLER':
        exp.state.once(function () {
          // Ok to put down controller during rest
          if (exp.state.last !== 'REST') {
            exp.VRUI.edit({
              title: 'Controller?',
              instructions: 'Please connect right hand controller.',
              buttons: false,
              interactive: false,
            });
          }
        });
        if (!exp.controllerInterrupt(false, true)) {
          exp.state.pop();
        }
        break;

      case 'DATABASE':
        exp.state.once(function () {
          exp.blocker.show('database');
          exp.VRUI.edit({
            title: 'Not connected',
            instructions:
              'Your device is not connected to the internet. Reconnect to resume.',
            buttons: false,
            interactive: true,
          });
        });
        if (!exp.databaseInterrupt()) {
          exp.blocker.hide();
          exp.state.pop();
        }
        break;

      case 'BLOCKED':
        break;
    }
  }

  /**
   * Compute and update stimulus and UI presentation.
   */
  function displayFunc() {
    // Set home color and pulse animation
    for (let oi = 0; oi < 2; oi++) {
      // set color and tween based on alignment
      if (home.check[oi] || exp.state.is('REACH')) {
        homePoints[oi].material.color = new Color('black');
        homePoints[oi].pulseTween.stop();
      } else {
        homePoints[oi].material.color = new Color(exp.cfg.targetColors[oi]);
        homePoints[oi].pulseTween.start();
      }
    }

    // No visual feedback
    if (exp.state.is(['REST', 'STARTCLAMP'])) {
      toolHandle.visible = toolBar.visible = false;
    } else if (trial.noFeedback) {
      let homeWorldXZ = home.getWorldPosition(new Vector3()).setY(0);
      let cpHomeXZ = toolBarDummy //controlPoints[trial.targetId]
        .getWorldPosition(new Vector3())
        .setY(0)
        .sub(homeWorldXZ);
      let d = cpHomeXZ.length();
      let e = Math.min(d, exp.cfg.targetDistance - d) / exp.cfg.noFeedbackNear;
      let opacity = 1 - clamp(e, 0, 1);
      region.visible = region.ring.visible = true;
      // Fade the tool
      if (opacity > 0) {
        controlPoints.forEach((o) => (o.material = o.userData.transMat));
        toolHandle.material = toolBar.material = handleTransMat;
        toolHandle.visible = toolBar.visible = true;
        controlPoints[0].material.opacity =
          controlPoints[1].material.opacity =
          toolHandle.material.opacity =
          toolBar.material.opacity =
            opacity;
        if (d < exp.cfg.noFeedbackNear) {
          region.rotateZ(
            Math.PI / 2 -
              region.rotation.z -
              region.geometry.parameters.thetaLength / 2
          );
          region.ring.scale.setScalar(exp.cfg.noFeedbackNear);
        }
      } else {
        controlPoints.forEach((o) => (o.material = o.userData.mat));
        toolHandle.material = toolBar.material = handleMat;
        toolHandle.visible = toolBar.visible = false;
        // Draw the no-feedback region
        region.ring.scale.setScalar(d);
        let theta = quantizeAngle(-Math.atan2(cpHomeXZ.z, cpHomeXZ.x));
        region.rotateZ(
          theta - region.rotation.z - region.geometry.parameters.thetaLength / 2
        );
      }
    } else if (toolHandle.material.transparent || !toolHandle.visible) {
      controlPoints.forEach((o) => (o.material = o.userData.mat));
      toolHandle.material = toolBar.material = handleMat;
      toolHandle.visible = toolBar.visible = true;
    }

    if (exp.rightGrip && trial.errorClamp) {
      // Error clamp control point to the Z axis
      let dxyz = new Vector3().subVectors(
        cp.getWorldPosition(new Vector3()),
        toolHandle.getWorldPosition(new Vector3())
      );
      toolHandle.position.copy(
        exp.rightGrip.worldToLocal(
          exp.rightGrip.getWorldPosition(new Vector3()).setX(-dxyz.x)
        )
      );
    } else if (exp.rightGrip && trial.rotationOrigin && trial.rotation !== 0) {
      // Visuomotor rotation
      let x = exp.rightGrip.getWorldPosition(new Vector3()); // get grip position (world)
      x.sub(trial.rotationOrigin); // subtract origin (world)
      x.applyAxisAngle(new Vector3(0, 1, 0), trial.rotationRadians); // rotate around world up
      x.add(trial.rotationOrigin); // add back origin
      exp.rightGrip.worldToLocal(x); // convert to grip space
      toolHandle.position.copy(x); // set as tool position
    }

    // Gimbal
    toolBarDummy.getWorldPosition(toolBar.position);

    tweenUpdate();
    exp.VRUI.updateUI();
    exp.sceneManager.render();
  }

  /**
   * Event handlers
   */

  // Record frame data
  function handleFrameData() {
    if (exp.rightGrip) {
      trial.t.push(performance.now());
      trial.state.push(exp.state.current);
      // getWorldX() because grip is child of cameraGroup
      trial.rhPos.push(exp.rightGrip.getWorldPosition(new Vector3()));
      trial.rhOri.push(exp.rightGrip.getWorldQuaternion(new Quaternion()));
    }
  }

  // Record state transition data
  function handleStateChange() {
    trial?.stateChange?.push(exp.state.current);
    trial?.stateChangeTime?.push(performance.now());
    // Head data at state changes only (see handleFrameData)
    trial?.stateChangeHeadPos?.push(
      exp.sceneManager.camera.getWorldPosition(new Vector3())
    );
    trial?.stateChangeHeadOri?.push(
      exp.sceneManager.camera.getWorldQuaternion(new Quaternion())
    );
  }
}

window.addEventListener('DOMContentLoaded', main);
