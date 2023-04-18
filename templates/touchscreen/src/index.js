// Third-party imports
import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import { DragControls } from 'three/examples/jsm/controls/DragControls';
import {
  Body,
  Box,
  Cylinder,
  LockConstraint,
  Plane,
  Quaternion,
  Sphere,
  Vec3,
  World,
} from 'cannon-es';

// Package imports
import {
  Experiment,
  Block,
  DisplayElement,
  InstructionsPanel,
  MeshFactory,
  CSS2D,
  linspace,
  Survey,
} from 'ouvrai';

import targetColorMapURL from 'ouvrai/lib/textures/Terrazzo018_1K-JPG/Terrazzo018_1K_Color.jpg';
import { Tween, update as tweenUpdate } from '@tweenjs/tween.js';

async function main() {
  const exp = new Experiment({
    // Options to make development easier
    devOptions: {
      skipConsent: true,
    },
    backgroundColor: 'royalblue',
    demo: true,

    // Three.js settings
    orthographic: true,
    cssScene: false,

    // Scene quantities
    cursorSize: new Vector3(0.08, 0.14, 0.1),
    targetRadius: 0.05,
    minLaunchVel: 0.1,
    goalRadius: 0.08,
  });

  /*
   * Initialize visual stimuli with three.js
   */

  let instructions = new CSS2D('Fling the pink cuboid at the spheres', {
    color: 'white',
  });
  instructions.object.position.setY(-0.75);
  exp.sceneManager.cssScene?.add(instructions.object);

  // Create a "physics world"
  exp.sceneManager.physicsWorld = new World({ gravity: new Vec3(0, 0, -1) });

  // Cursor
  const cursor = new Mesh(
    new BoxGeometry(...exp.cfg.cursorSize),
    new MeshBasicMaterial({ color: 'hotpink' })
  );
  cursor.position.y = -0.5;
  let wireframe = MeshFactory.edges({
    geometry: cursor.geometry,
    color: 'black',
  });
  cursor.add(wireframe);
  exp.sceneManager.scene.add(cursor);
  // Add the cursor to the physics world
  let cursorBody = new Body({
    mass: 1,
    shape: new Box(exp.cfg.cursorSize.clone().multiplyScalar(0.5)),
    linearFactor: new Vec3(1, 1, 0),
    linearDamping: 0.1,
    angularDamping: 0.1,
  });
  cursorBody.position.copy(cursor.position);
  exp.sceneManager.physicsWorld.addBody(cursorBody);

  // We use a dummy object to grab the cursor
  const joint = new Mesh(cursor.geometry.clone());
  joint.position.copy(cursor.position);
  joint.visible = false; // still eligible for DragControls
  exp.sceneManager.scene.add(joint);
  // This rigid body will constrain the cursor
  let jointBody = new Body({
    shape: new Box(exp.cfg.cursorSize.clone().multiplyScalar(0.5)),
    type: Body.STATIC,
    linearFactor: new Vec3(1, 1, 0),
    collisionFilterGroup: 0,
    collisionFilterMask: 0,
  });
  jointBody.position.copy(joint.position);
  let jointConstraint = new LockConstraint(cursorBody, jointBody);
  exp.sceneManager.physicsWorld.addBody(jointBody);

  // Target objects
  const target = new Mesh(
    new SphereGeometry(exp.cfg.targetRadius, 16, 8),
    new MeshStandardMaterial()
  );
  exp.sceneManager.pbrMapper.applyNewTexture(
    [target],
    'terrazzo',
    [targetColorMapURL],
    { xRepeatTimes: 0.5, yRepeatTimes: 0.5 }
  );
  // Store references in arrays
  let targets = [];
  let targetBodies = [];
  exp.cfg.targetPosns = [];
  // 6-ball billiards rack
  let xpos = [-1, 0, 1, -0.5, 0.5, 0];
  let ypos = [0.867, 0.867, 0.867, 0, 0, -0.867];
  for (let ti = 0; ti < 6; ti++) {
    // Create an instance of the Mesh
    let t = target.clone();
    let posn = new Vector3(xpos[ti], ypos[ti], 0)
      .multiplyScalar(2 * exp.cfg.targetRadius)
      .add(new Vector3(0, 0.0, 0));
    exp.cfg.targetPosns.push(posn);
    t.position.set(...posn);
    exp.sceneManager.scene.add(t);
    targets.push(t);
    // Add to physics world
    let targetBody = new Body({
      mass: 0.5, // kg
      shape: new Sphere(exp.cfg.targetRadius),
      linearFactor: new Vec3(1, 1, 0),
      linearDamping: 0.1,
      angularDamping: 0.1,
    });
    targetBody.position.copy(t.position);
    exp.sceneManager.physicsWorld.addBody(targetBody);
    targetBodies.push(targetBody);
  }

  // Goal
  let goal = new Mesh(
    new CylinderGeometry(exp.cfg.goalRadius, exp.cfg.goalRadius, 0.04)
  );
  goal.material.color = new Color('orange');
  goal.rotateX(-Math.PI / 2);
  exp.sceneManager.scene.add(goal);
  let goalBody = new Body({
    type: Body.STATIC,
    shape: new Cylinder(exp.cfg.goalRadius, exp.cfg.goalRadius, 0.04),
  });
  goalBody.quaternion.copy(goal.quaternion);
  exp.sceneManager.physicsWorld.addBody(goalBody);
  goalBody.addEventListener('collide', (e) => {
    if (targetBodies.includes(e.body)) {
      exp.points.add(50);
      goal.hitTween?.stop();
      goal.scale.setScalar(1);
      goal.material.color.r = 1;
      goal.hitTween = new Tween(goal)
        .to({ scale: { x: 1.3, z: 1.3 }, material: { color: { r: 0.5 } } }, 100)
        .repeat(1)
        .yoyo(true)
        .start();
    }
  });
  console.log(goalBody);

  // Walls
  let leftWall = new Body({
    type: Body.STATIC,
    shape: new Plane(),
  });
  leftWall.quaternion.setFromEuler(0, Math.PI / 2, 0);
  leftWall.position.set(-exp.sceneManager.camera.aspect, 0, 0);
  let rightWall = new Body({
    type: Body.STATIC,
    shape: new Plane(),
  });
  rightWall.quaternion.setFromEuler(0, -Math.PI / 2, 0);
  rightWall.position.set(exp.sceneManager.camera.aspect, 0, 0);
  let bottomWall = new Body({
    type: Body.STATIC,
    shape: new Plane(),
  });
  bottomWall.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  bottomWall.position.set(0, -1, 0);
  let topWall = new Body({
    type: Body.STATIC,
    shape: new Plane(),
  });
  topWall.quaternion.setFromEuler(Math.PI / 2, 0, 0);
  topWall.position.set(0, 0.8, 0);
  [leftWall, rightWall, bottomWall, topWall].forEach((wall) =>
    exp.sceneManager.physicsWorld.addBody(wall)
  );
  // Keep the walls at the screen edges when resizing
  document.body.addEventListener('cameraupdate', () => {
    leftWall.position.set(-exp.sceneManager.camera.aspect, 0, 0);
    rightWall.position.set(exp.sceneManager.camera.aspect, 0, 0);
  });

  /*
   * Create trial sequence from array of block objects.
   */
  exp.createTrialSequence([
    new Block({
      variables: {
        angle: 0,
        goalAngle: linspace(-Math.PI / 8, Math.PI / 8, 6),
      },
      options: {
        reps: 2,
        shuffle: true,
      },
    }),
  ]);

  /*
   * You must initialize an empty object called trial
   */
  let trial = {};

  /**
   * An instructions panel overlaid in the top-right of the screen.
   * Keep these instructions short. Use CSS2D to overlay instructions on the scene.
   */
  exp.instructions = new InstructionsPanel({
    content: `Fling the blue cursor at the orange target`,
  });
  exp.instructions.hide();
  //exp.points.panel.hide();
  exp.progress.hide();

  /**
   * Initialize Finite State Machine (FSM) that manages the flow of your experiment.
   * You will define the behavior and transitions of the FSM below in stateFunc().
   */
  exp.state.init(
    [
      'CONSENT',
      'SIGNIN',
      'SETUP',
      'START',
      'DRAGGING',
      'WAIT',
      'FINISH',
      'ADVANCE',
      'SURVEY',
      'CODE',
      'FULLSCREEN',
      'DATABASE',
      'BLOCKED',
    ],
    handleStateChange
  );

  // Post-experiment survey
  exp.survey = new Survey();
  exp.survey.addQuestion({
    type: 'list',
    name: 'hand',
    message: 'Which hand did you primarily use during the experiment?',
    choices: ['Right', 'Left'],
    options: { required: true },
  });

  /*
   * Add DragControls and event listeners to move the "joint" (which will move the cursor)
   */
  const controls = new DragControls(
    [joint],
    exp.sceneManager.camera,
    exp.sceneManager.renderer.domElement
  );
  controls.deactivate();
  // Add event listener to highlight dragged object
  controls.addEventListener('dragstart', function (event) {
    exp.dragging = true;
    jointBody.position.copy(cursor.position);
    jointBody.quaternion.copy(cursor.quaternion);
    exp.sceneManager.physicsWorld.addConstraint(jointConstraint);
    cursor.material.color.set('lightyellow');
  });
  controls.addEventListener('dragend', function (event) {
    exp.dragging = false;
    exp.sceneManager.physicsWorld.removeConstraint(jointConstraint);
    cursor.material.color.set('hotpink');
  });
  controls.addEventListener('drag', function (event) {
    jointBody.position.copy(joint.position);
    jointBody.quaternion.copy(joint.quaternion);
    jointConstraint.update();
  });

  // Start the main loop! These three functions will take it from here.
  exp.start(calcFunc, stateFunc, displayFunc);

  /**
   * Use `calcFunc` for calculations used in _multiple states_
   */
  function calcFunc() {
    exp.sceneManager.physicsWorld.fixedStep();
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
    } else if (exp.fullscreenInterrupt()) {
      exp.blocker.show('fullscreen');
      exp.state.push('FULLSCREEN');
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
          exp.state.next('SETUP');
        }
        break;

      // The following states should be modified as needed for your experiment

      case 'SETUP':
        // Start with a deep copy of the initialized trial from exp.trials
        trial = structuredClone(exp.trials[exp.trialNumber]);
        trial.trialNumber = exp.trialNumber;
        trial.startTime = performance.now();
        // Reset data arrays
        trial.t = [];
        trial.state = [];
        trial.posn = [];
        trial.stateChange = [];
        trial.stateChangeTime = [];
        // Initialize trial parameters
        trial.score = 0;
        trial.demoTrial = exp.trialNumber === 0;
        // Reset cube
        let cursorStartPosn = new Vector3(
          0.67 * Math.sin(trial.angle),
          -0.67 * Math.cos(trial.angle),
          0
        );
        cursorBody.position.copy(cursorStartPosn);
        cursorBody.velocity.set(0, 0, 0);
        cursorBody.angularVelocity.set(0, 0, 0);
        cursorBody.quaternion.copy(
          new Quaternion().setFromEuler(...new Vector3().random())
        );
        // Reset targets
        for (let ti = 0; ti < 6; ti++) {
          targetBodies[ti].position.copy(exp.cfg.targetPosns[ti]); //targets[ti].position);
          targetBodies[ti].angularVelocity.copy(new Vector3().random());
          targetBodies[ti].velocity.set(0, 0, 0);
        }
        // Randomize goal
        let goalPosn = new Vector3(
          0.6 * Math.sin(trial.goalAngle),
          0.6 * Math.cos(trial.goalAngle),
          0
        );
        goal.position.copy(goalPosn);
        goalBody.position.copy(goalPosn);
        controls.activate();
        exp.state.next('START');
        break;

      case 'START':
        if (exp.dragging) {
          exp.state.next('DRAGGING');
        }
        break;

      case 'DRAGGING':
        handleFrameData();
        if (cursor.position.y > -0.01) {
          exp.sceneManager.physicsWorld.removeConstraint(jointConstraint);
          cursor.material.color.set('hotpink');
          exp.dragging = false;
        }
        if (!exp.dragging) {
          controls.deactivate();
          exp.state.next('WAIT');
        }
        break;

      case 'WAIT':
        // Count up the number of objects that drop
        if (
          exp.state.expired(2) &&
          targetBodies.every((x) => x.velocity.length() < exp.cfg.minLaunchVel)
        ) {
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
          exp.blocker.fatal(exp.firebase.saveFailed);
          exp.state.push('BLOCKED');
        }
        exp.nextTrial();
        if (exp.trialNumber < exp.numTrials) {
          exp.state.next('SETUP');
        } else {
          exp.complete(); // !!! Critical !!! Must call at end of experiment !!!

          // Clean up
          DisplayElement.hide(exp.sceneManager.renderer.domElement);
          DisplayElement.hide(exp.sceneManager.cssRenderer?.domElement);
          exp.fullscreen.exitFullscreen();
          exp.state.next('SURVEY');
        }
        break;

      case 'SURVEY':
        exp.state.once(() => exp.survey.show());
        if (exp.cfg.completed && exp.survey.submitted) {
          exp.survey.hide();
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

      // The remaining states are interrupt states and can be left alone
      case 'FULLSCREEN':
        if (!exp.fullscreenInterrupt()) {
          exp.blocker.hide();
          exp.state.pop();
        }
        break;

      case 'DATABASE':
        if (!exp.databaseInterrupt()) {
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
    // Update visual stimuli based on physics
    for (let [ti, targetBody] of Object.entries(targetBodies)) {
      targets[ti].position.copy(targetBody.position);
      targets[ti].quaternion.copy(targetBody.quaternion);
    }
    cursor.position.copy(cursorBody.position);
    cursor.quaternion.copy(cursorBody.quaternion);
    if (!exp.dragging) {
      // Keep the joint on the cursor when not dragging (so we can grab it)
      joint.position.copy(cursorBody.position);
      joint.quaternion.copy(cursorBody.quaternion);
    }
    // Render
    tweenUpdate();
    exp.sceneManager.render();
  }

  /**
   * Event handlers
   */

  // Record frame data
  function handleFrameData() {
    trial.t.push(performance.now());
    trial.state.push(exp.state.current);
    trial.posn.push(cursor.position.clone()); // clone!
  }

  // Record state transition data
  function handleStateChange() {
    trial?.stateChange?.push(exp.state.current);
    trial?.stateChangeTime?.push(performance.now());
  }
}

window.addEventListener('DOMContentLoaded', main);
