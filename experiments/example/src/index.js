/*** third-party imports ***/
import Stats from 'three/examples/jsm/libs/stats.module.js';
import GUI from 'three/examples/jsm/libs/lil-gui.module.min.js'; // https://lil-gui.georgealways.com/
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
//import { createText } from 'three/examples/jsm/webxr/Text2D.js';
import {
  Clock,
  Color,
  DoubleSide,
  Group,
  MeshStandardMaterial,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  sRGBEncoding,
  TextureLoader,
  Vector3,
  WebGLRenderer,
} from 'three';
import colormap from 'colormap'; // https://github.com/bpostlethwaite/colormap
import bowser from 'bowser';
import { range } from 'd3-array'; // https://www.npmjs.com/package/d3-array
import { Easing, Tween, update as tweenUpdate } from '@tweenjs/tween.js'; // https://github.com/tweenjs/tween.js/
import { models } from 'jstat-esm'; // https://jstat.github.io //https://www.npmjs.com/package/jstat-esm

/*** weblab imports ***/
import { Experiment } from './components/Experiment.js';
import { BlockOptions } from './components/BlockOptions.js';
import { State } from './components/State.js';
import { DisplayElement } from './components/DisplayElement.js';
import { CSS2D } from './components/CSS2D.js';
import { Survey } from './components/Survey.js';
import { Timer } from './components/Timer.js';
import { MeshFactory } from './components/MeshFactory.js';
import { PBRMapper } from './components/PBRMapper.js';
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

/*** static asset URL imports ***/
import consentURL from './consent.pdf';
// import sceneBackgroundURL from './environments/IndoorHDRI003_4K-TONEMAPPED.jpg';
import environmentLightingURL from './environments/IndoorHDRI003_1K-HDR.exr?url';

// import woodColorMapURL from './textures/Wood049_1K-JPG/Wood049_1K_Color.jpg';
// import woodDisplacementMapURL from './textures/Wood049_1K-JPG/Wood049_1K_Displacement.jpg';
// import woodNormalMapURL from './textures/Wood049_1K-JPG/Wood049_1K_NormalGL.jpg';
// import woodRoughnessMapURL from './textures/Wood049_1K-JPG/Wood049_1K_Roughness.jpg';
// import brassColorMapURL from './textures/Metal007_1K-JPG/Metal007_1K_Color.jpg';
// import brassDisplacementMapURL from './textures/Metal007_1K-JPG/Metal007_1K_Displacement.jpg';
// import brassNormalMapURL from './textures/Metal007_1K-JPG/Metal007_1K_NormalGL.jpg';
// import brassRoughnessMapURL from './textures/Metal007_1K-JPG/Metal007_1K_Roughness.jpg';
// import brassMetalnessMapURL from './textures/Metal007_1K-JPG/Metal007_1K_Metalness.jpg';
// import plasticColorMapURL from './textures/Plastic007_1K-JPG/Plastic007_1K_Color.jpg';
// import plasticDisplacementMapURL from './textures/Plastic007_1K-JPG/Plastic007_1K_Displacement.jpg';
// import plasticNormalMapURL from './textures/Plastic007_1K-JPG/Plastic007_1K_NormalGL.jpg';
// import plasticRoughnessMapURL from './textures/Plastic007_1K-JPG/Plastic007_1K_Roughness.jpg';
// import porcelainColorMapURL from './textures/Porcelain001_1K-JPG/Porcelain001_1K_Color.jpg';
// import porcelainDisplacementMapURL from './textures/Porcelain001_1K-JPG/Porcelain001_1K_Displacement.jpg';
// import porcelainNormalMapURL from './textures/Porcelain001_1K-JPG/Porcelain001_1K_NormalGL.jpg';
// import porcelainRoughnessMapURL from './textures/Porcelain001_1K-JPG/Porcelain001_1K_Roughness.jpg';
import leatherColorMapURL from './textures/Leather025_1K-JPG/Leather025_1K_Color.jpg';
import leatherDisplacementMapURL from './textures/Leather025_1K-JPG/Leather025_1K_Displacement.jpg';
import leatherNormalMapURL from './textures/Leather025_1K-JPG/Leather025_1K_NormalGL.jpg';
import leatherRoughnessMapURL from './textures/Leather025_1K-JPG/Leather025_1K_Roughness.jpg';

async function main() {
  // create new experiment with configuration options
  const exp = new Experiment({
    name: 'example',
    consentPath: consentURL,
    prolificLink: 'https://app.prolific.co/submissions/complete?cc=COOMA7DK', // Get completion link from Prolific study details
    requireDesktop: true,
    requireChrome: true,
    vrAllowed: false,

    cssBackground: 'dimgray', // color name string: http://davidbau.com/colors/

    // Experiment-specific quantities
    // Assume meters and seconds for three.js, but note tween.js uses milliseconds
    gravity: 9.81,
    springConstant: 100,
    springDamping: 3,
    springStretchSpeed: 0.0005, // i.e. 1 px mousemove = 0.5 mm stretch
    maxStretch: 0.1,
    targetWidth: 0.035,

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
    //timePenaltyAbsDecay: 0.0005, // wait until decaying to this spring oscillation envelope magnitude

    environmentLighting: environmentLightingURL,
    //sceneBackground: sceneBackgroundURL,
    textureName: 'leather',
  });

  // Create finite state machine (experiment flow manager)
  exp.cfg.stateNames = [
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
    'ATTENTION',
    'BLOCKED',
  ];
  const state = new State(exp.cfg.stateNames, handleStateChange);
  // In which states must we prompt FS / PL?
  exp.fullscreenStates = exp.pointerlockStates = [
    'POINTERLOCK',
    'SETUP',
    'START',
    'CAROUSEL',
    'PULL',
    'DROP',
    'FINISH',
    'ADVANCE',
    'ATTENTION',
  ].map((s) => state[s]);

  // Create any customizable elements
  const survey = new Survey(); // here we use the default demographic survey
  const instructions = new DisplayElement({
    element: `
    <div id="instruction-detail" class="panel-detail collapsible">
      1. Click and drag up to stretch the spring on the current object.<br />
      2. Press Space (or Shift) to release the object from the ring.<br />
      Stretch the spring to perfectly support each object's weight.<br />
      The objects should not move up or down when they are released!<br />
    </div>`,
    hide: false,
    display: 'block',
    parent: document.getElementById('instruction-panel'),
  });
  instructions.dom.style.height = 0;
  document.getElementById('instruction-show-hide').innerText = 'show';
  instructions.collapsed = true;

  const demoTrialText = new CSS2D('');
  demoTrialText.object.element.style.fontSize = '14pt';

  // Add listeners for default weblab events
  addDefaultEventListeners();

  // set debug options
  let gui = new GUI({
    width: 150,
    title: 'Debug',
    container: document.getElementById('panel-container'),
  });
  gui.hide();
  //gui.close();
  //gui.add(exp, 'trialNumber').listen().disable();
  if (location.hostname === 'localhost') {
    // exp.consented = true;
    // exp.fullscreenStates = [];
    // exp.pointerlockStates = [];
  } else {
    gui.hide();
    console.log = function () {}; // disable in production
  }
  const stats = new Stats(); // performance monitor
  stats.showPanel(0); // 0: fps, 1: ms, 2: mb, 3+: custom
  document.body.appendChild(stats.dom);

  // on each trial, this trial object will be deep-copied from exp.trials[exp.trialNumber]
  let trial = {};
  // declare all values that must be specifically re-initialized on each trial
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

    // coalesced pointer events
    // dxCo: [],
    // dyCo: [],
    // tCo: [],
    // stateCo: [],

    // state change events
    stateChange: [],
    stateChangeTime: [],
  };
  trial = trialInitialize;

  // Create a history object to allow computing performance metrics via OLS
  exp.history = { x: [], y: [], cycle: [], p: -1, slope: -1 };
  gui.add(exp.history, 'p').listen();
  gui.add(exp.history, 'slope').listen();

  // Set up the targets
  // Baseline condition = 1: Four family objects, outlier after 10 reps, linear family, no noise, equal presentation frequencies, permanence
  exp.cfg.targetIds = [0, 1, 2, 3, 4];
  exp.cfg.targetWeights = [0.3, 0.4, 0.8, 0.6, 0.7];
  exp.cfg.targetHeights = [0.05, 0.06, 0.07, 0.08, 0.09];
  exp.cfg.noisyWeights = false;
  //exp.cfg.timeLimit = Infinity;

  let colors = colormap({
    colormap: 'viridis',
    nshades: 9,
    format: 'hex',
    alpha: 1,
  });
  exp.materials = [];
  for (let oi of exp.cfg.targetIds) {
    let col = new Color(colors[4]);
    let tmp = col.getHSL({});
    tmp.l = 0.2; // enforce equal luminance
    col.setHSL(tmp.h, tmp.s, tmp.l);
    exp.materials[oi] = new MeshStandardMaterial({
      color: col,
    });
  }

  // Condition-specific settings
  // Condition 0: Outlier from start, 20 reps (note: requires change to blocks = {})
  //exp.cfg.condition = 0;

  exp.cfg.condition = 0;

  // Unique colors
  if (
    exp.cfg.condition === 2 ||
    exp.cfg.condition === 4 ||
    exp.cfg.condition === 5
  ) {
    for (let oi of exp.cfg.targetIds) {
      let col = new Color(colors[oi * 2]);
      let tmp = col.getHSL({});
      tmp.l = 0.3; // enforce equal luminance
      col.setHSL(tmp.h, tmp.s, tmp.l);
      exp.materials[oi] = new MeshStandardMaterial({
        color: col,
      });
    }
  }
  // Graded colors
  if (exp.cfg.condition === 2.5) {
    let colors = colormap({
      colormap: 'viridis',
      nshades: 13,
      format: 'hex',
      alpha: 1,
    });
    for (let oi of exp.cfg.targetIds) {
      let col = new Color(colors[7 - oi]);
      let tmp = col.getHSL({});
      tmp.l = 0.3; // enforce equal luminance
      col.setHSL(tmp.h, tmp.s, tmp.l);
      exp.materials[oi] = new MeshStandardMaterial({
        color: col,
      });
    }
  }
  // Two family objects
  if (exp.cfg.condition === 3) exp.cfg.targetIds = [1, 2, 3];
  // Different colors + noise
  if (exp.cfg.condition === 4) exp.cfg.noisyWeights = true;
  gui.add(exp.cfg, 'noisyWeights').disable;
  // Different colors + sigmoidal family (family = two densities)
  if (exp.cfg.condition === 5)
    exp.cfg.targetWeights = [0.3, 0.32, 0.8, 0.68, 0.7];
  // Different colors + disappearing from view
  if (exp.cfg.condition === 6) {
    exp.cfg.oneByOne = true;
    exp.cfg.carouselRotationSpeed /= 1.5;
  }
  // 4x outlier frequency
  if (exp.cfg.condition === 7) exp.cfg.targetIds = [0, 1, 2, 2, 2, 3, 4];
  // Time limit of 1.5 seconds
  //if (exp.cfg.condition === 8) exp.cfg.timeLimit = 1.5;

  // Create trial structure using an array of block objects (in desired order)
  let blocks = [
    // The keys of a block object are the variables, the values must be equal-length arrays
    // The combination of elements at index i are the variable values for one trial
    {
      targetId: exp.cfg.condition === 3 ? [1, 3] : [0, 1, 3, 4],
      // BlockOptions control trial sequencing behavior
      options: new BlockOptions(
        'train',
        true,
        exp.cfg.condition === 0 ? 0 : exp.cfg.condition === 3 ? 20 : 10,
        ['targetId']
      ),
    },
    {
      targetId: [...exp.cfg.targetIds],
      options: new BlockOptions(
        'test',
        true,
        exp.cfg.condition === 0 || exp.cfg.condition === 3
          ? 20
          : exp.cfg.condition === 7
          ? 9
          : 12,
        ['targetId']
      ),
    },
  ];
  exp.createTrialSequence(blocks); // construct the exp.trials object array

  //
  const springOscillationTimer = new Timer();
  const idleTimer = new Timer();

  // Create threejs scene (1 unit = 1 meter, RH coordinate space)
  let [
    camera,
    scene,
    renderer,
    cssScene,
    cssRenderer,
    controller1,
    controller2,
  ] = await initScene(environmentLightingURL);

  // Add CSS2D objects to cssScene
  cssScene.add(exp.points.css2d.object);
  cssScene.add(demoTrialText.object);

  // Prepare texture loader
  const pbrMapper = new PBRMapper();

  // Compute some scene parameters
  exp.cfg.numObjects = new Set(exp.cfg.targetIds).size; // Set(array) gives unique elements
  exp.cfg.targetOrder = range(exp.cfg.numObjects); //shuffle(range(exp.cfg.numObjects));

  // Create carousel
  const carouselParams = {
    majorRadius: exp.cfg.oneByOne ? 0.6 : 0.2,
    minorRadius: 0.003,
    tubularSegments: 200,
    radialSegments: 12,
  };
  let carousel = MeshFactory.torus(carouselParams);
  // If using VR, remember to set positions in room space (floor origin)
  carousel.position.z = -1.0;
  carousel.position.y = 1.5;
  // Torus is initially oriented in XY plane, so tilt it back
  carousel.rotation.x = Math.PI / 2;
  // Then rotate CCW by half of the gap to center it on the origin
  exp.cfg.carouselGap =
    1.5 * 2 * Math.tan(exp.cfg.targetWidth / carouselParams.majorRadius);
  carousel.rotation.z = exp.cfg.carouselGap / 2;
  carousel.material.color = new Color('black');
  carousel.material.side = DoubleSide;
  scene.add(carousel);

  // Create spring template
  const springParams = {
    majorRadius: 0.01,
    minorRadius: 0.01 / 7,
    numCoils: 7,
    tubularSegments: 120,
  };
  const springRing = MeshFactory.torus({
    majorRadius: 0.01,
    minorRadius: 0.01 / 7,
    tubularSegments: 24,
  });
  springRing.rotation.x = -Math.PI / 2;
  const carouselOuterSegment = MeshFactory.torus({
    majorRadius: exp.cfg.oneByOne ? 0.6 : 0.2,
    minorRadius: carouselParams.minorRadius * 1.2,
    tubularSegments: 40,
    radialSegments: 12,
    arc: Math.PI / exp.cfg.numObjects,
  });
  carouselOuterSegment.material.color = new Color('gray');
  carouselOuterSegment.rotation.x = Math.PI / 2;
  carouselOuterSegment.rotation.z = (0.5 * Math.PI) / exp.cfg.numObjects;
  carouselOuterSegment.position.y -= carouselParams.minorRadius * 2;

  // Create object group, centered at the carousel
  const objectGroup = new Group();
  objectGroup.position.copy(carousel.position);
  objectGroup.position.y += carouselParams.minorRadius * 2; // for cylinders
  scene.add(objectGroup);

  demoTrialText.object.position.copy(carousel.position);
  demoTrialText.object.position.y += 0.2;

  // Arrange object+spring around the object group
  const objects = [];
  const springs = [];
  for (let [oi, objid] of Array.from(new Set(exp.cfg.targetIds)).entries()) {
    // Create objects
    let obji = MeshFactory.cylinder({ radialSegments: 64 });
    obji.material = exp.materials[objid];
    objectGroup.add(obji);
    let cari = carouselOuterSegment.clone();
    if (!exp.cfg.oneByOne) objectGroup.add(cari);
    let spring = MeshFactory.spring(springParams);
    let ringi = springRing.clone();
    obji.add(ringi);
    obji.add(spring);
    // Save references in arrays
    springs[objid] = spring;
    objects[objid] = obji;

    // Distribute objects around the carousel (CW from RHS origin)
    let theta = ((2 * Math.PI) / exp.cfg.numObjects) * exp.cfg.targetOrder[oi]; // oi = count, not id
    let x = exp.cfg.oneByOne ? 0 : carouselParams.majorRadius * Math.cos(theta);
    let z = exp.cfg.oneByOne ? 0 : carouselParams.majorRadius * Math.sin(theta);
    // Store the initial y position (this is wrt objectGroup)
    obji.yInit = -exp.cfg.targetHeights[objid] / 2;
    // Store the carousel angle
    obji.carouselAngle = theta;
    obji.position.x = x;
    obji.position.y = obji.yInit;
    obji.position.z = z;
    //obji.rotation.y = theta;
    cari.rotation.z += theta;
    obji.scale.x = exp.cfg.targetWidth;
    obji.scale.y = exp.cfg.targetHeights[objid];
    obji.scale.z = exp.cfg.targetWidth;
    // put the spring on top (in local space, 1 y-unit = full object height)
    ringi.position.y = 0.5;
    spring.position.y = 0.5;
    // springs are manufactured at the correct absolute size, so undo the parent scaling
    ringi.scale.set(1 / obji.scale.x, 1 / obji.scale.z, 1 / obji.scale.y); // z and y swapped due to prior x-rotation
    spring.scale.set(1 / obji.scale.x, 1 / obji.scale.y, 1 / obji.scale.z);

    spring.material.color = new Color('slategray');
    spring.material.roughness = 0.3;
    spring.material.metalness = 1;
    ringi.material.copy(spring.material);
  }

  // Set objects material
  pbrMapper.applyNewTexture(
    objects,
    'leather',
    [
      leatherColorMapURL,
      leatherDisplacementMapURL,
      leatherNormalMapURL,
      leatherRoughnessMapURL,
    ],
    1 / exp.cfg.targetWidth,
    0.2 / Math.min(...exp.cfg.targetHeights.slice(exp.cfg.targetIds[0]))
  );

  // Position the camera to look at the home position (i.e. origin: (1,0,0))
  let offset;
  if (exp.cfg.oneByOne) {
    carousel.rotation.z += Math.PI;
    objectGroup.rotation.y += Math.PI;
    offset = new Vector3(-carouselParams.majorRadius, 0, 0);
  } else {
    offset = new Vector3(carouselParams.majorRadius, 0, 0);
  }
  let tmp = new Vector3().copy(carousel.position).add(offset);
  camera.position.set(...new Vector3(0.4, 0.12, 0).add(tmp));
  camera.lookAt(...new Vector3(0, 0, 0).add(tmp));

  // Start the rAF loop
  mainLoopFunc(); // calcFunc() -> stateFunc() -> displayFunc()

  function mainLoopFunc(timestamp) {
    if (exp.vrAllowed && exp.vrSupported) {
      renderer.setAnimationLoop(mainLoopFunc); // VR
    } else {
      requestAnimationFrame(mainLoopFunc); // normal rAF
    }

    stats.begin();
    calcFunc();
    stateFunc();
    displayFunc(timestamp);
    stats.end();
  }

  function calcFunc() {
    if (exp.vrEnabled) {
      handleControllers(controller1, controller2);
    }
  }

  function stateFunc() {
    // Process interrupt flags (FS & PL, add exp.pause?) as needed
    if (!exp.firebase.databaseConnected) {
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
          exp.firebase.signInAnonymously();
          state.next(state.SIGNIN);
        }
        if (exp.consent.hidden) {
          exp.consent.show();
        }
        break;
      }

      case state.SIGNIN: {
        if (exp.firebase.uid) {
          exp.consent.hide();
          // regular dom elements don't have show() and hide()
          DisplayElement.show(renderer.domElement);
          DisplayElement.show(cssRenderer.domElement);
          DisplayElement.show(document.getElementById('panel-container'));
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
        trial.demoTrial = exp.trialNumber === 0 || exp.repeatDemoTrial;
        trial.clamped = true;
        trial.carouselRotated = false;
        trial.stretch = 0;
        trial.massNoise = exp.cfg.noisyWeights * (0.3 * Math.random() - 0.15);
        trial.mass = exp.cfg.targetWeights[trial.targetId] + trial.massNoise;
        console.log(trial.mass);
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

        // Attention checks at ~25, 50 and 75% completion
        if (
          trial.trialNumber > 0 &&
          trial.trialNumber % Math.ceil(exp.numTrials / 4) === 0 &&
          ((exp.cfg.condition !== 3 && exp.history.p > 0.01) ||
            exp.history.slope < 0.5) // attention check parameters
        ) {
          state.next(state.ATTENTION);
        } else {
          state.next(state.START);
        }
        break;
      }

      case state.START: {
        // plan carousel movement such that ITI = delay + duration
        const startAngle = objectGroup.rotation.y;
        // Rotations go positive CCW, but positioning loop (cos,y,sin) was positive CW
        // So rotating the group by obji.carouselAngle should put obji at the origin (1,0,0)
        let targetAngle = objects[trial.targetId].carouselAngle;
        let dir = 0;
        if (exp.cfg.oneByOne) {
          // in the one-by-one (non-permanent) condition, put the new object
          // behind the camera (but a little less to make sure it comes from the left)
          targetAngle = startAngle - Math.PI;
          let x = carouselParams.majorRadius * -Math.cos(targetAngle);
          let z = carouselParams.majorRadius * Math.sin(targetAngle);
          objects[trial.targetId].position.x = x;
          objects[trial.targetId].position.z = z;
          dir = 1;
        }
        let distance;
        [targetAngle, distance] = rotationHelper(startAngle, targetAngle, dir);
        let duration = distance / exp.cfg.carouselRotationSpeed;
        // if (distance < Math.PI && exp.cfg.ITI < duration) {
        //   exp.cfg.carouselRotationSpeed = distance / (exp.cfg.ITI * 0.95);
        //   console.warn(
        //     `Configured ITI too short to complete movement at configured carousel speed. Carousel speed increased to ${exp.cfg.carouselRotationSpeed}`
        //   );
        //   duration = distance / exp.cfg.carouselRotationSpeed;
        // }
        let delay = Math.max(0, exp.cfg.ITI - duration);
        new Tween(objectGroup.rotation)
          .easing(Easing.Sinusoidal.InOut)
          .to({ y: targetAngle }, duration)
          .delay(delay)
          .onComplete(() => {
            trial.carouselRotated = true;
            if (exp.cfg.oneByOne) {
              for (let [id, obji] of objects.entries()) {
                if (id !== trial.targetId) {
                  obji.position.x = 0;
                  obji.position.z = 0;
                }
              }
            }
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
        if (trial.demoTrial) {
          if (trial.stretch === 0) {
            demoTrialText.object.element.innerText = `Each of these objects weighs a different amount.
              The spring on top is used to support the weight of the object.
              Click and drag upward to stretch the spring.
            `;
          } else {
            demoTrialText.object.element.innerText = `The more you stretch the spring, the harder it pulls on the object.
              Right now the object is clamped in place by the ring, so it can't move.
              When you are ready, press Space (or Shift) to release the object from the ring.
              You can let go of the mouse button after you release the object.
            `;
          }
        }
        if (!trial.clamped) {
          document.body.removeEventListener('mousemove', recordMouseMoveData);
          document.body.removeEventListener('mousemove', updateSpringLength);
          document.body.removeEventListener('mouseup', resetSpringLength);
          document.body.removeEventListener('keydown', releaseClamp);
          // Modify carousel geometry to create the cutout
          // again animation would be better... (three arcs, two thinner slide out into thicker ring)
          let arcLength = 2 * Math.PI - exp.cfg.carouselGap;
          //(2 * Math.PI * (exp.cfg.numObjects - 1)) / exp.cfg.numObjects;
          MeshFactory.torus({ ...carouselParams, arc: arcLength }, carousel);

          // Compute trial results
          trial.error = trial.stretch - trial.correct;
          if (trial.targetId !== 2 && trial.trialNumber > 0) {
            exp.history.x.push([1, trial.correctWithoutNoise]);
            exp.history.y.push(trial.stretch);
            exp.history.cycle.push(trial.cycle);
            if (trial.cycle > 0) {
              let endog = exp.history.y.filter(
                (_, i) => exp.history.cycle[i] > trial.cycle - 10
              );
              let exog = exp.history.x.filter(
                (_, i) => exp.history.cycle[i] > trial.cycle - 10
              );
              exp.history.model = models.ols(endog, exog);
              exp.history.p = exp.history.model.t.p[1];
              exp.history.slope = exp.history.model.coef[1];
            }
          }

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

          if (trial.demoTrial) {
            if (trial.error > 0.015) {
              demoTrialText.object.element.innerText = `You applied too much force so the object was pulled up.
              Next time you see this object, stretch the spring less.
              Try to make each object stay perfectly still.
              
            `;
            } else if (trial.error < -0.015) {
              demoTrialText.object.element.innerText = `You applied too little force so the object fell down.
              Next time you see this object, stretch the spring more.
              Try to make each object stay perfectly still.
              
            `;
            } else {
              demoTrialText.object.element.innerText = `
              Good job!
              Try to make each object stay perfectly still.
              
            `;
            }
            setTimeout(() => {
              demoTrialText.object.element.innerText =
                demoTrialText.object.element.innerText.slice(0, -1);
              demoTrialText.object.element.innerText +=
                'Press Enter to continue (or press D to repeat the demo).';
              document.body.addEventListener('keydown', pressEnterToContinue);
            }, 2000);
            exp.awaitingPressEnter = true;
          }
        }
        if (state.expired(exp.cfg.minDropWaitTime + trial.timePenalty)) {
          if (!exp.awaitingPressEnter) {
            state.next(state.FINISH); // advance
          }
        } else {
          let progress =
            (100 * state.elapsed()) /
            (exp.cfg.minDropWaitTime + trial.timePenalty);
          document.getElementById('loadingbar').style.width = progress + '%';
        }
        break;
      }

      case state.FINISH: {
        // make sure all the data we need is in the trial object
        trial.size = [window.innerWidth, window.innerHeight];
        trial.points = exp.points.total;
        exp.firebase.saveTrial(trial);
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
          exp.firebase.recordCompletion();
          exp.goodbye.updateGoodbye(exp.firebase.uid);
          // remember: threejs canvas doesn't have show() and hide()
          DisplayElement.hide(renderer.domElement);
          DisplayElement.hide(cssRenderer.domElement);
          exp.fullscreen.exitFullscreen();
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
          exp.firebase.saveTrial(exp.cfg, 'survey');
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
        if (exp.goodbye.hidden) {
          exp.goodbye.show();
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
        if (exp.firebase.databaseConnected) {
          exp.blocker.hide();
          state.pop();
        }
        break;
      }

      case state.ATTENTION: {
        if (exp.blocker.attention.hidden) {
          exp.blocker.show('attention');
          document.body.addEventListener('keydown', pressEnterToContinue);
          exp.awaitingPressEnter = true;
        }
        if (!exp.awaitingPressEnter) {
          exp.blocker.hide();
          state.next(state.START);
        }
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
    exp.idle = idleTimer.elapsed() >= 0.5;
    if (
      state.current == state.PULL &&
      //state.current <= state.FINISH &&
      !exp.idle
    ) {
      recordFrameData(timestamp);
    }
  }

  // Custom event handlers
  function updateSpringLength(event) {
    if (event.buttons && trial.clamped && state.current === state.PULL) {
      if (demoTrialText && trial.stretch === 0 && event.movementY < 0) {
        demoTrialText.object.element.style.display = 'none';
        // setTimeout(
        //   () => (demoTrialText.object.element.style.display = 'block'),
        //   1000
        // );
      }
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
    console.log(event.key);
    if (
      state.current === state.PULL &&
      trial.clamped &&
      trial.stretch !== 0 &&
      (event.key === 'Shift' || event.key === ' ')
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

  // function advanceDemoTrialText(event) {
  //   if (
  //     demoTrialText &&
  //     demoTrialText.text[state.names[state.current]] &&
  //     (!event ||
  //       (event.key === ' ' &&
  //         !event.repeat &&
  //         state.demoTrialTextProgress <
  //           demoTrialText.text[state.names[state.current]].length - 1))
  //   ) {
  //     console.log(state.demoTrialTextProgress);
  //     state.demoTrialTextProgress++;
  //     demoTrialText.object.element.innerText = demoTrialText.text[
  //       state.names[state.current]
  //     ]
  //       .slice(0, state.demoTrialTextProgress)
  //       .join('\n');
  //   }
  // }

  // IMPORTANT: Modify to record what was actually displayed & when
  function recordFrameData(timestamp) {
    trial.tFrame.push(timestamp);
    if (exp.exitIdling) {
      trial.exitIdleFrame.push(trial.tFrame.length);
      exp.exitIdling = false;
    }
    trial.stateFrame.push(state.current);
    trial.stretchFrame.push(trial.stretch);
  }

  // Default event handlers
  function recordMouseMoveData(event) {
    if (event.target === document.body) {
      idleTimer.reset();
      exp.exitIdle = exp.idle;
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
      if (demoTrialText) {
        demoTrialText.object.element.innerText = '';
      }
      //clickTimer.reset();
      trial.stateChange.push(state.current);
      trial.stateChangeTime.push(performance.now());
    }
  }

  function toggleInstructions() {
    let hint = document.getElementById('instruction-show-hide');
    if (!instructions.transitioning) {
      if (instructions.collapsed) {
        instructions.expand();
        hint.textContent = 'hide';
      } else {
        instructions.collapse();
        hint.textContent = 'show';
      }
    }
  }

  function pressEnterToContinue(e) {
    if (e.key === 'Enter') {
      document.body.removeEventListener('keydown', pressEnterToContinue);
      exp.awaitingPressEnter = false;
      exp.repeatDemoTrial = false;
    }
    if (e.key.toLowerCase() === 'd') {
      document.body.removeEventListener('keydown', pressEnterToContinue);
      exp.awaitingPressEnter = false;
      exp.repeatDemoTrial = true;
    }
  }

  function addDefaultEventListeners() {
    document.body.addEventListener('keydown', (event) => {
      if (event.key === 'i' && !event.repeat) {
        toggleInstructions();
      }
    });

    if (location.hostname === 'localhost') {
      document.body.addEventListener('keydown', (event) => {
        if (event.key === 'S') {
          exp.firebase.localSave();
        }
      });
    }

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

  async function initScene(environmentLightingURL = '') {
    // 0. Define renderer(s)
    let renderer = new WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    //renderer.physicallyCorrectLights = true;
    renderer.outputEncoding = sRGBEncoding;
    renderer.toneMapping = 4; //ACESFilmicToneMapping;
    gui.add(renderer, 'toneMapping', [0, 3, 4]);

    // 1. Create a scene
    let scene = new Scene();
    // Default background matches CSS background
    scene.background = new Color(exp.cfg.cssBackground);

    // Add your own lights
    //const light = new AmbientLight('white', 0.3);
    //scene.add(light);
    //const directionalLight = new DirectionalLight('white', 1.2);
    //directionalLight.position.set(-2, 100, 2);
    //scene.add(directionalLight);

    // Add light using an environment map
    const pmremGenerator = new PMREMGenerator(renderer);
    if (environmentLightingURL.endsWith('.js')) {
      // Option 1: Provide a pre-built Scene object (see RoomEnvironment.js)
      const module = import('./components/RoomEnvironment.js');
      scene.environment = pmremGenerator.fromScene(
        new module.RoomEnvironment(0.5),
        0.04
      ).texture;
      pmremGenerator.dispose();
    } else if (
      // Option 2: Provide a .hdr or .exr image
      environmentLightingURL.endsWith('.exr') ||
      environmentLightingURL.endsWith('.hdr')
    ) {
      let envLoader;
      if (environmentLightingURL.endsWith('.exr')) {
        const module = await import('./components/EXRLoader.js');
        envLoader = new module.EXRLoader();
      } else {
        const module = await import('three/examples/jsm/loaders/RGBELoader.js');
        envLoader = new module.RGBELoader();
      }
      envLoader.load(environmentLightingURL, (texture) => {
        scene.environment = pmremGenerator.fromEquirectangular(texture).texture;
        pmremGenerator.dispose();
        texture.dispose();
      });
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
    if (navigator.xr) {
      exp.cfg.vrSupported = await navigator.xr.isSessionSupported(
        'immersive-vr'
      );
      if (exp.cfg.vrAllowed && exp.cfg.vrSupported) {
        //exp.fullscreenStates = exp.pointerlockStates = [];
        [controller1, controller2] = await initVR(renderer, scene);
        console.log(controller1);
        console.log(controller2);
      }
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

    // 5. Add resize listener
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

  async function initVR(renderer, scene) {
    renderer.xr.enabled = true;

    let module = await import('three/examples/jsm/webxr/VRButton.js');
    let vrButton = module.VRButton.createButton(renderer);
    // adjust css so it fits in flexbox at top
    vrButton.style.position = '';
    vrButton.style.marginTop = '10px';
    vrButton.style.order = 2; // center
    vrButton.addEventListener('click', () => {
      loadBackground(exp.cfg.sceneBackgroundURL, scene);
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
    module = await import(
      'three/examples/jsm/webxr/XRControllerModelFactory.js'
    );
    const controllerModelFactory = new module.XRControllerModelFactory();

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

    // HANDS
    // module = await import('three/examples/jsm/webxr/OculusHandModel.js');
    // // hand 1
    // hand1 = renderer.xr.getHand(0);
    // hand1.add(new module.OculusHandModel(hand1));
    // scene.add(hand1);
    // // hand 2
    // hand2 = renderer.xr.getHand(1);
    // hand2.add(new module.OculusHandModel(hand2));
    // scene.add(hand2);
  }

  function loadBackground(sceneBackgroundURL, scene) {
    // Load a custom background
    if (sceneBackgroundURL && sceneBackgroundURL.endsWith('.jpg')) {
      const loader = new TextureLoader();
      loader.load(sceneBackgroundURL, (texture) => {
        const generator = new PMREMGenerator(renderer);
        texture = generator.fromEquirectangular(texture).texture;
        scene.background = texture;
        texture.dispose();
        generator.dispose();
      });
    }
  }
}

window.addEventListener('DOMContentLoaded', main);
