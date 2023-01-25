/*** third-party imports ***/
import { Color, Vector2, Vector3 } from 'three';

/*** weblab imports ***/
import {
  Experiment,
  BlockOptions,
  State,
  DisplayElement,
  Survey,
  MeshFactory,
  InstructionsPanel,
  Replay,
} from 'weblab';

async function main() {
  // The Experiment class handles many things behind the scenes.
  // Instantiate a new Experiment with some configuration options.
  const exp = new Experiment({
    // Enter the name of your experiment (same as weblab new-experiment <name>)
    name: 'minimal',

    // If we are running on the local server, consider it debug mode
    debug: location.hostname === 'localhost',
    replay: true, // enable replay machine

    // Completion code. Replace with your own!
    prolificLink: 'https://app.prolific.co/submissions/complete?cc=WEBLAB',
    code: 'WEBLAB',

    // Set values
    homeRadius: 0.05,

    cursorRadius: 0.02,
    cursorMinXYZ: new Vector3(-1, -1, -5),
    cursorMaxXYZ: new Vector3(1, 1, 5),

    targetRadius: 0.04,
    targetDistance: 0.25,

    delayDuration: 0.5,

    // Scene options
    orthographic: true,
    cssScene: true, // create an additional renderer for a cssScene

    requireDesktop: true,
  });

  // Create finite state machine (experiment flow manager)
  exp.cfg.stateNames = [
    'BROWSER',
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

  // A survey object for demographic data
  const survey = new Survey();

  // Add listeners for default weblab events
  exp.addDefaultEventListeners();

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

  // Create objects and add to scene
  const home = MeshFactory.sphere({ radius: exp.cfg.homeRadius });
  home.position.set(0, 0, 0);
  const cursor = MeshFactory.sphere({ radius: exp.cfg.cursorRadius });
  cursor.position.set(0, 0, exp.cfg.homeRadius + exp.cfg.cursorRadius);
  const target = MeshFactory.sphere({ radius: exp.cfg.targetRadius });
  target.material.color = new Color('orangered');
  target.visible = false;
  exp.sceneManager.scene.add(home, cursor, target);

  // Create trial sequence from array of block objects
  exp.createTrialSequence([
    {
      targetDirection: [-1, 1],
      options: new BlockOptions('train', true, 10),
    },
  ]);

  // Add custom event handlers
  document.body.addEventListener('mousemove', handleMouseMove);

  // Debug options
  if (exp.cfg.debug) {
    exp.consented = false;
    if (exp.cfg.replay) {
      exp.replay = new Replay({
        avatar: cursor,
        positionDataName: 'posn',
        rotationDataName: false,
      });
      exp.fullscreenStates = [];
      exp.pointerlockStates = [];
      document.body.removeEventListener('mousemove', handleMouseMove);
      document.body.addEventListener('replayinfo', handleReplayInfo);
      document.body.addEventListener('replaytrial', handleReplayTrial);
    }
  } else {
    console.log = function () {}; // disable in production
  }

  // Start the render loop
  mainLoopFunc();

  function mainLoopFunc() {
    exp.sceneManager.renderer.setAnimationLoop(mainLoopFunc);
    calcFunc();
    stateFunc();
    displayFunc();
  }

  function calcFunc() {
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
    // Process interrupt flags for database, fullscreen, and pointerlock
    exp.processInterrupts();

    switch (exp.state.current) {
      case exp.state.BLOCKED:
        // dead-end state
        break;

      case exp.state.BROWSER:
        exp.processBrowser();
        break;

      case exp.state.CONSENT:
        exp.state.once(function () {
          exp.consent.show();
        });
        if (exp.consented || exp.cfg.demo) {
          exp.cfg.date = new Date().toISOString();
          exp.cfg.timeOrigin = performance.timeOrigin;
          exp.firebase.signInAnonymously();
          exp.state.next(exp.state.SIGNIN);
        }
        break;

      case exp.state.SIGNIN:
        if (exp.firebase.uid) {
          exp.consent.hide();
          // regular dom elements don't have show() and hide()
          DisplayElement.show(exp.sceneManager.renderer.domElement);
          DisplayElement.show(exp.sceneManager.cssRenderer.domElement);
          DisplayElement.show(document.getElementById('panel-container'));
          exp.state.next(exp.state.SETUP);
        }
        break;

      case exp.state.SETUP:
        // Start with a deep copy of the initialized trial from exp.trials
        trial = structuredClone(exp.trials[exp.trialNumber]);
        trial.trialNumber = exp.trialNumber;
        trial.startTime = performance.now();
        // Reset data arrays and other weblab defaults
        trial = { ...trial, ...structuredClone(trialInitialize) };
        // Set other parameters
        trial.demoTrial =
          exp.trialNumber === 0 || (exp.trialNumber < 6 && exp.repeatDemoTrial);

        // Target position
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
          exp.state.next(exp.state.MOVING); // advance
        }
        break;

      case exp.state.MOVING:
        handleFrameData();
        if (cursor.atTarget) {
          // Animate target hit
          target.visible = false;
          exp.state.next(exp.state.RETURN); // advance
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
          // don't do anything until firebase save returns successful
          break;
        }

        exp.nextTrial();
        if (exp.trialNumber < exp.numTrials) {
          exp.state.next(exp.state.SETUP);
        } else {
          exp.firebase.recordCompletion();
          exp.goodbye.updateGoodbye(exp.cfg.code);
          // remember: threejs canvas doesn't have show() and hide()
          DisplayElement.hide(exp.sceneManager.renderer.domElement);
          DisplayElement.hide(exp.sceneManager.cssRenderer.domElement);
          exp.fullscreen.exitFullscreen();
          exp.state.next(exp.state.SURVEY);
        }
        break;

      case exp.state.SURVEY:
        exp.state.once(function () {
          survey.show();
        });
        if (exp.surveysubmitted) {
          // we save the config object
          exp.cfg.trialNumber = 'info';
          exp.firebase.saveTrial(exp.cfg);
          survey.hide();
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
    trial.posn.push(cursor.position.clone());
  }

  // Recording data on each state transition
  function handleStateChange() {
    if (trial.stateChange) {
      trial.stateChange.push(exp.state.current);
      trial.stateChangeTime.push(performance.now());
    }
  }

  function handleReplayInfo() {
    // Do any subject-specific scene configuration (see stateFunc)
    // arg1.detail is the subject's 'info' trial (exp.cfg)
  }

  function handleReplayTrial(e) {
    trial = e.detail;
    trial.isReplay = true;
    exp.state.next(e.detail['state'][0]);
    // Do any trial-specific configuration
    target.position.setY(exp.cfg.targetDistance * trial.targetDirection);
  }
}

window.addEventListener('DOMContentLoaded', main);
