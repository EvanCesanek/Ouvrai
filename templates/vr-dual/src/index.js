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
} from 'three';
import { Easing, Tween, update as tweenUpdate } from '@tweenjs/tween.js'; // https://github.com/tweenjs/tween.js/

// Package imports
import {
  Experiment,
  BlockOptions,
  DisplayElement,
  MeshFactory,
  Collider,
  InstructionsPanel,
  feedbackShowHide,
  checkAlignment,
  generateDemoReaches,
} from 'ouvrai';

// Static asset imports (https://vitejs.dev/guide/assets.html)
import environmentLightingURL from 'ouvrai/lib/environments/IndoorHDRI003_1K-HDR.exr?url'; // absolute path from ouvrai
import bubbleSoundURL from './bubblePopping.mp3?url'; // relative path from src

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
    maxRotation: 15, // degrees
    handleLength: 0.09,
    controlPointRadius: 0.01,
    targetRadius: 0.02,
    targetDistance: 0.2,
    targetSeparation: 0.16,
    homePosn: new Vector3(0, 0.9, -0.3),

    // Procedure
    numBaselineCycles: 5, //20, // 1 cycle = 1 trial (because 1 target)
    numRampCycles: 5, //80,
    numPlateauCycles: 2, //10,
    numWashoutCycles: 5,
    restDuration: 5, // minimum duration of rest state
    restTrials: [], //[30,70] // rest before which trials?
    startNoFeedbackDuration: 5, // minimum duration of notification state
    startNoFeedbackTrial: 4, // remove feedback before which trial?
    noFeedbackNear: 0.015, // radius beyond which feedback is off
    startDelay: 0.25, // time to remain in start position
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
  // Workspace "root" (helpful for individual height calibration)
  const workspace = new Group();
  exp.sceneManager.scene.add(workspace);
  workspace.position.set(...exp.cfg.homePosn);

  // Home position
  const home = new Group();
  workspace.add(home);
  home.visible = false;

  // Generic home point
  const homecp = MeshFactory.edges({
    geometry: new BoxGeometry(
      exp.cfg.controlPointRadius,
      exp.cfg.controlPointRadius,
      exp.cfg.controlPointRadius,
      1,
      1
    ),
  });
  // cube of edge length 2r "contains" the sphere but looks too big as wireframe
  // cube of edge length 2r/sqrt(3) ~= 1.15 is contained by the sphere
  homecp.scale.setScalar(1.5); // so we pick a size between 1.15 and 2

  // Create tool
  let toolMaterial = new MeshStandardMaterial({
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
    toolMaterial
  );
  // Put the tool in the right hand
  exp.rhObject = toolHandle;
  exp.lhObject; // TODO: left hand not yet supported!
  // cylinder height is along local +Y but controller grip in grip space is along -Z
  // so we rotate cylinder -90 degrees around X to align +Y with -Z
  toolHandle.rotateX(-Math.PI / 2);
  const toolBar = new Mesh(
    new CylinderGeometry(
      exp.cfg.controlPointRadius * 0.99,
      exp.cfg.controlPointRadius,
      exp.cfg.targetSeparation,
      24,
      1,
      true
    ),
    toolMaterial
  );
  // Rotate 90 degrees to get T-shape >> -X along grip, +Y to the right
  toolBar.rotateZ(-Math.PI / 2);
  // Gimbal: Keep toolBar independent of toolHandle to lock x-axis to world space
  exp.sceneManager.scene.add(toolBar);
  // Instead use "dummy" object
  const toolBarDummy = new Object3D();
  // translate up the grip by half the handle length
  toolBarDummy.translateY(exp.cfg.handleLength / 2);
  toolHandle.add(toolBarDummy);

  // Create generic tool control point
  const cp = new Mesh(
    new SphereGeometry(exp.cfg.controlPointRadius, 24, 12),
    new MeshStandardMaterial()
  );
  cp.add(new Collider(new SphereGeometry(exp.cfg.controlPointRadius, 8, 4)));

  // Create generic reach target
  const target = new Mesh(
    new TorusGeometry(exp.cfg.targetRadius, exp.cfg.targetRadius / 10, 8, 24),
    new MeshStandardMaterial('red')
  );
  target.translateZ(-exp.cfg.targetDistance);
  target.visible = false;
  // To test for target hit, fill the ring with a solid invisible object
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

  // Per-target (i.e., per-control point) parameter loop
  exp.cfg.targetIds = [0, 1];
  exp.cfg.targetRotationSigns = [-1, 1];
  exp.cfg.targetColors = [new Color('red'), new Color('blue')];
  const targets = [];
  const controlPoints = [];
  const homePoints = [];
  for (let oi of exp.cfg.targetIds) {
    // Create target material
    let mati = new MeshStandardMaterial({ color: exp.cfg.targetColors[oi] });

    // Create target instance
    let targi = target.clone();
    workspace.add(targi);
    targi.translateX((oi - 0.5) * exp.cfg.targetSeparation);
    targi.material = mati;
    targi.userData.sound = new PositionalAudio(exp.audioListener);
    targi.add(targi.userData.sound);
    targi.hitTween = new Tween(targi)
      .to({ scale: { x: 0, y: 0, z: 0 } }, 220)
      .easing(Easing.Back.InOut)
      .onComplete(function (o) {
        o.visible = false;
        o.scale.setScalar(1);
      });

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
    homecpi.material = new LineBasicMaterial({
      color: exp.cfg.targetColors[oi],
    });
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
  // Clone the tool bar and add it to the cloned dummy object
  const demoToolBar = toolBar.clone(true);
  demoToolBar.material = demoTool.material;
  demoTool.children[0].add(demoToolBar);
  const demoControlPoints = demoToolBar.children;

  // No feedback region
  const region = MeshFactory.noFeedbackZone({
    near: exp.cfg.noFeedbackNear,
    far: exp.cfg.targetDistance,
  });
  region.translateZ(-0.025); // local Z is world Y (vertical)
  workspace.add(region);
  region.visible = false;

  // We use the same sound for both targets
  exp.audioLoader.load(bubbleSoundURL, function (buffer) {
    targets.forEach((o) => o.userData.sound.setBuffer(buffer));
  });

  /**
   * Create trial sequence (exp.trials) from array of block objects
   */
  exp.createTrialSequence([
    // The keys of a block object are the variables, the values must be equal-length arrays
    // The combination of elements at index i are the variable values for one trial
    // options is required: create a new BlockOptions object to control sequencing
    {
      targetId: [...exp.cfg.targetIds],
      // BlockOptions control trial sequencing behavior
      options: new BlockOptions({
        name: 'gradual',
        shuffle: true,
        reps:
          exp.cfg.numBaselineCycles +
          exp.cfg.numRampCycles +
          exp.cfg.numPlateauCycles +
          exp.cfg.numWashoutCycles,
      }),
    },
  ]); // effect: creates exp.trials object array

  // Assign rotation sequence
  const rampDegPerCycle = exp.cfg.maxRotation / exp.cfg.numRampCycles;
  for (let t of exp.trials) {
    if (t.cycle < exp.cfg.numBaselineCycles) {
      t.rotation = 0;
    } else if (t.cycle < exp.cfg.numBaselineCycles + exp.cfg.numRampCycles) {
      t.rotation = (1 + t.cycle - exp.cfg.numBaselineCycles) * rampDegPerCycle;
    } else if (
      t.cycle <
      exp.cfg.numBaselineCycles +
        exp.cfg.numRampCycles +
        exp.cfg.numPlateauCycles
    ) {
      t.rotation = exp.cfg.maxRotation;
    } else {
      t.rotation = 0; // washout
    }
  }

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
    let toolPoints =
      exp.state.current === 'DEMO' ? demoControlPoints : controlPoints;

    // Check if control points are in the home positions
    home.check = [];
    for (let oi = 0; oi < 2; oi++) {
      home.check[oi] = checkAlignment({
        o1: homePoints[oi],
        o2: toolPoints[oi],
        angleThresh: false,
      });
    }
    home.atHome = home.check.every((x) => x);
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
            instructions: `Welcome! You may sit or stand.\n\
            You will be reaching out quickly with your right hand, \
            so please make sure the area in front of you is clear.`,
            interactive: true,
            backButtonState: 'disabled',
            nextButtonState: 'idle',
          });
        });
        if (exp.VRUI.clickedNext) exp.state.next('CALIBRATE');
        break;

      case 'CALIBRATE':
        exp.state.once(function () {
          exp.VRUI.edit({
            title: 'Calibrate',
            instructions: `Please calibrate your chest height.\n\
            Hold the controller near your chest and press the trigger.`,
            interactive: false,
            buttons: false,
          });
        });
        if (exp.ray.userData.isSelecting) {
          let adjustHeight = toolBar.getWorldPosition(new Vector3()).y - 0.05;
          exp.grip.gamepad.hapticActuators?.['0'].pulse(0.6, 80);
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
            instructions: `Please watch the demonstration.\n\
            Can you perform these movements?\n\
            Click Back to change the height.\n\
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
          targets[exp.demoTargetOn].userData.sound.play(); // Auditory and hapic feedback
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
        // Start with a deep copy of the initialized trial from exp.trials
        trial = structuredClone(exp.trials[exp.trialNumber]);
        trial.trialNumber = exp.trialNumber;
        trial.startTime = performance.now();
        // Reset data arrays and other defaults
        trial = { ...trial, ...structuredClone(trialInitialize) };
        // Set trial parameters
        trial.demoTrial =
          exp.trialNumber === 0 || (exp.trialNumber < 4 && exp.repeatDemoTrial);
        trial.noFeedback = trial.trialNumber >= exp.cfg.startNoFeedbackTrial;
        trial.rotation *= exp.cfg.targetRotationSigns[trial.targetId];
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
          target.visible = false;
        });
        // Shorthand for functional if statement
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
          targets.map((x) => (x.visible = false));
          targets[trial.targetId].visible = true;
          // Update origin then radians to reduce/mask blips when rotation changes
          trial.rotationOrigin = home.getWorldPosition(new Vector3());
          //exp.grip?.position.clone() || trial.rotationOrigin;
          trial.rotationRadians = (trial.rotation * Math.PI) / 180;
          exp.state.next('REACH');
        }
        break;

      case 'REACH':
        exp.state.once(function () {
          let col = exp.cfg.targetColors[trial.targetId];
          exp.VRUI.edit({
            title: 'Hit target',
            instructions: trial.demoTrial
              ? `Reach forward so the ${col} end of the tool goes through the ${col} ring.\n\
            Then return to the start.`
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
          exp.grip.gamepad.hapticActuators?.['0'].pulse(0.6, 80);
          exp.state.next('RETURN');
        }
        break;

      case 'RETURN':
        exp.state.once(function () {
          exp.VRUI.edit({ title: 'Go to start' });
          // Show feedback if hidden (forcevisible = true)
          trial.noFeedback && feedbackShowHide(toolHandle, home, region, true);
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
              instructions: `Please avoid curved movements and avoid twisting or rotating the tool.\n\
              There will be two rest breaks.\n\
              To repeat the instructions, click Back.\n\
              If you are ready to start, click Next.`,
              interactive: true,
              backButtonState: 'idle',
              nextButtonState: 'idle',
            });
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
          trial.rotation = false;
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
          // wait until firebase save returns successful
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
            Take a short break to relax your arm. \
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
            instructions: `Can you hit the targets without visual feedback?\n\
            In the gray area, the tool disappears. A black ring shows your distance.\n\
            Try it out!`,
            backButtonState: 'disabled',
            nextButtonState: 'idle',
          });
          trial.noFeedback = true; // for convenience - we've already saved this trial
          region.visible = true; // show the no-feedback zone
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
            title: 'Network disconnected!',
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
    for (let oi = 0; oi < 2; oi++) {
      // set color and tween based on alignment
      if (home.check[oi]) {
        homePoints[oi].material.color = new Color('black');
        homePoints[oi].pulseTween.stop();
      } else {
        homePoints[oi].material.color = exp.cfg.targetColors[oi];
        homePoints[oi].pulseTween.start();
      }
    }

    // Hide feedback in the no-feedback region
    if (
      trial.noFeedback &&
      ['START', 'DELAY', 'REACH', 'REST', 'STARTNOFEEDBACK'].includes(
        exp.state.current
      )
    )
      feedbackShowHide(toolHandle, home, region);

    // Visuomotor rotation
    if (exp.grip && trial.rotationOrigin && trial.rotation !== 0) {
      let x = exp.grip.position.clone(); // get grip position (world)
      x.sub(trial.rotationOrigin); // subtract origin (world)
      x.applyAxisAngle(new Vector3(0, 1, 0), trial.rotationRadians); // rotate around world up
      x.add(trial.rotationOrigin); // add back origin
      exp.grip.worldToLocal(x); // convert to grip space
      toolHandle.position.copy(x); // set as tool position
    }

    // Gimbal
    toolBar.visible = toolHandle.visible; // toolBar not a child so set visibility manually
    toolBarDummy.getWorldPosition(toolBar.position);

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
