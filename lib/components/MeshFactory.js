import {
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  BufferGeometry,
  Float32BufferAttribute,
  LineBasicMaterial,
  Line,
  AdditiveBlending,
  SpriteMaterial,
  Sprite,
} from 'three';
import { SpiralCurve } from './SpiralCurve';

const DEFAULT_MATERIAL = () => {
  return new MeshStandardMaterial();
};

function generateRayTexture({ gradientSteps = 64 }) {
  const canvas = document.createElement('canvas');
  canvas.width = gradientSteps;
  canvas.height = gradientSteps;

  const ctx = canvas.getContext('2d');

  const gradient = ctx.createLinearGradient(0, 0, gradientSteps, 0);
  gradient.addColorStop(0, 'black');
  gradient.addColorStop(1, 'white');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, gradientSteps, gradientSteps);

  return canvas;
}

function generatePointerTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;

  const ctx = canvas.getContext('2d');

  ctx.beginPath();
  ctx.arc(32, 32, 29, 0, 2 * Math.PI);
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.fillStyle = 'white';
  ctx.fill();

  return canvas;
}

export class MeshFactory {
  static spring(
    {
      majorRadius = 1,
      minorRadius = 0.15,
      numCoils = 7,
      stretch = 0,
      scale = 1,
      tubularSegments,
      radiusSegments,
      closed,
      material,
    },
    mesh // to modify (typically to stretch) an existing spring, receive a reference here
  ) {
    // constructor will fill in any missing params
    const path = new SpiralCurve({
      majorRadius,
      minorRadius,
      numCoils,
      stretch,
      scale,
    });
    const geometry = new TubeGeometry(
      path,
      tubularSegments,
      minorRadius,
      radiusSegments,
      closed // closed means connect to start, not end caps
    );
    if (mesh) {
      mesh.geometry.dispose();
      mesh.geometry = geometry;
    } else {
      if (!material) material = DEFAULT_MATERIAL();
      return new Mesh(geometry, material);
    }
  }

  static torus(
    {
      majorRadius,
      minorRadius,
      radialSegments,
      tubularSegments,
      arc,
      material,
    },
    mesh
  ) {
    const geometry = new TorusGeometry(
      majorRadius,
      minorRadius,
      radialSegments,
      tubularSegments,
      arc
    );
    if (mesh) {
      mesh.geometry.dispose();
      mesh.geometry = geometry;
    } else {
      if (!material) material = DEFAULT_MATERIAL();
      return new Mesh(geometry, material);
    }
  }

  static cylinder({
    radius,
    radiusTop,
    radiusBottom,
    height,
    radialSegments,
    heightSegments,
    openEnded,
    thetaStart,
    thetaLength,
    material,
  }) {
    const geometry = new CylinderGeometry(
      radiusTop || radius,
      radiusBottom || radius,
      height,
      radialSegments,
      heightSegments,
      openEnded,
      thetaStart,
      thetaLength
    );
    if (!material) material = DEFAULT_MATERIAL();
    return new Mesh(geometry, material);
  }

  // radius — sphere radius. Default is 1.
  // widthSegments — number of horizontal segments. Minimum value is 3, and the default is 32.
  // heightSegments — number of vertical segments. Minimum value is 2, and the default is 16.
  // phiStart — specify horizontal starting angle. Default is 0.
  // phiLength — specify horizontal sweep angle size. Default is Math.PI * 2.
  // thetaStart — specify vertical starting angle. Default is 0.
  // thetaLength — specify vertical sweep angle size. Default is Math.PI.
  static sphere({
    radius,
    widthSegments,
    heightSegments,
    phiStart,
    phiLength,
    thetaStart,
    thetaLength,
    material,
  }) {
    const geometry = new SphereGeometry(
      radius,
      widthSegments,
      heightSegments,
      phiStart,
      phiLength,
      thetaStart,
      thetaLength
    );
    if (!material) material = DEFAULT_MATERIAL();
    return new Mesh(geometry, material);
  }

  static cube({ width, height, depth, material }) {
    const geometry = new BoxGeometry(width, height, depth);
    if (!material) material = DEFAULT_MATERIAL();
    return new Mesh(geometry, material);
  }

  static xrPointerSimple({ length = 0.5 }) {
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      'position',
      new Float32BufferAttribute([0, 0, 0, 0, 0, -length], 3)
    );
    geometry.setAttribute(
      'color',
      new Float32BufferAttribute([0.5, 0.5, 0.5, 0, 0, 0], 3)
    );
    const material = new LineBasicMaterial({
      vertexColors: true,
      blending: AdditiveBlending,
    });
    return new Line(geometry, material);
  }

  static xrPointer({ gradientSteps = 64 }) {
    // https://github.com/felixmariotto/three-mesh-ui/blob/master/examples/utils/VRControl.js
    const material = new MeshBasicMaterial({
      color: 0xffffff,
      alphaMap: new CanvasTexture(
        generateRayTexture({ gradientSteps: gradientSteps })
      ),
      transparent: true,
    });
    const geometry = new BoxGeometry(0.004, 0.004, 0.35);
    geometry.translate(0, 0, -0.15);

    const uvAttribute = geometry.attributes.uv;
    for (let i = 0; i < uvAttribute.count; i++) {
      let u = uvAttribute.getX(i);
      let v = uvAttribute.getY(i);
      [u, v] = (() => {
        switch (i) {
          case 0:
            return [1, 1];
          case 1:
            return [0, 0];
          case 2:
            return [1, 1];
          case 3:
            return [0, 0];
          case 4:
            return [0, 0];
          case 5:
            return [1, 1];
          case 6:
            return [0, 0];
          case 7:
            return [1, 1];
          case 8:
            return [0, 0];
          case 9:
            return [0, 0];
          case 10:
            return [1, 1];
          case 11:
            return [1, 1];
          case 12:
            return [1, 1];
          case 13:
            return [1, 1];
          case 14:
            return [0, 0];
          case 15:
            return [0, 0];
          default:
            return [0, 0];
        }
      })();
      uvAttribute.setXY(i, u, v);
    }

    const linesHelper = new Mesh(geometry, material);
    linesHelper.renderOrder = Infinity;
    return linesHelper;
  }

  static xrPointerDot() {
    const spriteMaterial = new SpriteMaterial({
      map: new CanvasTexture(generatePointerTexture()),
      sizeAttenuation: false,
      depthTest: false,
    });

    const pointer = new Sprite(spriteMaterial);

    pointer.scale.set(0.015, 0.015, 1);
    pointer.renderOrder = Infinity;
    return pointer;
  }
}
