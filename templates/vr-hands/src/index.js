// Third-party imports
import { Matrix4, Vector3 } from 'three';

// Package imports
import { Experiment, InstructionsPanel, Block } from 'ouvrai';

import { fileContents } from './fileContents.js';

// Static asset imports (https://vitejs.dev/guide/assets.html)
import environmentLightingURL from 'ouvrai/lib/environments/IndoorHDRI003_1K-HDR.exr?url';

async function main() {
  // Configure your experiment
  const exp = new Experiment({
    // Options to make development easier
    devOptions: {
      skipConsent: true,
      orbitControls: false,
    },
    demo: true,

    // Platform settings
    requireVR: true,
    handTracking: true,
    handModels: true,
    controllerModels: false,
    disableAutoRecenter: true, // disable recentering bc it can create offsets with hand-tracking (TODO bugfix)

    // Three.js settings
    environmentLighting: environmentLightingURL,
    gridRoom: true,
    audio: true,
    experimentSourceCode: fileContents,

    // Scene parameters (meters, seconds)
  });

  /**
   * Initialize Finite State Machine (FSM) that manages the flow of your experiment.
   * You will define the behavior and transitions of the FSM below in stateFunc().
   */
  exp.state.init([
    'CONSENT',
    'SIGNIN',
    'MESH',
    'CUBES',
    'HAND',
    'DATABASE',
    'BLOCKED',
  ]);

  // Short instruction panel telling them to click ENTER VR
  exp.instructions = new InstructionsPanel({
    content: `You must use your hands, not controllers.\
    \nClick the ENTER VR button to start.\
    \nYou will see more instructions in VR.`,
    collapsible: false,
  });

  /*
   * Create trial sequence from array of block objects.
   */
  exp.createTrialSequence([
    new Block({
      options: {
        reps: 1,
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
  function calcFunc() {}

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
    } else if (exp.handInterrupt(true, true)) {
      exp.state.push('HAND');
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
          trial = structuredClone(exp.trials[exp.trialNumber]);
          trial.t = [];
          trial.trialNumber = exp.trialNumber;
          trial.startTime = performance.now();
          // Reset data arrays
          trial.t = [];
          trial.state = [];
          trial.stateChange = [];
          trial.stateChangeTime = [];
          exp.state.next('MESH');
        }
        break;

      case 'MESH':
        exp.state.once(() => {
          exp.VRUI.edit({
            title: 'Mesh',
            instructions: false,
            interactive: false,
            buttons: false,
          });
          switchHandModel();
        });
        if (
          !exp.allowHandChange &&
          exp.rightHand?.joints['wrist'].position.x >
            exp.leftHand?.joints['wrist'].position.x
        ) {
          exp.allowHandChange = true;
        }
        if (
          exp.allowHandChange &&
          exp.rightHand?.joints['wrist'].position.x <
            exp.leftHand?.joints['wrist'].position.x
        ) {
          exp.allowHandChange = false;
          exp.state.next('CUBES');
        }

        break;

      case 'CUBES':
        exp.state.once(() => {
          exp.VRUI.edit({
            title: 'Cubes',
            instructions: false,
            interactive: false,
            buttons: false,
          });
          switchHandModel();
        });
        if (
          !exp.allowHandChange &&
          exp.rightHand?.joints['wrist'].position.x >
            exp.leftHand?.joints['wrist'].position.x
        ) {
          exp.allowHandChange = true;
        }
        if (
          exp.allowHandChange &&
          exp.rightHand?.joints['wrist'].position.x <
            exp.leftHand?.joints['wrist'].position.x
        ) {
          exp.allowHandChange = false;
          exp.state.next('MESH');
        }

        break;

      case 'HAND':
        exp.state.once(function () {
          if (exp.state.last !== 'REST') {
            exp.VRUI.edit({
              title: 'Hands?',
              instructions:
                'Please hold out your hands so your headset can track them.',
            });
          }
        });
        if (!exp.handInterrupt()) {
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
  function displayFunc(time, frame) {
    // Both hands must be tracked to swap fingers
    if (exp.rightHandConnected && exp.leftHandConnected) {
      // We swap other joints based on position relative to base joint j0
      let j0_R = 'index-finger-metacarpal'; // Right hand
      let j0_L = 'index-finger-metacarpal'; // Left hand
      // Create copies of H_L0 and H_R0 matrices (and inverses) to avoid messing with actual joints
      let H0_R = exp.rightHand.joints[j0_R].matrix.clone();
      let H0_L = exp.leftHand.joints[j0_L].matrix.clone();
      let H0_R_inv = H0_R.clone().invert();
      let H0_L_inv = H0_L.clone().invert();
      // Reflection matrix across YZ plane (because hands are mirror symmetrical)
      let yref = new Matrix4();
      yref.elements[0] = -1;

      // Loop over two-name arrays to swap joint pairs
      // Here we are swapping the same joints between left and right
      for (let [ji_L, ji_R] of [
        ['index-finger-phalanx-proximal', 'index-finger-phalanx-proximal'],
        [
          'index-finger-phalanx-intermediate',
          'index-finger-phalanx-intermediate',
        ],
        ['index-finger-phalanx-distal', 'index-finger-phalanx-distal'],
        ['index-finger-tip', 'index-finger-tip'],
      ]) {
        // Put right-hand finger on left hand:
        // Transform matrix G_Ri positions the right-hand joint (ji_R) relative to left-hand base joint (j0_L)
        // G_Ri = H0_L * R * (inv(H0_R) * Hi_R)
        let G_Ri = H0_L.clone()
          .multiply(yref)
          .multiply(
            H0_R_inv.clone().multiply(exp.rightHand.joints[ji_R].matrix)
          );
        // Decompose the matrix G_Ri into the spatial params of the left-hand joint (ji_L)
        G_Ri.decompose(
          exp.leftHand.joints[ji_L].position,
          exp.leftHand.joints[ji_L].rotation,
          new Vector3()
        );
        // Same thing: left-hand finger on right hand
        let G_Li = H0_R.clone()
          .multiply(yref)
          .multiply(
            H0_L_inv.clone().multiply(exp.leftHand.joints[ji_L].matrix)
          );
        G_Li.decompose(
          exp.rightHand.joints[ji_R].position,
          exp.rightHand.joints[ji_R].rotation,
          new Vector3()
        );
      }
    }

    exp.VRUI.updateUI();
    exp.sceneManager.render();
  }

  /**
   * Toggle between cube-hands and mesh-hands
   */
  function switchHandModel() {
    exp.hand1Models[exp.hand1.userData.currentHandModel].visible = false;
    exp.hand1.userData.currentHandModel =
      (exp.hand1.userData.currentHandModel + 1) % 2;
    exp.hand1Models[exp.hand1.userData.currentHandModel].visible = true;
    exp.hand2Models[exp.hand2.userData.currentHandModel].visible = false;
    exp.hand2.userData.currentHandModel =
      (exp.hand2.userData.currentHandModel + 1) % 2;
    exp.hand2Models[exp.hand2.userData.currentHandModel].visible = true;
  }
}

window.addEventListener('DOMContentLoaded', main);
