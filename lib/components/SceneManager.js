import {
  PerspectiveCamera,
  WebGLRenderer,
  Scene,
  Color,
  LineSegments,
  LineBasicMaterial,
  PMREMGenerator,
  sRGBEncoding,
  Vector3,
  OrthographicCamera,
  Group,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { BoxLineGeometry } from 'three/examples/jsm/geometries/BoxLineGeometry';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer';
import { DisplayElement } from './DisplayElement';
import { EXRLoader } from './EXRLoader';
import { PBRMapper } from './PBRMapper';
import { RoomEnvironment } from './RoomEnvironment';
import { required } from './utils';
import { World } from 'cannon-es';

/**
 * The SceneManager class handles critical three.js scene and cssScene setup (and contains cannon-es physicsWorld, if using).
 */
export class SceneManager {
  /**
   * three.js renderer for 3D scene
   * @type {WebGLRenderer}
   */
  renderer;
  /**
   * three.js renderer for overlaid CSS scene (created if `cfg.cssScene=true`)
   * @type {CSS2DRenderer}
   */
  cssRenderer;
  /**
   * cannon-es physics world. Must be instantiated in experiment code with `exp.sceneManager.physicsWorld = new World()`
   * @type {World}
   */
  physicsWorld;

  /**
   * Instantiate a new SceneManager. This is done by default in the `new Experiment()` constructor.
   * If you _really_ don't want a SceneManager in your Ouvrai experiment, you can specify `sceneManager: false` in your experiment configuration.
   */
  constructor({
    cfg = required('cfg'),
    toneMapping = 4, //ACESFilmicToneMapping;
    customHandleResize = false,
  }) {
    if (cfg.sceneManager === false) {
      return;
    }
    this.fixedAspect = cfg.fixedAspect;
    this.recentered = false;
    this.disableAutoRecenter = cfg.disableAutoRecenter;

    // Create the 3D renderer and a three.js scene
    this.renderer = new WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputEncoding = sRGBEncoding;
    this.renderer.toneMapping = toneMapping;
    document.getElementById('screen').appendChild(this.renderer.domElement);
    DisplayElement.hide(this.renderer.domElement);
    this.scene = new Scene();
    this.scene.background = new Color(cfg.backgroundColor);

    // Create the CSS renderer and scene (for overlaying 2D HTML elements like text and icons)
    if (cfg.cssScene) {
      this.cssRenderer = new CSS2DRenderer();
      this.cssRenderer.setSize(window.innerWidth, window.innerHeight);
      this.cssRenderer.domElement.style.position = 'absolute';
      document
        .getElementById('screen')
        .appendChild(this.cssRenderer.domElement);
      DisplayElement.hide(this.cssRenderer.domElement);
      this.cssScene = new Scene();
    }

    // Create the basic 3D wireframe backdrop
    if (cfg.gridRoom === true) {
      let room = new LineSegments(
        new BoxLineGeometry(6, 6, 6, 5, 5, 5).translate(0, 3, 0),
        new LineBasicMaterial({ color: 'black' })
      );
      this.scene.add(room);
    }

    // Add lighting using an environment map
    if (cfg.environmentLighting) {
      const pmremGenerator = new PMREMGenerator(this.renderer);
      if (cfg.environmentLighting.endsWith('.js')) {
        // Option 1: "Bake" lights from an existing Scene (e.g., RoomEnvironment.js)
        this.scene.environment = pmremGenerator.fromScene(
          new RoomEnvironment(0.5),
          0.04
        ).texture;
        pmremGenerator.dispose();
      } else if (
        // Option 2: Provide a .hdr or .exr image
        cfg.environmentLighting.endsWith('.exr') ||
        cfg.environmentLighting.endsWith('.hdr')
      ) {
        let envLoader;
        if (cfg.environmentLighting.endsWith('.exr')) {
          envLoader = new EXRLoader();
        } else {
          envLoader = new RGBELoader();
        }
        envLoader.load(cfg.environmentLighting, (texture) => {
          this.scene.environment =
            pmremGenerator.fromEquirectangular(texture).texture;
          pmremGenerator.dispose();
          texture.dispose();
        });
      }
    }

    if (cfg.orthographic) {
      this.camera = new OrthographicCamera(-1, 1, -1, 1, 0.01, 2);
      this.camera.frustumSize = 2; // bottom top = [-1, 1], left right = [-AR, AR]
      this.renderer.toneMapping = 1; // LinearMapping for better match to CSS colors
    } else {
      this.camera = new PerspectiveCamera(70, 1, 0.01, 10);
    }
    this.camera.position.set(0, 0, 1);

    // In VR, the `cameraGroup` allows us to automatically recenter the view (plus hands/controllers)
    if (cfg.requireVR) {
      // The purpose of the cameraGroup is to allow us to recenter the view
      this.cameraGroup = new Group();
      this.camera.position.set(0, 1.6, 1.5);
      this.cameraGroup.add(this.camera);
      this.scene.add(this.cameraGroup);
    } else {
      this.camera.position.set(0, 0, 1);
    }

    // Add resize listener
    let callback = (customHandleResize || this.handleResize).bind(this);
    window.addEventListener('resize', callback);
    callback();

    // Orbit controls
    if (cfg.devOptions?.orbitControls) {
      this.orbitControls = new OrbitControls(
        this.camera,
        this.cssRenderer?.domElement || this.renderer.domElement
      );
      let targ = cfg.homePosn ?? new Vector3();
      this.orbitControls.target.set(...targ);
      this.orbitControls.update();
      this.orbitControls.listenToKeyEvents(window); // enable arrow keys
      this.orbitControls.enableDamping = true;
      this.orbitControls.keys = {
        LEFT: 'KeyA', //'ArrowLeft',
        UP: 'KeyW', //'ArrowUp',
        RIGHT: 'KeyD', //'ArrowRight',
        BOTTOM: 'KeyS', //'ArrowDown'
      };
    }

    // Create texture loader
    this.pbrMapper = new PBRMapper();
  }

  /**
   * Window resize event handler. Updates the aspect ratio of the camera, projection matrix, and viewport.
   * Dispatches `cameraupdate` event to document.body, helpful if scene parameters must track current window size (see `touchscreen` template).
   */
  handleResize() {
    // For consistent scene scale despite varying window dimensions, try this:
    // 1. In constructor:
    // this.cfg.windowHeight = window.innerHeight || someFixedValue;
    // this.cfg.tanFOV = Math.tan(((Math.PI / 180) * this.camera.fov) / 2);
    // 2. In handleResize:
    // this.camera.fov =
    //   (360 / Math.PI) *
    //   Math.atan(
    //     this.cfg.tanFOV * (window.innerHeight / this.cfg.windowHeight)
    //   );
    this.camera.aspect =
      this.fixedAspect || window.innerWidth / window.innerHeight;
    if (this.camera.isOrthographicCamera) {
      this.camera.left = (-this.camera.frustumSize * this.camera.aspect) / 2;
      this.camera.right = (this.camera.frustumSize * this.camera.aspect) / 2;
      this.camera.top = this.camera.frustumSize / 2;
      this.camera.bottom = -this.camera.frustumSize / 2;
    }
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.cssRenderer?.setSize(window.innerWidth, window.innerHeight);
    document.body.dispatchEvent(new Event('cameraupdate'));
  }

  /**
   * Call `exp.sceneManager.render()` in your `displayFunc()` to update the scene, cssScene, and orbitControls (if using) on every frame.
   * Also performs automatic view recentering on the first render frame, unless `disableAutoRecenter: true` in experiment configuration.
   */
  render() {
    this.orbitControls?.update();
    this.renderer.render(this.scene, this.camera);
    this.cssRenderer?.render(this.cssScene, this.camera);
    if (
      !this.recentered &&
      !this.disableAutoRecenter &&
      this.renderer.xr.isPresenting
    ) {
      this.recenter();
    }
  }

  /**
   * Recenter the view, emulating a long-press of the Meta Quest (Oculus) button
   */
  recenter() {
    this.clearCameraOffset();
    // Get camera direction
    let camDir = this.camera.getWorldDirection(new Vector3());
    // Get camera angle with respect to world -Z
    let theta = Math.atan2(-camDir.x, -camDir.z);
    // Rotate camera group at origin so the camera faces down world -Z
    this.cameraGroup.rotateY(-theta);
    // Get XZ world vector that would bring the rotated camera to the origin
    let camVec = this.camera.getWorldPosition(new Vector3()).setY(0).negate();
    let len = camVec.length(); // store the non-normalized length
    // Transform XZ world vector into rotated camera group coordinates
    // Normalize in case it matters
    this.cameraGroup.worldToLocal(camVec).normalize();
    // Apply to cameraGroup
    this.cameraGroup.translateOnAxis(camVec, len);
    this.recentered = true;
  }

  /**
   * Reset the `cameraGroup` to the scene origin, looking down the +Z axis
   */
  clearCameraOffset() {
    // Clear
    this.cameraGroup.position.set(0, 0, 0);
    this.cameraGroup.lookAt(0, 0, 1);
  }
}
