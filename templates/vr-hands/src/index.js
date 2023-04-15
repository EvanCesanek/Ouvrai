// Third-party imports
import { Matrix4, Vector3 } from 'three';

// Package imports
import { Experiment, InstructionsPanel, Block } from 'ouvrai';

// Static asset imports (https://vitejs.dev/guide/assets.html)
import environmentLightingURL from 'ouvrai/lib/environments/IndoorHDRI003_1K-HDR.exr?url'; // absolute path from ouvrai

async function main() {
  // Configure your experiment
  const exp = new Experiment({
    // Options to make development easier
    devOptions: {
      skipConsent: true,
      orbitControls: true,
    },
    demo: true,

    // Platform settings
    requireVR: true,
    handTracking: true,
    handModels: true,
    controllerModels: false,

    // Three.js settings
    environmentLighting: environmentLightingURL,
    gridRoom: true,
    audio: true,

    // Scene parameters (meters, seconds)
    homePosn: new Vector3(0, 1.3, -0.5),
    cursorRadius: 0.02,
    targetRadius: 0.025,
    calibrationDuration: 10,
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
   * Create visual stimuli with three.js
   */

  /*
   * Create trial sequence from array of block objects.
   */
  exp.createTrialSequence([
    new Block({
      options: {
        name: 'Hands',
        reps: 1,
      },
    }),
  ]);

  /*
   * You must initialize an empty object called trial
   */
  let trial = {};

  // let cubesR = {};
  // let cubesL = {};
  // let cubesL2 = {};
  // let cubesR2 = {};
  // let cylindersR = {};
  // let cylindersL = {};
  // let cube = new Mesh(
  //   new BoxGeometry(),
  //   new MeshStandardMaterial()
  // );
  // let cylinder = new Mesh(
  //   new CylinderGeometry(),
  //   new MeshStandardMaterial({ color: 'black' })
  // );

  exp.sceneManager.recentered = true;

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
          exp.hand1Models[exp.hand1.userData.currentHandModel].visible = false;
          exp.hand1.userData.currentHandModel =
            (exp.hand1.userData.currentHandModel + 1) % 2;
          exp.hand1Models[exp.hand1.userData.currentHandModel].visible = true;
          exp.hand2Models[exp.hand2.userData.currentHandModel].visible = false;
          exp.hand2.userData.currentHandModel =
            (exp.hand2.userData.currentHandModel + 1) % 2;
          exp.hand2Models[exp.hand2.userData.currentHandModel].visible = true;
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
          exp.hand1Models[exp.hand1.userData.currentHandModel].visible = false;
          exp.hand1.userData.currentHandModel =
            (exp.hand1.userData.currentHandModel + 1) % 2;
          exp.hand1Models[exp.hand1.userData.currentHandModel].visible = true;
          exp.hand2Models[exp.hand2.userData.currentHandModel].visible = false;
          exp.hand2.userData.currentHandModel =
            (exp.hand2.userData.currentHandModel + 1) % 2;
          exp.hand2Models[exp.hand2.userData.currentHandModel].visible = true;
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
    if (exp.rightHandConnected && exp.leftHandConnected) {
      // for (let [k, v] of Object.entries(exp.rightHand.joints)) {
      //   if (!cubesR[k]) {
      //     cubesR[k] ??= cube.clone();
      //     cubesR[k].scale.setScalar(v.jointRadius);
      //   }
      //   // if (exp.rightHand.children.indexOf(cubesR[k] === -1))
      //   //   exp.rightHand.add(cubesR[k]);

      //   v.matrix.decompose(
      //     cubesR[k].position,
      //     cubesR[k].rotation,
      //     new Vector3()
      //   );
      // }

      // for (let [k, v] of Object.entries(exp.leftHand.joints)) {
      //   if (!cubesL[k]) {
      //     cubesL[k] ??= cube.clone();
      //     cubesL[k].scale.setScalar(v.jointRadius);
      //   }
      //   // if (exp.leftHand.children.indexOf(cubesL[k] === -1))
      //   //   exp.leftHand.add(cubesL[k]);

      //   v.matrix.decompose(
      //     cubesL[k].position,
      //     cubesL[k].rotation,
      //     new Vector3()
      //   );
      // }

      let f1 = 'index-finger-metacarpal';
      let f2 = 'index-finger-metacarpal';
      let f1Mat = exp.rightHand.joints[f1].matrix.clone();
      let f2Mat = exp.leftHand.joints[f2].matrix.clone();
      let f1MatInv = f1Mat.clone().invert();
      let f2MatInv = f2Mat.clone().invert();
      let yref = new Matrix4();
      yref.elements[0] = -1;

      for (let [j1, j2] of [
        ['index-finger-phalanx-proximal', 'index-finger-phalanx-proximal'],
        [
          'index-finger-phalanx-intermediate',
          'index-finger-phalanx-intermediate',
        ],
        ['index-finger-phalanx-distal', 'index-finger-phalanx-distal'],
        ['index-finger-tip', 'index-finger-tip'],
      ]) {
        let f2Mat2 = f2Mat
          .clone()
          .multiply(yref)
          .multiply(f1MatInv.clone().multiply(exp.rightHand.joints[j1].matrix));
        // f2Mat2.decompose(
        //   cubesR[j2].position,
        //   cubesR[j2].rotation,
        //   new Vector3()
        // );
        f2Mat2.decompose(
          exp.leftHand.joints[j2].position,
          exp.leftHand.joints[j2].rotation,
          new Vector3()
        );
        let f1Mat2 = f1Mat
          .clone()
          .multiply(yref)
          .multiply(f2MatInv.clone().multiply(exp.leftHand.joints[j2].matrix));
        // f1Mat2.decompose(
        //   cubesL[j1].position,
        //   cubesL[j1].rotation,
        //   new Vector3()
        // );
        f1Mat2.decompose(
          exp.rightHand.joints[j1].position,
          exp.rightHand.joints[j1].rotation,
          new Vector3()
        );
      }
    }

    if (exp.saveSuccessful) {
      console.warn('SAVE SUCCESSFUL');
      exp.VRUI.edit({ title: 'Saved' });
    }

    if (exp.saveFailed) {
      console.error(exp.saveFailed);
      exp.VRUI.edit({ title: 'Error' });
    }

    exp.VRUI.updateUI();
    exp.sceneManager.render();
  }

  /**
   * Unsuccessful earlier attempts at finger swapping:
   */

  function xrHandKinematicChain() {
    return {
      wrist: {
        'thumb-metacarpal': {
          'thumb-phalanx-proximal': {
            'thumb-phalanx-distal': { 'thumb-tip': {} },
          },
        },
        'index-finger-metacarpal': {
          'index-finger-phalanx-proximal': {
            'index-finger-phalanx-intermediate': {
              'index-finger-phalanx-distal': { 'index-finger-tip': {} },
            },
          },
        },
        'middle-finger-metacarpal': {
          'middle-finger-phalanx-proximal': {
            'middle-finger-phalanx-intermediate': {
              'middle-finger-phalanx-distal': { 'middle-finger-tip': {} },
            },
          },
        },
        'ring-finger-metacarpal': {
          'ring-finger-phalanx-proximal': {
            'ring-finger-phalanx-intermediate': {
              'ring-finger-phalanx-distal': { 'ring-finger-tip': {} },
            },
          },
        },
        'pinky-finger-metacarpal': {
          'pinky-finger-phalanx-proximal': {
            'pinky-finger-phalanx-intermediate': {
              'pinky-finger-phalanx-distal': { 'pinky-finger-tip': {} },
            },
          },
        },
      },
    };
  }
}

window.addEventListener('DOMContentLoaded', main);
