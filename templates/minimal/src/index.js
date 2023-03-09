// Third-party imports
import { Color, Vector2, Vector3 } from 'three';

// Package imports
import {
  Experiment,
  BlockOptions,
  State,
  DisplayElement,
  Survey,
  MeshFactory,
  InstructionsPanel,
  Replay,
} from 'ouvrai';

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
    debug: true && import.meta.env.DEV,
    replay: true, // enable replay machine, requires debug mode

    //Platform settings
    requireDesktop: true,
    requireChrome: false,

    // Three.js settings
    orthographic: true, // for simple 2D scenes
    cssScene: true, // create an additional renderer for a cssScene

    // Scene quantities
    // Assume meters and seconds for three.js, but note tween.js uses milliseconds
    cursorRadius: 0.02,
    cursorMinXYZ: new Vector3(-1, -1, -5),
    cursorMaxXYZ: new Vector3(1, 1, 5),
    targetRadius: 0.04,
    targetDistance: 0.25,
    homeRadius: 0.05,

    // Procedure
    delayDuration: 0.5,
  });

  /**
   * Finite State Machine
   * Manages the flow of your experiment
   * Define states here, define behavior & transitions in stateFunc()
   */
  exp.cfg.stateNames = [
    'BROWSER', // First = Entry point
    'CONSENT',
    'SIGNIN',
    'SETUP',
    'START',
    'DELAY',
    'GO',
    'MOVING',
    'RETURN',
    'FINISH',
    'ADVANCE',
    'SURVEY',
    'CODE',
    'FULLSCREEN',
    'POINTERLOCK',
    'DBCONNECT',
    'ATTENTION',
    'BLOCKED',
  ];
  exp.state = new State(exp.cfg.stateNames, handleStateChange);
  // In which states do we require FS / PL?
  exp.fullscreenStates = exp.pointerlockStates = [
    'POINTERLOCK',
    'SETUP',
    'START',
    'DELAY',
    'GO',
    'MOVING',
    'RETURN',
    'FINISH',
    'ADVANCE',
  ].map((s) => exp.state[s]);

  // A survey form for asking questions, displayed at end
  exp.survey = new Survey();

  // Add default event handlers
  exp.addDefaultEventListeners();

  // Add custom event handlers and other setup
  document.body.addEventListener('mousemove', handleMouseMove);
  // An instructions panel (HTML so use <br> for newlines)
  exp.instructions = new InstructionsPanel({
    content: `Use the mouse/trackpad to hit the targets.<br />
    Try to hit as many targets as possible!`,
  });

  // Declare trial variables that you want to reset on every trial
  const trialInitialize = {
    // render frames
    t: [],
    state: [],
    posn: [],
    // state change events
    stateChange: [],
    stateChangeTime: [],
  };
  let trial = structuredClone(trialInitialize);

  /**
   * Objects
   */
  const home = MeshFactory.sphere({ radius: exp.cfg.homeRadius });
  home.position.set(0, 0, 0);
  const cursor = MeshFactory.sphere({ radius: exp.cfg.cursorRadius });
  cursor.position.set(0, 0, exp.cfg.homeRadius + exp.cfg.cursorRadius);
  const target = MeshFactory.sphere({ radius: exp.cfg.targetRadius });
  target.material.color = new Color('orangered');
  target.visible = false;
  exp.sceneManager.scene.add(home, cursor, target);

  /**
   * Trial procedure
   * Create trial sequence (exp.trials) from array of block objects
   */
  exp.createTrialSequence([
    // The keys of a block object are the variables, the values must be equal-length arrays
    // The combination of elements at index i are the variable values for one trial
    // options is required: create a new BlockOptions object to control sequencing
    {
      targetDirection: [-1, 1],
      options: new BlockOptions({ name: 'train', reps: 10, shuffle: true }),
    },
  ]);

  // Debug options
  if (exp.cfg.debug) {
    exp.consented = true; // skip consent in debug
    if (exp.cfg.replay) {
      exp.replay = new Replay({
        avatar: cursor,
        positionDataName: 'posn',
        rotationDataName: false,
      });
      // Disable fullscreen & pointer lock
      exp.fullscreenStates = exp.pointerlockStates = [];
      document.body.removeEventListener('mousemove', handleMouseMove);
      document.body.addEventListener('replayinfo', handleReplayInfo);
      document.body.addEventListener('replaytrial', handleReplayTrial);
    }
  } else {
    console.log = function () {}; // disable in production
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
    // Objects are in 3D, but we want to ignore the 3rd dimension
    let cursPosXY = new Vector2(...cursor.position);
    let homePosXY = new Vector2(...home.position);
    let targPosXY = new Vector2(...target.position);
    cursor.atHome =
      cursPosXY.distanceTo(homePosXY) <
      exp.cfg.homeRadius - exp.cfg.cursorRadius;
    cursor.atTarget =
      cursPosXY.distanceTo(targPosXY) <
      exp.cfg.targetRadius - exp.cfg.cursorRadius;
  }

  function stateFunc() {
    // Process interrupt flags (database, fullscreen, pointerlock)
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
        target.position.setY(exp.cfg.targetDistance * trial.targetDirection);

        exp.state.next(exp.state.START);
        break;

      case exp.state.START:
        if (cursor.atHome) {
          exp.state.next(exp.state.DELAY);
        }
        break;

      case exp.state.DELAY:
        if (cursor.atHome) {
          if (exp.state.expired(exp.cfg.delayDuration)) {
            exp.state.next(exp.state.GO);
          }
        } else {
          exp.state.next(exp.state.START);
        }
        break;

      case exp.state.GO:
        exp.state.once(function () {
          target.visible = true;
        });
        handleFrameData();
        if (!cursor.atHome) {
          exp.state.next(exp.state.MOVING);
        }
        break;

      case exp.state.MOVING:
        handleFrameData();
        if (cursor.atTarget) {
          target.visible = false;
          exp.state.next(exp.state.RETURN);
        }
        break;

      case exp.state.RETURN:
        handleFrameData();
        if (cursor.atHome) {
          exp.state.next(exp.state.FINISH); // advance
        }
        break;

      case exp.state.FINISH:
        exp.firebase.saveTrial(trial);
        exp.state.next(exp.state.ADVANCE);
        break;

      case exp.state.ADVANCE:
        if (!exp.firebase.saveSuccessful) {
          // wait until firebase save returns successful
          break;
        }

        exp.nextTrial();
        if (exp.trialNumber < exp.numTrials) {
          exp.state.next(exp.state.SETUP);
        } else {
          exp.firebase.recordCompletion();
          exp.goodbye.updateGoodbye(exp.firebase.uid);
          DisplayElement.hide(exp.sceneManager.renderer.domElement);
          DisplayElement.hide(exp.sceneManager.cssRenderer.domElement);
          exp.fullscreen.exitFullscreen();
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

      case exp.state.CODE:
        if (!exp.firebase.saveSuccessful) {
          break;
        }
        exp.state.once(function () {
          exp.goodbye.show(); // show the goodbye screen w/ code & prolific link
        });
        break;

      case exp.state.FULLSCREEN:
        exp.state.once(function () {
          exp.blocker.show('fullscreen');
        });
        if (exp.fullscreen.engaged) {
          exp.blocker.hide();
          exp.state.pop();
        }
        break;

      case exp.state.POINTERLOCK:
        exp.state.once(function () {
          exp.blocker.show('pointerlock');
        });
        if (exp.pointerlock.engaged) {
          exp.blocker.hide();
          exp.state.pop();
        }
        break;

      case exp.state.DBCONNECT:
        exp.state.once(function () {
          exp.blocker.show('connection');
        });
        if (exp.firebase.databaseConnected) {
          exp.blocker.hide();
          exp.state.pop();
        }
        break;
    }
  }

  function displayFunc() {
    home.material.color = new Color(cursor.atHome ? 'navy' : 'blue');
    cursor.visible =
      exp.state.current >= exp.state.SETUP &&
      exp.state.current <= exp.state.ADVANCE;
    exp.replay?.update();
    exp.sceneManager.render();
  }

  // Custom event handlers
  function handleMouseMove(e) {
    if (!cursor.visible || trial.isReplay) return;
    cursor.position.x += (e.movementX * 2) / window.innerHeight;
    cursor.position.y -= (e.movementY * 2) / window.innerHeight;
    cursor.position.clamp(exp.cfg.cursorMinXYZ, exp.cfg.cursorMaxXYZ);
  }

  // Recording data on each render frame
  function handleFrameData() {
    trial.t.push(performance.now());
    trial.state.push(exp.state.current);
    // remember to clone kinematic data to get snapshots
    trial.posn.push(cursor.position.clone());
  }

  // Recording data on each state transition
  function handleStateChange() {
    trial.stateChange?.push(exp.state.current);
    trial.stateChangeTime?.push(performance.now());
  }

  function handleReplayInfo(e) {
    // Do any subject-specific scene configuration (see stateFunc)
    // e.detail is the subject's 'info' (exp.cfg)
  }

  function handleReplayTrial(e) {
    trial = e.detail;
    trial.isReplay = true;
    exp.state.next(e.detail['state'][0]);
    console.log('handleReplayTrial', e);
    // Do any trial-specific scene configuration
    target.position.setY(exp.cfg.targetDistance * trial.targetDirection);
  }
}

window.addEventListener('DOMContentLoaded', main);
