/*** third-party imports ***
Important: Snowpack has a bug where it processes the threejs package.json exports incorrectly:
  [snowpack] Package "three" exists but package.json "exports" does not include entry for "./examples/jsm/libs/stats.module.js".
For a temporary fix, open ./node_modules/three/package.json and add (e.g.)
  "./examples/jsm/libs/*": "./examples/jsm/libs/*"
  to the exports section (replacing 'libs' with relevant subdirectory as needed, see below)
Watch: https://github.com/FredKSchott/snowpack/issues/3867
*/
import Stats from 'three/examples/jsm/libs/stats.module.js';
//import { GUI } from 'three/examples/jsm/libs/lil-gui.module.min.js'; //https://lil-gui.georgealways.com/
//import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
//import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
//import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoomEnvironment } from './components/environments/RoomEnvironment.js'; // personal copy
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory.js';
//import { OculusHandModel } from 'three/examples/jsm/webxr/OculusHandModel.js';
//import { createText } from 'three/examples/jsm/webxr/Text2D.js';
import {
  ACESFilmicToneMapping,
  AmbientLight,
  Clock,
  Color,
  DoubleSide,
  Group,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  sRGBEncoding,
  TextureLoader,
  Vector3,
  WebGLRenderer,
} from 'three';
import colormap from 'colormap'; // https://github.com/bpostlethwaite/colormap#readme
import bowser from 'bowser';
import { range, shuffle } from 'd3-array'; // https://www.npmjs.com/package/d3-array
import { Easing, Tween, update as tweenUpdate } from '@tweenjs/tween.js'; // https://github.com/tweenjs/tween.js/

/*** weblab imports ***/
import {
  clamp,
  computeMassSpringDamperParameters,
  computeMassSpringDamperPosition,
  truncQuadCost,
  rotationHelper,
} from './components/utils.js';
import {
  buildController,
  onSelectEnd,
  onSelectStart,
} from './components/utils-xr.js';
import { EXRLoader } from './components/environments/EXRLoader.js'; // three.js does not yet have an ESM version so use this copy
import { MeshFactory } from './components/mesh/MeshFactory.js';
import { PBRMapper } from './components/mesh/PBRMapper.js';
import { Timer } from './components/Timer.js';
import { Firebase } from './components/Firebase.js';
import { Experiment } from './components/Experiment.js';
import { BlockOptions } from './components/BlockOptions.js';
import { Survey } from './components/elements/Survey.js';
import { State } from './components/State.js';
import { Fullscreen } from './components/elements/Fullscreen.js';
import { Goodbye } from './components/elements/Goodbye.js';
import { DisplayElement } from './components/elements/DisplayElement.js';

async function main() {
  // create new experiment with configuration options
  const exp = new Experiment({
    name: 'example',
    cssBackground: 'dimgray', // color name string: http://davidbau.com/colors/

    requireDesktop: true,
    requireChrome: true,
    vrAllowed: true,

    // Experiment-specific quantities
    // Assume meters and seconds for three.js, but note tween.js uses milliseconds
    gravity: 9.81,
    springConstant: 100,
    springDamping: 3,
    springStretchSpeed: 0.0005, // i.e. 1 px mousemove = 0.5 mm stretch
    maxStretch: 0.1,

    // Speeds and durations
    carouselRotationSpeed: (2 * Math.PI) / 2000, // radians/millisecond (tween)
    ITI: 1000, // milliseconds (tween)
    pointsWaitTime: 0.1, // How long into Drop phase should the points be shown?
    minDropWaitTime: 1.0, // What's the minimum time of the Drop phase?

    // Points cost function rules
    errorForZeroPoints: 0.025, // saturation point of truncated points loss (zero points)
    maxTrialPoints: 100, // maximum possible points in a trial

    // Time cost function rules
    errorForMaxTimePenalty: 0.06, // saturation point of truncated time loss
    maxTimePenalty: 5, // time penalty beyond saturation point of truncated time loss
    timePenaltyAbsDecay: 0.0005, // wait until decaying to this spring oscillation envelope magnitude

    // demoTrialMinDropWaitTime: 4, // What's the minimum Drop phase time in the demo trial?
    // instructionsReminderTime: 10, // How long into Pull phase?
    // noRewardGoalReminderTime: 2, // How long into long time penalty?
    // instructionsClickWaitTime: 1, // How long before next click will be accepted?

    environment: 'IndoorHDRI003_1K-HDR.exr',
    sceneBackground: 'IndoorHDRI003_4K-TONEMAPPED.jpg',
    textureName: 'Wood049_1K',
  });

  // Create trial structure using an array of block objects (in desired order)
  // A block object consists of N equal-length arrays
  // The combination of elements at index i are the variable values for one trial
  // BlockOptions are used to control trial sequencing behavior of Experiment.js
  let blocks = [
    {
      targetId: [0, 1, 3, 4],
      options: new BlockOptions('train', true, 0),
    },
    {
      targetId: [0, 1, 2, 3, 4],
      options: new BlockOptions('test', true, 10),
    },
  ];
  exp.createTrialSequence(blocks);

  // Add any additional config info needed later
  exp.cfg.numObjects = 5;
  exp.cfg.targetWeights = [0.3, 0.4, 0.8, 0.6, 0.7];
  exp.cfg.targetHeights = [0.05, 0.06, 0.07, 0.08, 0.09];
  exp.cfg.palette = colormap({
    colormap: 'par',
    nshades: 20,
    format: 'hex',
    alpha: 1,
  });

  // Create finite state machine (experiment flow manager)
  exp.cfg.stateNames = [
    // assigned to experiment so they are saved
    'BROWSER',
    'CONSENT',
    'SIGNIN',
    'SETUP',
    'START',
    'CAROUSEL',
    'PULL',
    'DROP',
    'FINISH',
    'ADVANCE',
    'SURVEY',
    'CODE',
    'FULLSCREEN',
    'POINTERLOCK',
    'DBCONNECT',
    'BLOCKED',
  ];
  const state = new State(exp.cfg.stateNames, handleStateChange);

  // In what states must we prompt FS / PL
  exp.fullscreenStates = exp.pointerlockStates = [
    'POINTERLOCK',
    'SETUP',
    'START',
    'CAROUSEL',
    'PULL',
    'DROP',
    'FINISH',
    'ADVANCE',
  ].map((s) => state[s]);

  // Create elements
  const firebase = new Firebase({
    expName: exp.name,
    workerId: exp.cfg.workerId,
  });
  const survey = new Survey();
  const goodbye = new Goodbye(exp.cfg.platform); // Remember to updateGoodbye() before the end!

  const instructions = new DisplayElement({
    element: `
    <div id="instruction-detail" class="panel-detail collapsible">
      Click and drag upward to stretch the spring.<br />
      Press the Shift key to release the object.<br />
      Try to remember how much each object weighs,<br />
      and stretch the spring so they do not move.<br />
      When the object stays still, you earn 100 points.<br />
    </div>`,
    hide: false,
    display: 'block',
    parent: document.getElementById('instruction-panel'),
  });

  // set debug options
  if (location.hostname === 'localhost') {
    //exp.consented = true;
    //exp.fullscreenStates = [];
    //const gui = new GUI({ title: 'Information' });
  } else {
    console.log = function () {}; // disable in production
  }

  const stats = new Stats(); // performance monitor
  stats.showPanel(0); // 0: fps, 1: ms, 2: mb, 3+: custom
  document.body.appendChild(stats.dom);

  // Add listeners for default weblab events
  addDefaultEventListeners();

  //
  const springOscillationTimer = new Timer();

  // on each trial, trial object will be deep-copied from exp.trials[exp.trialNumber]
  let trial = {};
  // declare here all the values you would like to reset on each trial
  const trialInitialize = {
    saveSuccessful: false,
    // render loops
    tFrame: [],
    stateFrame: [],
    stretchFrame: [],
    // mousemove events
    dx: [],
    dy: [],
    btn: [],
    t: [],
    state: [],
    // vr events
    posn_RH: [],
    // pointer events (coalesced)
    dxCo: [],
    dyCo: [],
    tCo: [],
    stateCo: [],
    // state change events
    stateChange: [],
    stateChangeTime: [],
  };

  // Create threejs scene
  // Assume 1 unit = 1 meter (required for renderer.physicallyCorrectLights, physics, imported meshes, etc)
  // Remember +y is up, -z is forward
  let [
    camera,
    scene,
    renderer,
    cssScene,
    cssRenderer,
    controller1,
    controller2,
  ] = await initScene();

  //controls.enabled = false;
  //document.body.addEventListener('pointerdown', (e) => console.log(e));

  // Add CSS2D objects
  cssScene.add(exp.points.css2d.object);

  // Create carousel
  const carouselParams = {
    // threejs torus parameters
    majorRadius: 0.15,
    minorRadius: 0.003,
    tubularSegments: 48,
    radialSegments: 12,
    // experiment parameters
    spacing: (2 * Math.PI) / exp.cfg.numObjects,
    targetOrder: shuffle(range(exp.cfg.numObjects)),
  };
  let carousel = MeshFactory.torus(carouselParams);
  carousel.material.color = new Color('black');
  carousel.material.side = DoubleSide;
  // Remember to position things for VR room space
  carousel.position.z = -1.0;
  carousel.position.y = 1.5;
  // tilt it back
  carousel.rotation.x = -Math.PI / 2;
  // rotate CCW so arc starts at origin and wraps around CCW
  // then rotate CW by half object spacing to center the gap on the origin
  carousel.rotation.z = -Math.PI / 2 + carouselParams.spacing / 2;
  scene.add(carousel);

  // Create spring
  // Remember clone() does not clone geometry, which is how we stretch springs...
  // So we will need to create multiple (or maybe we should only have one spring?)
  const springParams = {
    majorRadius: 0.01,
    minorRadius: 0.01 / 7,
    numCoils: 7,
    tubularSegments: 120,
  };
  const springs = [];
  const springRing = MeshFactory.torus({
    majorRadius: 0.01,
    minorRadius: 0.01 / 7,
    tubularSegments: 24,
  });
  springRing.rotation.x = -Math.PI / 2;

  // Create target object type
  // let object = MeshFactory.cylinder({ radialSegments: 64 });
  // //let object = MeshFactory.sphere({ radialSegments: 64 });
  // object.material.roughness = 0; //0.6;
  // object.material.metalness = 0; //0.8;

  // Create object group, centered at the carousel
  const objects = [];
  const objectGroup = new Group();
  objectGroup.position.copy(carousel.position);
  objectGroup.position.y += carouselParams.minorRadius * 2; // for cylinders

  // Arrange object+spring around the object group
  for (let oi = 0; oi < exp.cfg.numObjects; oi++) {
    // minus pi/2 to rotate the unit circle CW 90 degrees
    let theta = carouselParams.spacing * carouselParams.targetOrder[oi];
    let x = carouselParams.majorRadius * Math.cos(theta);
    let z = carouselParams.majorRadius * Math.sin(theta);

    //let obji = object.clone();
    // Create target object type
    let obji = MeshFactory.cylinder({ radialSegments: 64 });
    obji.name = `object${oi}`;
    obji.yInit = -exp.cfg.targetHeights[oi] / 2;
    obji.carouselAngle = theta - Math.PI / 2;
    obji.position.x = x;
    obji.position.y = obji.yInit;
    obji.position.z = z;
    obji.rotation.y = obji.carouselAngle + Math.PI / 2;
    obji.scale.x = 0.03;
    obji.scale.y = exp.cfg.targetHeights[oi];
    obji.scale.z = 0.03;

    // Optionally clone the material to give unique materials
    //obji.material = object.material.copy();
    try {
      await PBRMapper.load(exp.cfg.textureName, obji.material);
    } catch (error) {
      console.error(error.message);
    }
    obji.material.map.repeat.set(
      1,
      (0.2 * obji.scale.y) / exp.cfg.targetHeights[0]
    );
    //obji.material.color = new Color(exp.cfg.palette[oi + 3]);

    let spring = MeshFactory.spring(springParams);
    spring.material.color = new Color('slategray');
    spring.material.roughness = 0.3;
    spring.material.metalness = 1;
    let ringi = springRing.clone();
    ringi.material.copy(spring.material);

    // put the spring on top (in local space, 1 y-unit = full object height)
    ringi.position.y = 0.5;
    spring.position.y = 0.5;
    // springs are manufactured at the correct absolute size, so undo the parent scaling
    ringi.scale.set(1 / obji.scale.x, 1 / obji.scale.z, 1 / obji.scale.y); // z and y swapped due to prior x-rotation
    spring.scale.set(1 / obji.scale.x, 1 / obji.scale.y, 1 / obji.scale.z);
    obji.add(ringi);
    obji.add(spring); // child of the object, so we can move objects and not worry about springs

    // So we can rotate all the objects as a group
    objectGroup.add(obji);

    springs.push(spring);
    objects.push(obji);
  }
  scene.add(objectGroup);
  // Initialize so first object is already at the front
  objectGroup.rotation.y = objects[exp.trials[0].targetId].carouselAngle;

  // Position the camera to look at the front object
  objects[exp.trials[0].targetId].getWorldPosition(camera.position);
  camera.position.add(new Vector3(0, 0.16, 0.4));
  let tmp = new Vector3();
  objects[exp.trials[0].targetId].getWorldPosition(tmp);
  camera.lookAt(tmp);

  mainLoopFunc(); // requires calcFunc(), stateFunc(), and displayFunc() to be defined

  // Helper functions
  async function initScene() {
    // 0. Define renderer(s)
    let renderer = new WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    //renderer.physicallyCorrectLights = true;
    renderer.outputEncoding = sRGBEncoding;
    renderer.toneMapping = ACESFilmicToneMapping;

    // 1. Create a scene
    let scene = new Scene();
    // Default background matches CSS background
    scene.background = new Color(exp.cfg.cssBackground);

    // Scene Lighting Option 1: Add your own lights
    const light = new AmbientLight('white', 0.3);
    scene.add(light);
    //const directionalLight = new DirectionalLight('white', 1.2);
    //directionalLight.position.set(-2, 100, 2);
    //scene.add(directionalLight);

    // Lighting Option 2: Environment maps (if set, used as default envMap in Materials)
    const pmremGenerator = new PMREMGenerator(renderer);

    // Load a custom background
    if (exp.cfg.sceneBackground.endsWith('.jpg')) {
      new TextureLoader().load(
        `./components/environments/${exp.cfg.sceneBackground}`,
        (texture) => {
          exp.background = pmremGenerator.fromEquirectangular(texture).texture;
          texture.dispose();
        }
      );
    }

    if (exp.cfg.environment.endsWith('.js')) {
      // Option 1: Provide a pre-built Scene object (see RoomEnvironment.js)
      // Note: exported class should always be called RoomEnvironment!
      scene.environment = pmremGenerator.fromScene(
        new RoomEnvironment(0.5), // see import
        0.04
      ).texture;
      pmremGenerator.dispose();
    } else if (
      exp.cfg.environment.endsWith('.exr') ||
      exp.cfg.environment.endsWith('.hdr')
    ) {
      let envLoader;
      if (exp.cfg.environment.endsWith('.exr')) {
        //Option 2a: Provide a .exr image
        envLoader = new EXRLoader();
      } else {
        //Option 2b: Provide a .hdr image
        envLoader = new RGBELoader();
      }
      envLoader.load(
        `./components/environments/${exp.cfg.environment}`,
        (texture) => {
          scene.environment =
            pmremGenerator.fromEquirectangular(texture).texture;
          pmremGenerator.dispose();
          texture.dispose();
        }
      );
    }

    // 2. Define camera (if not added to scene, used as default by all renderers)
    let camera = new PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.01,
      10
    );
    scene.add(camera);

    // 3. Setup VR if enabled
    let controller1, controller2; // hand1, hand2;
    try {
      exp.vrSupported = await navigator.xr.isSessionSupported('immersive-vr');
    } catch (error) {
      console.error(error.message);
    }
    if (exp.vrAllowed && exp.vrSupported) {
      exp.fullscreenStates = exp.pointerlockStates = [];
      [controller1, controller2] = initVR(renderer, scene);
      console.log(controller1);
      console.log(controller2);
    }

    // 4. Manage DOM
    document.getElementById('screen').appendChild(renderer.domElement);
    DisplayElement.hide(renderer.domElement);

    let cssRenderer = new CSS2DRenderer();
    cssRenderer.setSize(window.innerWidth, window.innerHeight);
    cssRenderer.domElement.style.position = 'absolute';
    document.getElementById('screen').appendChild(cssRenderer.domElement);
    DisplayElement.hide(cssRenderer.domElement);
    let cssScene = new Scene();

    // 4. Add resize listener
    // for consistent scene scale despite window dimensions (see also handleResize)
    // exp.cfg.tanFOV = Math.tan(((Math.PI / 180) * camera.fov) / 2);
    // exp.cfg.windowHeight = window.innerHeight;
    window.addEventListener('resize', handleResize);

    return [
      camera,
      scene,
      renderer,
      cssScene,
      cssRenderer,
      controller1,
      controller2,
    ];
  }

  function calcFunc() {
    if (exp.vrEnabled) {
      handleControllers(controller1, controller2);
    }
  }

  function stateFunc() {
    // Process interrupt flags (FS & PL, add exp.pause?) as needed
    if (!firebase.databaseConnected) {
      springOscillationTimer.pause();
      state.push(state.DBCONNECT);
    } else if (
      !exp.fullscreen.engaged &&
      exp.fullscreenStates.includes(state.current)
    ) {
      springOscillationTimer.pause();
      state.push(state.FULLSCREEN); // divert to FULLSCREEN state
    } else if (
      !exp.pointerlock.engaged &&
      exp.pointerlockStates.includes(state.current)
    ) {
      springOscillationTimer.pause();
      state.push(state.POINTERLOCK); // divert to POINTERLOCK state
    }

    switch (state.current) {
      case state.BLOCKED: {
        // dead-end state
        break;
      }

      case state.BROWSER: {
        const browserInfo = bowser.parse(window.navigator.userAgent);
        if (exp.cfg.requireDesktop && browserInfo.platform.type == 'mobile') {
          exp.blocker.show(exp.blocker.desktop);
          state.next(state.BLOCKED);
        } else if (
          exp.cfg.requireChrome &&
          browserInfo.browser.name !== 'Chrome'
        ) {
          exp.blocker.show(exp.blocker.chrome);
          state.next(state.BLOCKED);
        } else {
          // Any info we want to save should be added to the exp.cfg object
          exp.cfg.browser = browserInfo.browser;
          exp.cfg.os = browserInfo.os;
          state.next(state.CONSENT);
        }
        break;
      }

      case state.CONSENT: {
        if (exp.consented) {
          firebase.signInAnonymously();
          state.next(state.SIGNIN);
        }
        if (exp.consent.hidden) {
          exp.consent.show();
        }
        break;
      }
      case state.SIGNIN: {
        if (firebase.uid) {
          exp.consent.hide();
          // threejs dom elements don't have show() and hide()
          DisplayElement.show(renderer.domElement);
          DisplayElement.show(cssRenderer.domElement);
          state.next(state.SETUP);
        }
        break;
      }

      case state.SETUP: {
        // Start with a deep copy of the initialized trial from exp.trials
        trial = structuredClone(exp.trials[exp.trialNumber]);
        trial.trialNumber = exp.trialNumber;
        trial.startTime = performance.now();
        // Reset data arrays and other weblab defaults
        trial = { ...trial, ...structuredClone(trialInitialize) };
        // Set trial parameters
        trial.demoTrial = false;
        trial.clamped = true;
        trial.carouselRotated = false;
        trial.stretch = 0;
        trial.massNoise = 0;
        trial.mass = exp.cfg.targetWeights[trial.targetId] + trial.massNoise;
        trial.correct = (trial.mass * exp.cfg.gravity) / exp.cfg.springConstant; // equilibrium displacement
        trial.correctWithoutNoise =
          (exp.cfg.targetWeights[trial.targetId] * exp.cfg.gravity) /
          exp.cfg.springConstant;
        // Get params for closed-form mass-spring-damper trajectories
        trial.sp = computeMassSpringDamperParameters(
          trial.mass,
          exp.cfg.springConstant,
          exp.cfg.springDamping
        );

        state.next(state.START);
        break;
      }

      case state.START: {
        // plan carousel movement such that ITI = delay + duration
        const startAngle = objectGroup.rotation.y;
        let targetAngle = objects[trial.targetId].carouselAngle;
        let distance;
        [targetAngle, distance] = rotationHelper(startAngle, targetAngle);
        let duration = distance / exp.cfg.carouselRotationSpeed;
        if (distance < Math.PI && exp.cfg.ITI < duration) {
          exp.cfg.carouselRotationSpeed = distance / (exp.cfg.ITI * 0.95);
          console.warn(
            `Configured ITI too short to complete movement at configured carousel speed. Carousel speed increased to ${exp.cfg.carouselRotationSpeed}`
          );
          duration = distance / exp.cfg.carouselRotationSpeed;
        }
        let delay = Math.max(0, exp.cfg.ITI - duration);
        new Tween(objectGroup.rotation)
          .easing(Easing.Sinusoidal.InOut)
          .to({ y: targetAngle }, duration)
          .delay(delay)
          .onComplete(() => {
            trial.carouselRotated = true;
          })
          .start();
        state.next(state.CAROUSEL);
        break;
      }

      case state.CAROUSEL: {
        if (trial.carouselRotated) {
          document.body.addEventListener('mousemove', recordMouseMoveData);
          document.body.addEventListener('mousemove', updateSpringLength);
          document.body.addEventListener('mouseup', resetSpringLength);
          document.body.addEventListener('keydown', releaseClamp);
          state.next(state.PULL);
        }
        break;
      }

      case state.PULL: {
        if (!trial.clamped) {
          document.body.removeEventListener('mousemove', recordMouseMoveData);
          document.body.removeEventListener('mousemove', updateSpringLength);
          document.body.removeEventListener('mouseup', resetSpringLength);
          document.body.removeEventListener('keydown', releaseClamp);
          // Modify carousel geometry to create the cutout
          // again animation would be better... (three arcs, two thinner slide out into thicker ring)
          let arcLength =
            (2 * Math.PI * (exp.cfg.numObjects - 1)) / exp.cfg.numObjects;
          MeshFactory.torus({ ...carouselParams, arc: arcLength }, carousel);

          // Compute trial results
          trial.error = trial.stretch - trial.correct;

          // Natural spring exponential time penalty (with slight adjustments)
          // trial.timePenalty =
          //   Math.log(Math.abs(trial.error) / exp.cfg.timePenaltyAbsDecay) /
          //   trial.sp.gamma;
          // trial.timePenalty -= 1;
          // trial.timePenalty *= 2;
          // trial.timePenalty = Math.max(trial.timePenalty, 0);
          // Alternative time penalty truncated quadratic cost:
          trial.timePenalty =
            exp.cfg.maxTimePenalty *
            truncQuadCost(trial.error / exp.cfg.errorForMaxTimePenalty);
          // Start the oscillation animation timer

          springOscillationTimer.reset();
          state.next(state.DROP);
        }
        break;
      }

      case state.DROP: {
        if (
          trial.earned === undefined &&
          state.expired(exp.cfg.pointsWaitTime)
        ) {
          trial.earned = Math.round(
            exp.cfg.maxTrialPoints *
              (1 - truncQuadCost(trial.error / exp.cfg.errorForZeroPoints))
          );
          let startPosn = new Vector3();
          objects[trial.targetId].getWorldPosition(startPosn);
          let endPosn = startPosn.clone();
          let color;
          if (trial.earned === 0) {
            color = 'red';
          } else {
            color = 'white';
            endPosn.y += 0.1;
          }
          exp.points.add(trial.earned, true, {
            color: color,
            startPosn: startPosn,
            endPosn: endPosn,
          });
        }
        if (state.expired(exp.cfg.minDropWaitTime + trial.timePenalty)) {
          state.next(state.FINISH); // advance
        }
        break;
      }

      case state.FINISH: {
        // make sure all the data we need is in the trial object
        trial.size = [window.innerWidth, window.innerHeight];
        trial.points = exp.points.total;
        firebase.saveTrial(trial);
        state.next(state.ADVANCE);
        break;
      }

      case state.ADVANCE: {
        if (!trial.saveSuccessful) {
          // don't do anything until firebase save returns successful
          break;
        }

        // reset the objects
        MeshFactory.torus(carouselParams, carousel);
        MeshFactory.spring(springParams, springs[trial.targetId]);
        objects[trial.targetId].position.y = objects[trial.targetId].yInit;

        exp.nextTrial();
        if (exp.trialNumber < exp.numTrials) {
          state.next(state.SETUP);
        } else {
          firebase.recordCompletion();
          goodbye.updateGoodbye(firebase.uid, exp.points.text);
          // remember: threejs canvas doesn't have show() and hide()
          DisplayElement.hide(renderer.domElement);
          DisplayElement.hide(cssRenderer.domElement);
          Fullscreen.exitFullscreen();
          state.next(state.SURVEY);
        }
        break;
      }

      case state.SURVEY: {
        if (survey.hidden) {
          survey.show();
        }
        if (exp.surveysubmitted) {
          // we save the config object
          firebase.saveTrial(exp.cfg, 'survey');
          survey.hide();
          state.next(state.CODE);
        }
        break;
      }

      case state.CODE: {
        if (!survey.saveSuccessful) {
          // don't do anything until firebase save returns successful
          break;
        }
        if (goodbye.hidden) {
          goodbye.show();
        }
        break;
      }

      case state.FULLSCREEN: {
        if (exp.blocker.fullscreen.hidden) {
          exp.blocker.show('fullscreen');
        }
        if (exp.fullscreen.engaged) {
          exp.blocker.hide();
          state.pop();
        }
        break;
      }

      case state.POINTERLOCK: {
        if (exp.blocker.pointerlock.hidden) {
          exp.blocker.show('pointerlock');
        }
        if (exp.pointerlock.engaged) {
          exp.blocker.hide();
          state.pop();
        }
        break;
      }

      case state.DBCONNECT: {
        if (exp.blocker.connection.hidden) {
          exp.blocker.show('connection');
        }
        if (firebase.databaseConnected) {
          exp.blocker.hide();
          state.pop();
        }
        break;
      }
    }
  }

  function displayFunc(timestamp) {
    // Animate the spring oscillation
    if (state.current === state.DROP || state.current === state.FINISH) {
      let oldPosn = objects[trial.targetId].position.y;
      let newPosn = computeMassSpringDamperPosition(
        springOscillationTimer.elapsed(), // time since clamp release
        trial.error,
        trial.sp.gamma,
        trial.sp.Gamma,
        trial.sp.Omega,
        trial.sp.regime,
        objects[trial.targetId].yInit
      );
      // move the object
      objects[trial.targetId].position.y = newPosn;
      // stretch the spring by the distance of the movement
      trial.stretch += oldPosn - newPosn;
      MeshFactory.spring(
        { ...springParams, stretch: trial.stretch },
        springs[trial.targetId]
      );
    }

    tweenUpdate();
    renderer.render(scene, camera);
    cssRenderer.render(cssScene, camera);
    if (state.current > state.SETUP && state.current <= state.ADVANCE) {
      recordFrameData(timestamp);
    }
  }

  // Custom event handlers
  function updateSpringLength(event) {
    if (event.buttons && trial.clamped && state.current === state.PULL) {
      trial.stretch -= exp.cfg.springStretchSpeed * event.movementY;
      trial.stretch = clamp(trial.stretch, 0, exp.cfg.maxStretch);
      MeshFactory.spring(
        { ...springParams, stretch: trial.stretch },
        springs[trial.targetId]
      );
    }
  }

  function resetSpringLength() {
    if (trial.clamped) {
      // It would be nicer to animate this
      trial.stretch = 0;
      MeshFactory.spring(
        { ...springParams, stretch: trial.stretch },
        springs[trial.targetId]
      );
    }
  }

  function releaseClamp(event) {
    if (
      state.current === state.PULL &&
      trial.clamped &&
      trial.stretch !== 0 &&
      event.key === 'Shift'
    ) {
      // Here we set a flag instead of creating a state in the FSM
      // Allows immediate blocking of events that might be processed before the next rAF loop
      trial.clamped = false;
    }
  }

  function handleControllers(controller1, controller2) {
    if (
      controller1.userData.isSelecting &&
      trial.clamped &&
      state.current === state.PULL
    ) {
      recordControllerData();
      trial.stretch +=
        controller1.linearVelocity.y * controller1.userData.clock.getDelta();
      trial.stretch = clamp(trial.stretch, 0, exp.cfg.maxStretch);
      MeshFactory.spring(
        { ...springParams, stretch: trial.stretch },
        springs[trial.targetId]
      );
    }
    if (
      state.current === state.PULL &&
      trial.clamped &&
      trial.stretch !== 0 &&
      controller2.userData.isSelecting
    ) {
      trial.clamped = false;
    }
    if (
      trial.stretch > 0 &&
      !controller1.userData.isSelecting &&
      trial.clamped &&
      state.current === state.PULL
    ) {
      trial.stretch = 0;
      MeshFactory.spring(
        { ...springParams, stretch: trial.stretch },
        springs[trial.targetId]
      );
    }
  }

  function recordControllerData() {
    trial.t.push(performance.now());
    trial.posn_RH.push(controller1.position);
    trial.state.push(state.current);
  }

  // IMPORTANT: Modify to record what was actually displayed & when
  function recordFrameData(timestamp) {
    trial.tFrame.push(timestamp);
    trial.stateFrame.push(state.current);
    trial.stretchFrame.push(trial.stretch);
  }

  // Default event handlers
  function recordMouseMoveData(event) {
    if (event.target === document.body) {
      trial.t.push(event.timeStamp);
      trial.btn.push(event.buttons);
      trial.dx.push(event.movementX);
      trial.dy.push(-event.movementY);
      trial.state.push(state.current);
    }
  }

  function handleResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    // for consistent scene scale despite window dimensions (see also initScene)
    // camera.fov =
    //   (360 / Math.PI) *
    //   Math.atan(
    //     exp.cfg.tanFOV * (window.innerHeight / exp.cfg.windowHeight)
    //   );
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    cssRenderer.setSize(window.innerWidth, window.innerHeight);
  }

  function handleStateChange() {
    if (trial.stateChange) {
      state.numClicks = 0;
      //clickTimer.reset();
      trial.stateChange.push(state.current);
      trial.stateChangeTime.push(performance.now());
    }
  }

  function mainLoopFunc(timestamp) {
    if (exp.vrAllowed && exp.vrSupported) {
      renderer.setAnimationLoop(mainLoopFunc); // for VR
    } else {
      requestAnimationFrame(mainLoopFunc); // normal
    }

    stats.begin();
    calcFunc();
    stateFunc();
    displayFunc(timestamp);
    stats.end();
  }

  function addDefaultEventListeners() {
    document.body.addEventListener('keydown', (event) => {
      if (event.key === ' ') {
        let hint = document.getElementById('instruction-show-hide');
        if (instructions.collapsed) {
          instructions.expand();
          hint.textContent = 'hide';
        } else {
          instructions.collapse();
          hint.textContent = 'show';
        }
      }
    });

    document.body.addEventListener('consent', () => {
      console.log('document.body received consent event, signing in...');
      exp.consented = true;
    });

    document.body.addEventListener('surveysubmitted', (e) => {
      console.log(
        'document.body received surveysubmitted event, saving data...'
      );
      for (let [k, v] of Object.entries(e.detail.survey)) {
        exp[k] = v;
      }
      exp.surveysubmitted = true;
    });

    document.body.addEventListener('savesuccessful', (e) => {
      console.log('document.body received savesuccessful event, trial saved');
      if (e.detail === 'survey') {
        survey.saveSuccessful = true;
      } else {
        trial.saveSuccessful = true;
      }
    });

    document.body.addEventListener('dbconnect', () => {
      console.log('document.body received dbconnect event');
    });

    document.body.addEventListener('dbdisconnect', () => {
      console.log('document.body received dbdisconnect event');
    });

    document.body.addEventListener('enterfullscreen', () => {
      console.log('document.body received enterfullscreen event');
    });

    document.body.addEventListener('exitfullscreen', () => {
      console.log('document.body received exitfullscreen event');
    });

    document.body.addEventListener('enterpointerlock', () => {
      console.log('document.body received enterpointerlock event');
    });

    document.body.addEventListener('exitpointerlock', () => {
      console.log('document.body received exitpointerlock event');
    });
  }

  function initVR(renderer, scene) {
    renderer.xr.enabled = true;

    let vrButton = VRButton.createButton(renderer);
    // adjust css so it fits in flexbox at top
    vrButton.style.position = '';
    vrButton.style.marginTop = '10px';
    vrButton.style.order = 2; // center
    vrButton.addEventListener('click', () => {
      scene.background = exp.vrBackground;
      exp.vrEnabled = true;
    });
    document.getElementById('panel-container').appendChild(vrButton);

    // controllers
    let controller1 = renderer.xr.getController(1);
    controller1.addEventListener('selectstart', onSelectStart);
    controller1.addEventListener('selectend', onSelectEnd);
    controller1.addEventListener('connected', function (event) {
      this.add(buildController(event.data));
    });
    controller1.addEventListener('disconnected', function () {
      this.remove(this.children[0]);
    });
    controller1.name = 'controllerR';
    controller1.userData.clock = new Clock();
    scene.add(controller1);

    let controller2 = renderer.xr.getController(0);
    controller2.addEventListener('selectstart', onSelectStart);
    controller2.addEventListener('selectend', onSelectEnd);
    controller2.addEventListener('connected', function (event) {
      this.add(buildController(event.data));
    });
    controller2.addEventListener('disconnected', function () {
      this.remove(this.children[0]);
    });
    controller2.name = 'controllerL';
    scene.add(controller2);

    // The XRControllerModelFactory will automatically fetch controller models
    // that match what the user is holding as closely as possible. The models
    // should be attached to the object returned from getControllerGrip in
    // order to match the orientation of the held device.
    const controllerModelFactory = new XRControllerModelFactory();

    let controllerGrip1 = renderer.xr.getControllerGrip(0);
    controllerGrip1.add(
      controllerModelFactory.createControllerModel(controllerGrip1)
    );
    scene.add(controllerGrip1);

    let controllerGrip2 = renderer.xr.getControllerGrip(1);
    controllerGrip2.add(
      controllerModelFactory.createControllerModel(controllerGrip2)
    );
    scene.add(controllerGrip2);

    return [controller1, controller2];

    // // hand 1
    // hand1 = renderer.xr.getHand(0);
    // hand1.add(new OculusHandModel(hand1));
    // scene.add(hand1);
    // // hand 2
    // hand2 = renderer.xr.getHand(1);
    // hand2.add(new OculusHandModel(hand2));
    // scene.add(hand2);
  }
}

window.addEventListener('DOMContentLoaded', main);
