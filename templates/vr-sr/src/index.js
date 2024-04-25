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

import { fileContents } from './fileContents.js';
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
    rotation: 15, // degrees
    handleLength: 0.09,
    controlPointRadius: 0.01,
    targetRadius: 0.02,
    targetDistance: 0.2,
    homePosn: new Vector3(0, 0.9, -0.3),

    // Procedure (reduced-length version)
    maxDemoTrials: 2,
    numBaselineCycles: 6, // 1 cycle = 1 trial (because 1 target)
    numPositiveCycles: 12,
    numNegativeCycles: 4,
    numClampCycles: 8,
    restDuration: 15, // minimum duration of rest state
    restTrials: [], // rest before which trials?
    startNoFeedbackDuration: 3, // minimum duration of notification state
    startNoFeedbackTrial: 4, // remove feedback before which trial?
    startClampTrial: 22,
    noFeedbackNear: 0.03, // radius beyond which feedback is off
    startDelay: 0.2, // time to remain in start position

    experimentSourceCode: fileContents,
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
      'STARTCLAMP',
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
  // animation that makes the home cube size pulsate slightly (1.5 - 1.8)
  home.pulseTween = new Tween(home.scale)
    .to({ x: 1.8, y: 1.8, z: 1.8 }, 350)
    .repeat(Infinity)
    .yoyo(true)
    .easing(Easing.Sinusoidal.InOut)
    .onStop((scale) => scale.setScalar(1.5));
  workspace.add(home);

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
  // Create control point at end of tool
  let cpMat = new MeshStandardMaterial();
  let cpTransMat = new MeshStandardMaterial({
    transparent: true,
  });
  const cp = new Mesh(new SphereGeometry(exp.cfg.controlPointRadius), cpMat);
  cp.translateY(exp.cfg.handleLength / 2);
  toolHandle.add(cp);
  // Attach a Collider so we can test for collisions with other objects.
  cp.add(new Collider(new SphereGeometry(exp.cfg.controlPointRadius, 8, 4)));

  // Need to use a listener to add the tool to the hand on connect
  document.body.addEventListener('gripconnect', (e) => {
    if (e.detail.hand === 'right') {
      exp.rightGrip.add(toolHandle);
    }
  });

  // Create the reach target
  const target = new Mesh(
    new TorusGeometry(exp.cfg.targetRadius, exp.cfg.targetRadius / 10, 8, 24),
    new MeshStandardMaterial()
  );
  target.translateZ(-exp.cfg.targetDistance);
  // Animation that makes the target shrink down to nothing when hit
  target.hitTween = new Tween(target)
    .to({ scale: { x: 0, y: 0, z: 0 } }, 220)
    .easing(Easing.Back.InOut)
    .onComplete((o) => {
      o.visible = false;
      o.scale.setScalar(1);
    })
    .start();
  workspace.add(target);
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
  // Attach a sound to the target
  target.userData.sound = new PositionalAudio(exp.audioListener);
  exp.audioLoader.load(bubbleSoundURL, function (buffer) {
    target.userData.sound.setBuffer(buffer);
  });
  target.add(target.userData.sound);

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
  const democp = demoTool.children[0];

  // No feedback region
  const region = MeshFactory.noFeedbackZone({
    near: exp.cfg.noFeedbackNear,
    far: exp.cfg.targetDistance - exp.cfg.noFeedbackNear,
  });
  region.translateZ(-0.01); // local Z is world Y (vertical)
  region.visible = false;
  workspace.add(region);

  /*
   * Create trial sequence from array of block objects.
   */
  exp.createTrialSequence([
    new Block({
      variables: {
        rotation: 0,
      },
      options: {
        name: 'P0',
        reps: exp.cfg.numBaselineCycles,
      },
    }),
    new Block({
      variables: {
        rotation: exp.cfg.rotation,
      },
      options: {
        name: 'P+',
        reps: exp.cfg.numPositiveCycles,
      },
    }),
    new Block({
      variables: {
        rotation: -exp.cfg.rotation,
      },
      options: {
        name: 'P-',
        reps: exp.cfg.numNegativeCycles,
      },
    }),
    new Block({
      variables: {
        rotation: 0,
        errorClamp: true,
      },
      options: {
        name: 'EC',
        reps: exp.cfg.numClampCycles,
      },
    }),
  ]);

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
    let toolcp = exp.state.is('DEMO') ? democp : cp;

    // Check if control point is in the home position
    home.atHome = checkAlignment({
      o1: home,
      o2: toolcp,
      angleThresh: false,
    });
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
          console.log(exp.rightGrip);
          let adjustHeight = cp.getWorldPosition(new Vector3()).y;
          exp.rightGrip.input.gamepad.hapticActuators?.['0'].pulse(0.6, 80);
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
              maxAngle: Math.PI / 30,
              distance: exp.cfg.targetDistance * 1.2,
              duration: 750,
            });
          }
          demo.demoTween.start();
        });
        // Display the target when avatar returns home
        if (home.atHome && !exp.demoTargetOn) {
          exp.demoTargetOn = true;
          target.visible = true;
        }
        // Provide feedback when avatar hits the target
        if (exp.demoTargetOn && democp.collider.test(targetCenter)) {
          target.userData.sound.play(); // Auditory feedback
          target.hitTween.start(); // Animate target hit
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
        // Start with a deep copy of the initialized trial from exp.trials
        trial = structuredClone(exp.trials[exp.trialNumber]);
        trial.trialNumber = exp.trialNumber;
        trial.startTime = performance.now();
        trial.cameraGroupPosn = exp.sceneManager.cameraGroup.position.clone();
        trial.cameraGroupOri = exp.sceneManager.cameraGroup.rotation.clone();
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
        trial.rotationOrigin = home.getWorldPosition(new Vector3());
        trial.rotationRadians = (trial.rotation * Math.PI) / 180;
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
          exp.state.next('START');
        } else if (exp.state.expired(exp.cfg.startDelay)) {
          target.visible = true;
          exp.state.next('REACH');
        }
        break;

      case 'REACH':
        exp.state.once(() => {
          exp.VRUI.edit({
            title: 'Hit target',
            instructions: trial.demoTrial
              ? `Reach forward so the end of the tool goes through the ring.`
              : false,
          });
        });
        handleFrameData();
        // Check for target hit
        if (cp.collider.test(targetCenter)) {
          // Visual, auditory, and haptic feedback of hit
          target.hitTween.start();
          target.userData.sound.play();
          exp.rightGrip.input.gamepad.hapticActuators?.['0'].pulse(0.6, 40);
          exp.state.next('RETURN');
        }
        break;

      case 'RETURN':
        exp.state.once(function () {
          exp.VRUI.edit({
            title: 'Go to start',
            instructions: trial.demoTrial
              ? `Good! Return to the start cube when you are ready for the next trial.`
              : false,
          });
        });
        // Time limit avoids excessive data if they meander
        !exp.state.expired(2) && handleFrameData();
        // Shut off error clamp during the return movement
        if (
          trial.errorClamp &&
          trial.clampOff === undefined &&
          !toolHandle.visible
        ) {
          trial.clampOff = performance.now();
        }
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
              } movements toward the same target. \
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
          } else if (exp.trialNumber === exp.cfg.startClampTrial) {
            exp.state.next('STARTCLAMP');
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
          trial.errorClamp = false;
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
          trial.errorClamp = false;
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
            instructions: `Try to hit the target without visual feedback! \
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

      case 'STARTCLAMP':
        exp.state.once(function () {
          exp.VRUI.edit({
            title: 'Almost done',
            instructions: `For the remaining trials, please aim straight at the target, the way you would normally. \
              Do not deliberately aim to either side of the target.`,
            backButtonState: 'disabled',
            nextButtonState: 'idle',
          });
          trial.errorClamp = true; // not a problem bc we've already saved this trial
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
            interactive: false,
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
    if (home.atHome || exp.state.is('REACH')) {
      home.material.color = new Color('black');
      home.pulseTween.stop();
    } else {
      home.material.color = new Color('orangered');
      home.pulseTween.start();
    }

    if (exp.rightGrip && trial.errorClamp) {
      if (trial.clampOff || exp.state.between('START', 'DELAY')) {
        toolHandle.position.set(0, 0, 0);
      } else {
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
      }
    } else if (exp.rightGrip && trial.rotationOrigin && trial.rotation !== 0) {
      // Visuomotor rotation
      let x = exp.rightGrip.getWorldPosition(new Vector3()); // get grip position (world)
      x.sub(trial.rotationOrigin); // subtract origin (world)
      x.applyAxisAngle(new Vector3(0, 1, 0), trial.rotationRadians); // rotate around world up
      x.add(trial.rotationOrigin); // add back origin
      exp.rightGrip.worldToLocal(x); // convert to grip space
      toolHandle.position.copy(x); // set as tool position
    }

    // No visual feedback
    if (exp.state.is(['REST', 'STARTCLAMP'])) {
      toolHandle.visible = false;
    } else if (trial.noFeedback) {
      let homeWorldXZ = home.getWorldPosition(new Vector3()).setY(0);
      let cpHomeXZ = cp
        .getWorldPosition(new Vector3())
        .setY(0)
        .sub(homeWorldXZ);
      let d = cpHomeXZ.length();
      let e = Math.min(d, exp.cfg.targetDistance - d) / exp.cfg.noFeedbackNear;
      let opacity = 1 - clamp(e, 0, 1);
      region.visible = region.ring.visible = true;
      // Fade the tool
      if (opacity > 0) {
        cp.material = cpTransMat;
        toolHandle.material = handleTransMat;
        toolHandle.visible = true;
        cp.material.opacity = toolHandle.material.opacity = opacity;
        if (d < exp.cfg.noFeedbackNear) {
          // Draw the no-feedback region
          region.ring.scale.setScalar(exp.cfg.noFeedbackNear);
          region.rotateZ(
            Math.PI / 2 -
              region.rotation.z -
              region.geometry.parameters.thetaLength / 2
          );
        }
      } else {
        cp.material = cpMat;
        toolHandle.material = handleMat;
        toolHandle.visible = false;
        // Draw the no-feedback region
        region.ring.scale.setScalar(d);
        let theta = quantizeAngle(-Math.atan2(cpHomeXZ.z, cpHomeXZ.x));
        region.rotateZ(
          theta - region.rotation.z - region.geometry.parameters.thetaLength / 2
        );
      }
    } else if (cp.material.transparent || !toolHandle.visible) {
      cp.material = cpMat;
      toolHandle.material = handleMat;
      toolHandle.visible = true;
    }

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
      const rightGripCopy = exp.rightGrip.clone();
      trial.rhPos.push(rightGripCopy.getWorldPosition(new Vector3()));
      trial.rhOri.push(rightGripCopy.getWorldQuaternion(new Quaternion()));
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
