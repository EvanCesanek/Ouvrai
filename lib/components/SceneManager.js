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
  AmbientLight,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { BoxLineGeometry } from 'three/examples/jsm/geometries/BoxLineGeometry';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer';
import { DisplayElement } from './DisplayElement';
import { EXRLoader } from './EXRLoader';
import { RoomEnvironment } from './RoomEnvironment';
import { required } from './utils';

export class SceneManager {
  constructor({
    cfg = required('cfg'),
    toneMapping = 4, //ACESFilmicToneMapping;
    customLights = [],
    customHandleResize = false,
  }) {
    if (cfg.sceneManager === false) {
      return;
    }
    this.fixedAspect = cfg.fixedAspect;

    // 1. Define renderer(s)
    this.renderer = new WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputEncoding = sRGBEncoding;
    this.renderer.toneMapping = toneMapping;
    document.getElementById('screen').appendChild(this.renderer.domElement);
    DisplayElement.hide(this.renderer.domElement);

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

    // 2. Create a scene
    this.scene = new Scene();
    this.scene.background = new Color(cfg.cssBackground);

    // Create a wireframe backdrop
    if (cfg.gridRoom === true || cfg.requireVR) {
      let room = new LineSegments(
        new BoxLineGeometry(6, 6, 6, 10, 10, 10).translate(0, 3, 0),
        new LineBasicMaterial({ color: 'black' })
      );
      this.scene.add(room);
    }

    // Add light using an environment map
    if (cfg.environmentLighting) {
      const pmremGenerator = new PMREMGenerator(this.renderer);
      if (cfg.environmentLighting.endsWith('.js')) {
        // Option 1: Provide a pre-built Scene object (see RoomEnvironment.js)
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

    // Add your own lights
    if (customLights.length > 0) {
      for (let l of customLights) {
        if (l.isLight) {
          this.scene.add(l);
        }
      }
    }

    if (!cfg.environmentLighting && customLights.length == 0) {
      this.scene.add(new AmbientLight('white', 1));
    }

    if (cfg.orthographic) {
      // 2. Define camera (if not added to scene, used as default by all renderers)
      this.camera = new OrthographicCamera(-1, 1, -1, 1, 0.01, 2);
      this.camera.frustumSize = 2; // bottom top = [-1, 1], left right = [-AR, AR]
    } else {
      this.camera = new PerspectiveCamera(70, 1, 0.01, 10);
    }
    if (cfg.requireVR) {
      this.camera.position.set(0, 1.6, 1.5);
    } else {
      this.camera.position.set(0, 0, 1);
    }
    this.scene.add(this.camera);

    // Add resize listener
    // for consistent scene scale despite window dimensions (see also handleResize):
    // tanFOV = Math.tan(((Math.PI / 180) * camera.fov) / 2);
    // windowHeight = window.innerHeight;
    let callback = (customHandleResize || this.handleResize).bind(this);
    window.addEventListener('resize', callback);
    callback();

    // Orbit controls
    if (cfg.orbitControls) {
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
        LEFT: 'KeyA', //'ArrowLeft', //left arrow
        UP: 'KeyW', //'ArrowUp', // up arrow
        RIGHT: 'KeyD', //'ArrowRight', // right arrow
        BOTTOM: 'KeyS', //'ArrowDown' // down arrow
      };
    }
  }

  handleResize() {
    this.camera.aspect =
      this.fixedAspect || window.innerWidth / window.innerHeight;
    // for consistent scene scale despite window dimensions (see also constructor...)
    // camera.fov =
    //   (360 / Math.PI) *
    //   Math.atan(
    //     this.cfg.tanFOV * (window.innerHeight / this.cfg.windowHeight)
    //   );
    if (this.camera.isOrthographicCamera) {
      this.camera.left = (-this.camera.frustumSize * this.camera.aspect) / 2;
      this.camera.right = (this.camera.frustumSize * this.camera.aspect) / 2;
      this.camera.top = this.camera.frustumSize / 2;
      this.camera.bottom = -this.camera.frustumSize / 2;
    }
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.cssRenderer?.setSize(window.innerWidth, window.innerHeight);
  }

  render() {
    this.orbitControls?.update();
    this.renderer.render(this.scene, this.camera);
    this.cssRenderer?.render(this.cssScene, this.camera);
  }
}
