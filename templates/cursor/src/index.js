// Third-party imports
import {
  Color,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  Vector2,
  Vector3,
} from 'three';

// Package imports
import {
  Experiment,
  BlockOptions,
  DisplayElement,
  Survey,
  InstructionsPanel,
} from 'ouvrai';

/**
 * Main function contains all experiment logic. At a minimum you should:
 * 1. Create a `new Experiment({...config})`
 * 2. Initialize the state machine with `exp.state.init(states, changeFunc)`
 * 3. Create stimuli and add them to the three.js scene: `exp.sceneManager.scene`
 * 4. Create trial sequence with `exp.createTrialSequence([...blocks])`
 * 5. Start the main experiment loop with `exp.start(calcFunc, stateFunc, displayFunc)`
 * 6. Create your experiment flow by editing `calcFunc`, `stateFunc`, and `displayFunc`.
 */
async function main() {
  // Configure your experiment
  const exp = new Experiment({
    // Debug mode?
    debug: true,

    // Platform settings
    requireDesktop: true,
    requireChrome: false,

    // Three.js settings
    orthographic: true,
    cssScene: true,
    orbitControls: false,

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
   * Finite State Machine manages the flow of your experiment.
   * Define states here. Define behavior & transitions in stateFunc().
   */
  exp.cfg.stateNames = [
    'BROWSER',
    'CONSENT',
    'SIGNIN',
    // Begin customizable states
    'SETUP',
    'START',
    'DELAY',
    'GO',
    'MOVING',
    'RETURN',
    'FINISH',
    'ADVANCE',
    // End customizable states
    'SURVEY',
    'CODE',
    'FULLSCREEN',
    'POINTERLOCK',
    'DBCONNECT',
    'ATTENTION',
    'BLOCKED',
  ];

  // Initialize the state machine
  exp.state.init(exp.cfg.stateNames, handleStateChange);

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
  ];

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
  const home = new Mesh(
    new SphereGeometry(exp.cfg.homeRadius),
    new MeshStandardMaterial() // set color dynamically in displayFunc()
  );
  const cursor = new Mesh(
    new SphereGeometry(exp.cfg.cursorRadius),
    new MeshStandardMaterial({ color: 'white' })
  );
  cursor.position.setZ(exp.cfg.homeRadius + exp.cfg.cursorRadius);
  const target = new Mesh(
    new SphereGeometry(exp.cfg.targetRadius),
    new MeshStandardMaterial({ color: 'orangered' })
  );
  target.visible = false;
  exp.sceneManager.scene.add(home, cursor, target);

  /**
   * Create trial sequence (exp.trials) from array of block objects
   */
  exp.createTrialSequence([
    // The keys of a block object are the variables, the values must be equal-length arrays
    // The combination of elements at index i are the variable values for one trial
    // options is required: create a new BlockOptions object to control sequencing
    {
      targetDirection: [-1, 1],
      options: new BlockOptions({ reps: 10, shuffle: true }),
    },
  ]);

  /**
   * Additional experiment-specific setup
   */

  // Handler for mousemove events - updates cursor position
  document.body.addEventListener('mousemove', handleMouseMove);

  // A survey form for asking questions, displayed at end
  exp.survey = new Survey();

  /**
   * Set up replay machine
   */
  if (exp.replay) {
    document.body.addEventListener('replayinfo', handleReplayInfo);
    document.body.addEventListener('replaytrial', handleReplayTrial);
  }

  /**
   * Debug options
   */
  if (exp.cfg.debug) {
    exp.consented = true; // skip consent in debug
    //exp.fullscreenStates = exp.pointerlockStates = [];
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

  /**
   * Define your procedure as a switch statement implementing a Finite State Machine.
   * Ensure that all states are listed in the array given to the constructor.
   * @method `exp.state.next(state)` Transitions to new state on next loop.
   * @method `exp.state.once(function)` Runs function one time on entering state.
   */
  function stateFunc() {
    // Process interrupt flags (database, fullscreen, pointerlock)
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
        target.position.setY(exp.cfg.targetDistance * trial.targetDirection);
        exp.state.next('START');
        break;

      case 'START':
        if (cursor.atHome) {
          exp.state.next('DELAY');
        }
        break;

      case 'DELAY':
        if (!cursor.atHome) {
          exp.state.next('START');
        } else if (exp.state.expired(exp.cfg.delayDuration)) {
          exp.state.next('GO');
        }
        break;

      case 'GO':
        exp.state.once(function () {
          target.visible = true;
        });
        handleFrameData();
        if (!cursor.atHome) {
          exp.state.next('MOVING');
        }
        break;

      case 'MOVING':
        handleFrameData();
        if (cursor.atTarget) {
          target.visible = false;
          exp.state.next('RETURN');
        }
        break;

      case 'RETURN':
        handleFrameData();
        if (cursor.atHome) {
          exp.state.next('FINISH');
        }
        break;

      case 'FINISH':
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
          exp.state.next('SETUP');
        } else {
          // NB: Must call exp.complete()
          exp.complete();
          // Clean up
          DisplayElement.hide(exp.sceneManager.renderer.domElement);
          DisplayElement.hide(exp.sceneManager.cssRenderer.domElement);
          exp.fullscreen.exitFullscreen();
          exp.state.next('SURVEY');
        }
        break;

      case 'SURVEY':
        exp.state.once(() => exp.survey?.hidden && exp.survey.show());
        if (!exp.survey || exp.surveysubmitted) {
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
          exp.goodbye.show(); // show the goodbye screen w/ code & prolific link
        });
        break;

      case 'FULLSCREEN':
        exp.state.once(function () {
          exp.blocker.show('fullscreen');
        });
        if (exp.fullscreen.engaged) {
          exp.blocker.hide();
          exp.state.pop();
        }
        break;

      case 'POINTERLOCK':
        exp.state.once(function () {
          exp.blocker.show('pointerlock');
        });
        if (exp.pointerlock.engaged) {
          exp.blocker.hide();
          exp.state.pop();
        }
        break;

      case 'DBCONNECT':
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

  /**
   * Compute and update stimulus and UI presentation.
   */
  function displayFunc() {
    home.material.color = new Color(
      cursor.atHome ? 'hsl(210, 100%, 60%)' : 'hsl(210, 50%, 35%)'
    );
    cursor.visible = exp.state.between('SETUP', 'ADVANCE', true, true);
    exp.replay?.update();
    exp.sceneManager.render();
  }

  /**
   * Event handlers
   */

  // Update the cursor position
  function handleMouseMove(e) {
    if (!cursor.visible || trial.isReplay) return;
    cursor.position.x += (e.movementX * 2) / window.innerHeight;
    cursor.position.y -= (e.movementY * 2) / window.innerHeight;
    cursor.position.clamp(exp.cfg.cursorMinXYZ, exp.cfg.cursorMaxXYZ);
  }

  // Record data on each render frame
  function handleFrameData() {
    trial.t.push(performance.now());
    trial.state.push(exp.state.current);
    // clone or you will get a reference
    trial.posn.push(cursor.position.clone());
  }

  // Record data on each state transition
  function handleStateChange() {
    trial.stateChange?.push(exp.state.current);
    trial.stateChangeTime?.push(performance.now());
  }

  // Subject-specific replay configuration
  function handleReplayInfo(e) {
    exp.replay.avatar = cursor;
    exp.replay.positionDataName = 'posn';
    exp.replay.rotationDataName = false;
    document.body.removeEventListener('mousemove', handleMouseMove);
    let cfg = e.detail;
  }

  // Trial-specific replay configuration
  function handleReplayTrial(e) {
    trial = e.detail;
    trial.isReplay = true;
    exp.state.next(e.detail['state'][0]);
    target.position.setY(exp.cfg.targetDistance * trial.targetDirection);
  }
}

window.addEventListener('DOMContentLoaded', main);
