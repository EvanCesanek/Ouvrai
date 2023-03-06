// Third-party imports
import {
  Color,
  LineBasicMaterial,
  Vector3,
  PositionalAudio,
  AudioLoader,
  Clock,
  Group,
  BoxGeometry,
  MeshStandardMaterial,
  SphereGeometry,
} from 'three';
import { Easing, Tween, update as tweenUpdate } from '@tweenjs/tween.js'; // https://github.com/tweenjs/tween.js/
import ThreeMeshUI from 'three-mesh-ui';

// Package imports
import {
  Experiment,
  BlockOptions,
  State,
  DisplayElement,
  MeshFactory,
  XRInterface,
  Collider,
  XRVisor,
  InstructionsPanel,
  Replay,
} from 'weblab';
import { checkAlignment, feedbackShowHide } from 'weblab/lib/components/utils';

// Static asset imports (https://vitejs.dev/guide/assets.html)
import environmentLightingURL from 'weblab/lib/environments/IndoorHDRI003_1K-HDR.exr?url';
import bubbleSoundURL from './bubblePopping.mp3?url';

/**
 * Main function contains all experiment code
 */
async function main() {
  /**
   * The Experiment class handles most things behind the scenes.
   * Instantiate a new Experiment with some configuration options.
   */
  const exp = new Experiment({
    // Debug mode switch, specify debug behavior below
    debug:
      true &&
      (location.hostname === 'localhost' || location.hostname === '127.0.0.1'),
    replay: true, // enable replay machine, requires debug mode

    // Platform settings
    requireVR: true,
    consentPath: 'consent.jpg', // need to specify jpg for VR browsers

    // Three.js settings
    environmentLighting: environmentLightingURL,
    orbitControls: true,
    gridRoom: true,
    audio: true,

    // Scene quantities
    // Assume meters and seconds for three.js, but note tween.js uses milliseconds
    rotation: 15, // max, degrees
    handleLength: 0.09,
    controlPointRadius: 0.01,
    targetRadius: 0.02,
    targetDistance: 0.2,
    homePosn: new Vector3(0, 0.9, -0.3),

    // Procedure
    numBaselineCycles: 1, //20, // 1 cycle = 1 trial (because 1 target)
    numPositiveCycles: 1, //80,
    numNegativeCycles: 1, //10,
    numClampCycles: 5,
    restDuration: 2, // minimum duration of rest state
    restTrials: [], //[30,70] // rest before which trials?
    startNoFeedbackDuration: 2, // minimum duration of notification state
    startNoFeedbackTrial: 10, // remove feeback on which trial?
    noFeedbackNear: 0.015, // radius beyond which feedback is off
    startDelay: 0.25, // time to remain in start position
  });

  /**
   * Finite State Machine
   * Manages the flow of your experiment
   * Define states here, define behavior & transitions in stateFunc()
   */
  exp.cfg.stateNames = [
    // Begin required states
    'BROWSER', // First = Entry point
    'CONSENT',
    'SIGNIN',
    'WELCOME',
    'CALIBRATE',
    'CONFIRM',
    // End required states
    // Begin customizable states
    'SETUP',
    'START',
    'DELAY',
    'REACH',
    'RETURN',
    'FINISH',
    // End customizable states
    // Begin required states
    'ADVANCE',
    'REST',
    'STARTNOFEEDBACK',
    'RESUME',
    'SURVEY',
    'CODE',
    'CONTROLLER',
    'DBCONNECT',
    'BLOCKED',
    // End required states
  ];
  exp.state = new State(exp.cfg.stateNames, handleStateChange);

  // Add default event handlers
  exp.addDefaultEventListeners();

  // Add custom event handlers and other setup
  await exp.initVR({}); // Initialize VR

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
   * User Interface
   * (menus in VR)
   */

  const UI = new XRInterface();
  exp.UI = UI;
  exp.sceneManager.scene.add(UI);
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
  exp.sceneManager.camera.add(visor);

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
    material: new LineBasicMaterial({ color: 'orangered' }),
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
  let toolMaterial = new MeshStandardMaterial({
    color: 'slategray',
    roughness: 0.7,
    metalness: 1,
  });
  const toolHandle = MeshFactory.cylinder({
    radius: exp.cfg.controlPointRadius,
    height: exp.cfg.handleLength,
    material: toolMaterial,
    radialSegments: 24,
  });
  // cylinders in world space are oriented along +Y
  // but grip in grip space is oriented along -Z
  // rotate cylinder -90deg around X so +Y moves along the grip
  toolHandle.rotateX(-Math.PI / 2);
  exp.rhObject = toolHandle; // IMPORTANT: Indicates that this should be in the grip!
  const cp = MeshFactory.sphere({
    radius: exp.cfg.controlPointRadius,
  });
  cp.material.color = new Color('green');
  cp.translateY(exp.cfg.handleLength / 2);
  toolHandle.add(cp);
  cp.add(new Collider(new SphereGeometry(exp.cfg.controlPointRadius, 8, 4)));

  // Target ring
  const targ = MeshFactory.torus({
    majorRadius: exp.cfg.targetRadius,
    minorRadius: exp.cfg.targetRadius * 0.1,
    radialSegments: 8,
    tubularSegments: 24,
  });
  targ.translateZ(-exp.cfg.targetDistance);
  targ.hitTween = new Tween(targ)
    .to({ scale: { x: 0, y: 0, z: 0 } }, 220)
    .easing(Easing.Back.InOut)
    .onComplete(function (o) {
      o.visible = false;
      o.scale.setScalar(1);
    })
    .start();
  workspace.add(targ);
  const targCenter = MeshFactory.cylinder({
    radius: exp.cfg.targetRadius - exp.cfg.controlPointRadius,
    height: exp.cfg.targetRadius * 0.1,
    openEnded: false,
  });
  targCenter.visible = false;
  targCenter.rotateX(-Math.PI / 2);
  targ.add(targCenter); // targCenter MUST be first child or collision will break
  targ.userData.sound = new PositionalAudio(exp.audioListener);
  targ.add(targ.userData.sound);

  // Tool avatar for demonstration
  const demo = new Group();
  workspace.add(demo);
  demo.visible = false;
  const demoTool = toolHandle.clone(true);
  demo.add(demoTool);
  // Angled slightly
  demoTool.rotateX(Math.PI / 2 - Math.PI / 6);
  demoTool.material = new MeshStandardMaterial({
    color: '#1c2a29',
    roughness: 1,
    metalness: 1,
  });
  const democp = demoTool.children[0];

  // No feedback region
  const region = MeshFactory.noFeedbackZone({
    near: exp.cfg.noFeedbackNear,
    far: exp.cfg.targetDistance,
  });
  workspace.add(region);
  region.translateZ(-0.025); // lower it a bit
  region.visible = false;

  /**
   * Audio
   */

  // Asynchronous audio loader, use callback to store sound
  const audioLoader = new AudioLoader();
  audioLoader.load(bubbleSoundURL, function (buffer) {
    targ.userData.sound.setBuffer(buffer);
  });

  /**
   * Trial procedure
   * Create trial sequence (exp.trials) from array of block objects
   */
  exp.createTrialSequence([
    // The keys of a block object are the variables, the values must be equal-length arrays
    // The combination of elements at index i are the variable values for one trial
    // options is required: create a new BlockOptions object to control sequencing
    {
      rotation: [0],
      options: new BlockOptions({
        name: 'P0',
        reps: exp.cfg.numBaselineCycles,
      }),
    },
    {
      rotation: [exp.cfg.rotation],
      options: new BlockOptions({
        name: 'P+',
        reps: exp.cfg.numPositiveCycles,
      }),
    },
    {
      rotation: [-exp.cfg.rotation],
      options: new BlockOptions({
        name: 'P-',
        reps: exp.cfg.numNegativeCycles,
      }),
    },
    {
      rotation: [0],
      errorClamp: [true],
      options: new BlockOptions({ name: 'EC', reps: exp.cfg.numClampCycles }),
    },
  ]);

  // Debug options
  if (exp.cfg.debug) {
    exp.consented = true; // skip consent in debug
    if (exp.cfg.replay) {
      exp.replay = new Replay({});
      exp.replay.avatar.add(toolHandle);
      exp.sceneManager.scene.add(exp.replay.avatar);
      document.body.addEventListener('replayinfo', handleReplayInfo);
      document.body.addEventListener('replaytrial', handleReplayTrial);
    }
  } else {
    console.log = function () {}; // disable console logs in production
    console.warn = function () {}; // disable console logs in production
  }

  // Start the main loop
  mainLoopFunc();

  /**
   * Main Loop
   * Three sequential functions (calc > state > display)
   * Runs at device refresh rate
   */
  function mainLoopFunc() {
    exp.sceneManager.renderer.setAnimationLoop(mainLoopFunc);
    calcFunc();
    stateFunc();
    displayFunc();
  }

  /**
   * Use calcFunc for any calculations that you will need to
   * reference in _multiple_ states of stateFunc
   */
  function calcFunc() {
    // Player or demo avatar in control?
    let toolcp = exp.state.current === exp.state.CONFIRM ? democp : cp;

    // Set atHome flag on home (not the tool or the avatar tool)
    home.atHome = checkAlignment({
      o1: home,
      o2: toolcp,
      angleThresh: false,
    });
  }

  /**
   * Use stateFunc to manage the flow of your experiment. Ensure that all states are listed in the array given to the constructor.
   * @ `exp.state.next(<state>)` transitions to new state on next loop.
   * @ `exp.state.once(<function>)` runs functin only once on entering state.
   */
  function stateFunc() {
    // Process interrupt flags (database, controllers)
    exp.processInterrupts();

    switch (exp.state.current) {
      case exp.state.BLOCKED:
        break;

      case exp.state.BROWSER:
        exp.processBrowser();
        break;

      case exp.state.CONSENT:
        exp.processConsent();
        break;

      case exp.state.SIGNIN:
        exp.processSignIn();
        break;

      case exp.state.WELCOME:
        exp.state.once(function () {
          UI.edit({
            title: 'Instructions',
            instructions: `Welcome! You may sit or stand.\n\
            You will be reaching out quickly with your right hand, \
            so please make sure the area in front of you is clear.`,
            interactive: true,
            backButtonState: 'disabled',
            nextButtonState: 'idle',
          });
        });
        if (exp.proceed) {
          exp.state.next(exp.state.CALIBRATE);
        }
        break;

      case exp.state.CALIBRATE:
        exp.state.once(function () {
          UI.edit({
            title: 'Calibrate',
            instructions: `Please calibrate your chest height.\n\
            Hold the controller against your chest and press the trigger.`,
            interactive: false,
            buttons: false,
            //backButtonState: 'disabled',
            //nextButtonState: 'disabled',
          });
        });
        if (exp.ray.userData.isSelecting) {
          let adjustHeight = cp.getWorldPosition(new Vector3()).y - 0.05;
          if (exp.cfg.supportHaptic) {
            exp.grip.gamepad.hapticActuators[0].pulse(0.6, 80);
          }
          workspace.position.setY(adjustHeight);
          exp.cfg.homePosn.y = adjustHeight;
          exp.state.next(exp.state.CONFIRM);
        }
        break;

      case exp.state.CONFIRM:
        exp.state.once(function () {
          UI.edit({
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
          // Align the avatar control point with the home position
          demo.position.add(
            new Vector3().subVectors(
              home.getWorldPosition(new Vector3()),
              democp.getWorldPosition(new Vector3())
            )
          );
          if (!demo.demoTween?.isPlaying()) {
            demo.demoTween = generateDemoTween({
              object: demo,
              maxAngle: Math.PI / 32,
              dist: exp.cfg.targetDistance * 1.2,
              duration: 750,
            });
          }
          demo.demoTween.start();
        });

        // Reset the demo when avatar returns to home posn
        if (home.atHome && !exp.demoTargetOn) {
          exp.demoTargetOn = true;
          targ.visible = true;
        }

        if (exp.demoTargetOn && democp.collider.test(targ.children[0])) {
          // Auditory and hapic feedback
          targ.userData.sound.play();
          // Animate target hit
          targ.hitTween.start();
          // Prime for reset
          exp.demoTargetOn = false;
        }

        if (exp.proceed) {
          demo.demoTween.stop();
          demo.visible = false;
          exp.state.next(exp.state.SETUP);
        } else if (exp.goBack) {
          demo.demoTween.stop();
          demo.visible = false;
          exp.state.next(exp.state.CALIBRATE);
        }
        break;

      case exp.state.SETUP:
        // Start with a deep copy of the initialized trial from exp.trials
        trial = structuredClone(exp.trials[exp.trialNumber]);
        trial.trialNumber = exp.trialNumber;
        trial.startTime = performance.now();

        // Reset data arrays and other defaults
        trial = { ...trial, ...structuredClone(trialInitialize) };

        // Set trial parameters
        trial.demoTrial =
          exp.trialNumber === 0 || (exp.trialNumber < 6 && exp.repeatDemoTrial);
        trial.noFeedback = trial.trialNumber >= exp.cfg.startNoFeedbackTrial;

        exp.state.next(exp.state.START);
        break;

      case exp.state.START:
        exp.state.once(function () {
          UI.edit({
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
          targ.visible = false;
        });

        // Shorthand for functional if statements
        trial.noFeedback && feedbackShowHide(toolHandle, home, region);
        home.atHome && exp.state.next(exp.state.DELAY);

        break; //

      case exp.state.DELAY:
        exp.state.once(function () {
          // clear frame data from possible prior visits to DELAY
          trial.t = [];
          trial.state = [];
          trial.rhPos = [];
          trial.rhOri = [];
        });

        handleFrameData();

        trial.noFeedback && feedbackShowHide(toolHandle, home, region);

        if (!home.atHome) {
          exp.state.next(exp.state.START);
        } else if (exp.state.expired(exp.cfg.startDelay)) {
          targ.visible = true;
          // Update origin then radians to reduce/mask blips when rotation changes
          trial.rotationOrigin =
            trial.rotationOrigin || home.getWorldPosition(new Vector3());
          //exp.grip?.position.clone() || trial.rotationOrigin;
          trial.rotationRadians = (trial.rotation * Math.PI) / 180;

          exp.state.next(exp.state.REACH);
        }
        break;

      case exp.state.REACH:
        exp.state.once(function () {
          UI.edit({
            title: 'Hit target',
            instructions: trial.demoTrial
              ? `Reach forward so the end of the tool goes through the ring.\n\
            Then return to the start.`
              : false,
          });
        });

        handleFrameData();

        trial.noFeedback && feedbackShowHide(toolHandle, home, region);

        // Check for target hit
        if (cp.collider.test(targ.children[0])) {
          // Visual, auditory, and haptic feedback of hit
          targ.hitTween.start();
          targ.userData.sound.play();
          if (exp.cfg.supportHaptic) {
            exp.grip.gamepad.hapticActuators[0].pulse(0.6, 80);
          }
          // Show feedback if hidden (forcevisible = true)
          trial.noFeedback && feedbackShowHide(toolHandle, home, region, true);
          exp.state.next(exp.state.RETURN);
        }
        break;

      case exp.state.RETURN:
        exp.state.once(function () {
          UI.edit({ title: 'Go to start' });
        });

        // Time limit avoids excessive data if they don't go directly home
        !exp.state.expired(2) && handleFrameData();

        home.atHome && exp.state.next(exp.state.FINISH);
        break;

      case exp.state.FINISH:
        exp.state.once(function () {
          trial.demoTrial &&
            UI.edit({
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
          if (exp.proceed) {
            exp.repeatDemoTrial = false;
          } else if (exp.goBack) {
            exp.repeatDemoTrial = true;
          } else {
            break;
          }
        }

        exp.firebase.saveTrial(trial);
        exp.state.next(exp.state.ADVANCE);
        break;

      case exp.state.ADVANCE:
        if (!exp.firebase.saveSuccessful) {
          // wait until firebase save returns successful
          break;
        }

        exp.nextTrial();
        UI.updateProgressBar(exp.trialNumber, exp.numTrials);

        if (exp.trialNumber < exp.numTrials) {
          // Many possible next states for different trial types
          if (exp.cfg.restTrials?.includes(exp.trialNumber)) {
            exp.state.next(exp.state.REST);
            UI.countdown(exp.cfg.restDuration); // start countdown *before new state*
          } else if (exp.trialNumber === exp.cfg.startNoFeedbackTrial) {
            exp.state.next(exp.state.STARTNOFEEDBACK);
            UI.countdown(exp.cfg.startNoFeedbackDuration); // start countdown *before new state*
          } else if (exp.repeatDemoTrial) {
            exp.state.next(exp.state.WELCOME);
          } else {
            exp.state.next(exp.state.SETUP);
          }
        } else {
          exp.firebase.recordCompletion();
          exp.goodbye.updateGoodbye(exp.firebase.uid);
          DisplayElement.hide(exp.sceneManager.renderer.domElement);
          home.visible = false;
          exp.state.next(exp.state.SURVEY);
        }
        break;

      case exp.state.SURVEY:
        exp.state.once(() => exp.survey?.hidden && exp.survey.show());

        if (!exp.survey || exp.surveysubmitted) {
          exp.survey?.hide();
          exp.cfg.trialNumber = 'info';
          exp.firebase.saveTrial(exp.cfg);
          exp.state.next(exp.state.CODE);
        }
        break;

      case exp.state.CODE: {
        if (!exp.firebase.saveSuccessful) {
          // wait until firebase save returns successful
          break;
        }
        exp.state.once(function () {
          exp.goodbye.show(); // show the goodbye screen
          UI.edit({
            title: 'Complete',
            instructions:
              'Thank you. Exit VR to find the submission link on the study web page.',
            interactive: true,
            backButtonState: 'disabled',
            nextButtonState: 'idle',
            nextButtonText: 'Exit',
          });
        });
        if (exp.proceed) {
          // manual debounce because handleStateChange is not called
          exp.proceed = false;
          exp.xrSession.end();
        }
        break;
      }

      case exp.state.REST:
        exp.state.once(function () {
          UI.edit({
            title: 'Rest break',
            instructions: `Good work! \
            Take a short break to relax your arm. \
            Do not exit or remove your headset.`,
            backButtonState: 'disabled',
            nextButtonState: 'idle',
          });
          trial.rotation = 0; // shut off the rotation
        });

        trial.noFeedback && feedbackShowHide(toolHandle, home, region);

        if (exp.proceed) {
          // Hide UI
          UI.edit({
            interactive: false,
            buttons: false,
            instructions: false,
          });
          exp.state.next(exp.state.SETUP);
        }
        break;

      case exp.state.STARTNOFEEDBACK:
        exp.state.once(function () {
          UI.edit({
            title: 'Challenge',
            instructions: `Can you hit the targets without visual feedback?\n\
            In the gray area, the tool disappears. A black ring shows your distance.\n\
            Try it out!`,
            backButtonState: 'disabled',
            nextButtonState: 'idle',
          });
          region.visible = true; // show the no-feedback zone
        });

        feedbackShowHide(toolHandle, home, region);

        if (exp.proceed) {
          // Hide UI
          UI.edit({
            interactive: false,
            buttons: false,
            instructions: false,
          });
          exp.state.next(exp.state.SETUP);
        }
        break;

      case exp.state.CONTROLLER: {
        exp.state.once(function () {
          // Ok to put down controller during rest
          if (exp.state.last !== exp.state.REST) {
            UI.edit({
              title: 'Controller',
              instructions: 'Please connect right hand controller.',
            });
          }
        });
        if (exp.ray && exp.grip) {
          exp.state.pop();
        }
        break;
      }

      case exp.state.DBCONNECT: {
        exp.state.once(function () {
          exp.blocker.show('connection');
          visor.text.set({
            content: 'Network disconnected.\nReconnect to resume.',
          });
        });
        if (exp.firebase.databaseConnected) {
          exp.blocker.hide();
          exp.state.pop();
          visor.text.set({ content: '' });
        }
        break;
      }
    }
  }

  function displayFunc() {
    // Set home color and pulse animation
    if (home.atHome) {
      home.material.color = new Color('black');
      home.pulseTween.stop();
    } else {
      home.material.color = new Color('orangered');
      home.pulseTween.start();
    }

    // Compute rotation
    if (
      exp.grip &&
      trial.rotationOrigin &&
      trial.rotation !== 0 &&
      !trial.errorClamp
    ) {
      let x = exp.grip.position.clone(); // get grip position (workspace)
      x.sub(trial.rotationOrigin); // subtract origin position (workspace)
      x.applyAxisAngle(new Vector3(0, 1, 0), trial.rotationRadians); // rotate around world up
      x.add(trial.rotationOrigin); // add back origin
      exp.grip.worldToLocal(x); // convert to grip space
      toolHandle.position.copy(x); // set as tool position
    }

    // Compute error clamp
    if (
      exp.grip &&
      home.isObject3D &&
      trial.errorClamp &&
      exp.state.current !== exp.state.CODE
    ) {
      // Rotational error clamp:
      // home.pxz = home.pxz || home.getWorldPosition(new Vector3()).setY(0); // home xz (world)
      // let pxz = toolHandle.getWorldPosition(new Vector3()).setY(0); // tool xz (world)
      // let d = pxz.distanceTo(home.pxz); // distance in the xz plane
      // let hw = home.getWorldPosition(new Vector3()); // start from home (world)
      // hw = hw.add(new Vector3(0, exp.grip.position.y, d)); // clamp x, preserve y, extend out by d
      // exp.grip.worldToLocal(hw); // convert to grip space
      // toolHandle.position.copy(hw); // set as tool position

      // Strictly lateral error clamp
      toolHandle.position.set(
        ...exp.grip.worldToLocal(exp.grip.position.clone().setX(0))
      );
    }

    exp.replay?.update();
    tweenUpdate();
    ThreeMeshUI.update();
    UI.updateButtons();
    exp.sceneManager.render();
  }

  // Custom event handlers
  // Recording data on each render frame
  function handleFrameData() {
    if (exp.grip) {
      trial.t.push(performance.now());
      trial.state.push(exp.state.current);
      // remember to clone kinematic data to get snapshots
      trial.rhPos.push(exp.grip.position.clone());
      trial.rhOri.push(exp.grip.rotation.clone());
    }
  }

  // Recording data on each state transition
  function handleStateChange() {
    trial.stateChange?.push(exp.state.current);
    trial.stateChangeTime?.push(performance.now());
    // Head data at state changes only (see handleFrameData)
    trial.stateChangeHeadPos?.push(exp.sceneManager.camera.position.clone());
    trial.stateChangeHeadOri?.push(exp.sceneManager.camera.rotation.clone());
    // Reset flags related to UI buttons
    exp.proceed = false;
    exp.goBack = false;
  }

  function handleReplayInfo(e) {
    // Do any subject-specific scene configuration (see stateFunc)
    // e.detail is the subject's 'info' (exp.cfg)
    workspace.position.setY(e.detail.homePosn.y);
    home.visible = true;
    toolHandle.visible = true;
    exp.grip = exp.replay.avatar;
  }

  function handleReplayTrial(e) {
    trial = e.detail;
    trial.isReplay = true;
    exp.state.next(e.detail['state'][0]);
    console.log('handleReplayTrial', e);
    // Do any trial-specific scene configuration
  }

  function generateDemoTween({
    object,
    maxAngle,
    dist,
    duration,
    easing = Easing.Quadratic.InOut,
    yoyo = true,
    reps = 1,
    recursive = true,
  }) {
    // Randomly sample vector from spherical cap
    // See: https://stackoverflow.com/questions/38997302/
    let dz = Math.cos(maxAngle) + Math.random() * (1 - Math.cos(maxAngle));
    let phi = Math.random() * 2 * Math.PI;
    let dx = Math.sqrt(1 - dz ** 2) * Math.cos(phi);
    let dy = Math.sqrt(1 - dz ** 2) * Math.sin(phi);
    let end = object.position
      .clone()
      .add(new Vector3(dx, dy, -dz).multiplyScalar(dist));

    // let dir = (Math.random() - 0.5) * maxAngle;
    // let dz = -Math.cos(dir) * dist * 1.2;
    // let dx = Math.sin(dir) * dist * 1.2;
    // let dy = (Math.random() - 0.5) * 0.03;
    // let end = object.position.clone().add(new Vector3(dx, dy, dz));
    let tween = new Tween(object.position)
      .to({ ...end }, duration)
      .delay(800)
      .repeat(reps)
      .repeatDelay(duration / 8)
      .yoyo(yoyo)
      .easing(easing);

    // recursive allows each rep to differ slightly
    if (recursive) {
      tween.onComplete(
        () =>
          (object.demoTween = generateDemoTween({
            object: object,
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
}

window.addEventListener('DOMContentLoaded', main);
