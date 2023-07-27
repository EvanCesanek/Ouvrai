import {
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  TubeGeometry,
  LineBasicMaterial,
  EdgesGeometry,
  LineSegments,
  RingGeometry,
  Curve,
  BufferGeometry,
  Vector3,
  Line,
  // DoubleSide,
} from 'three';
// import auraAlphaMapURL from '../textures/VerticalFade_Opacity.jpg';
// import ringAlphaMapURL from '../textures/RadialFade_Opacity.jpg';

const DEFAULT_MATERIAL = () => {
  //return new MeshBasicMaterial();
  return new MeshStandardMaterial();
};

/**
 * This class generates Meshes that are more complicated than `new Mesh(new Geometry(), new Material())`
 */
export class MeshFactory {
  /**
   * Create or modify a spring object.
   * @param {Object} p
   * @param {Number} p.majorRadius Radius of the spring (default 1)
   * @param {Number} p.minorRadius Radius of the tube (default 0.15)
   * @param {Number} p.numCoils Number of coils (default 7)
   * @param {Number} p.stretch Stretch length in meters (default 0 = coils touching)
   * @param {Number} p.scale Default 1
   * @param {Number} p.tubularSegments Number of segments around the tube
   * @param {Number} p.radiusSegments Number of segments along the coils
   * @param {Material} p.material Material
   * @param {Mesh} p.mesh To update geometry only, provide existing spring object (faster than re-creating during continuous stretching)
   * @returns {Mesh}
   */
  static spring({
    majorRadius = 1,
    minorRadius = 0.15,
    numCoils = 7,
    stretch = 0,
    scale = 1,
    tubularSegments,
    radiusSegments,
    material,
    mesh,
  }) {
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
      false // springs are not closed loops
    );
    if (mesh) {
      mesh.geometry.dispose();
      mesh.geometry = geometry;
    } else {
      if (!material) material = DEFAULT_MATERIAL();
      return new Mesh(geometry, material);
    }
  }

  /**
   * Create a wireframe object that shows only the angled edges of the underlying geometry, no lines across flat faces.
   * @param {Object} p
   * @param {BufferGeometry} p.geometry A three.js Geometry defining the shape
   * @param {Number} p.thresholdAngle Don't show edges between faces with an angle less than this value
   * @param {String} p.color Line color
   * @param {Number} p.linewidth Line width
   * @param {String} p.linecap Cap type
   * @param {String} p.linejoin Join type
   * @returns {LineSegments}
   */
  static edges({
    geometry,
    thresholdAngle = 1,
    color = 'white',
    linewidth = 1,
  }) {
    const edges = new EdgesGeometry(geometry, thresholdAngle);
    const line = new LineSegments(
      edges,
      new LineBasicMaterial({
        color: color,
        linewidth: linewidth,
      })
    );
    return line;
  }

  /**
   * A 2D semi-circular region in the horizontal plane with an expanding/contracting ring.
   * Used to provide information about reach distance without showing exact position.
   * @returns {Mesh}
   */
  static noFeedbackZone({
    near = 0.01,
    far = 0.2,
    opacity = 0.1,
    ringSegments = 24,
    angle = Math.PI / 2,
  }) {
    const zone = new Mesh(
      new RingGeometry(near, far, 30, 1, 0, angle),
      new MeshBasicMaterial({
        transparent: true,
        opacity: opacity,
        color: 'darkgray',
      })
    );
    zone.near = near;
    zone.far = far;
    // Rotate back so local XY lies in world XZ
    zone.rotateX(-Math.PI / 2);
    zone.rotateZ(Math.PI / 2 - angle / 2);
    zone.renderOrder = Infinity;

    const points = [];
    for (let theta = 0; theta <= angle; theta += angle / ringSegments) {
      points.push(new Vector3(Math.cos(theta), Math.sin(theta), 0));
    }
    const lineGeometry = new BufferGeometry().setFromPoints(points);
    const line = new Line(
      lineGeometry,
      new LineBasicMaterial({ color: 'black', linewidth: 3 })
    );
    line.scale.setScalar(near);
    line.position.z += 0.001;
    line.visible = false;
    zone.ring = line;
    zone.add(line);

    return zone;
  }

  // static standHere(pbrMapper) {
  //   const standHere = new Mesh(
  //     new RingGeometry(0, 0.35, 24, 1),
  //     new MeshStandardMaterial({ color: 'aquamarine' })
  //   );
  //   pbrMapper.applyNewTexture([standHere], 'ringfade', [ringAlphaMapURL]);
  //   standHere.translateZ(0.05);
  //   standHere.translateY(0.01); // avoid z-fighting with GridRoom
  //   standHere.rotateX(-Math.PI / 2);
  //   const aura = new Mesh(
  //     new CylinderGeometry(0.3, 0.3, 0.5, 24, 1, true),
  //     new MeshStandardMaterial({ color: 'aquamarine', transparent: true })
  //   );
  //   pbrMapper.applyNewTexture([aura], 'aurafade', [auraAlphaMapURL]);
  //   aura.material.side = DoubleSide;
  //   aura.renderOrder = Infinity;
  //   aura.translateZ(aura.geometry.parameters.height / 2);
  //   aura.rotateX(Math.PI / 2);
  //   standHere.add(aura);
  // }
}

/**
 * Helper class for creating a spring.
 */
class SpiralCurve extends Curve {
  constructor({
    majorRadius = 1,
    minorRadius = 0.15,
    numCoils = 7,
    stretch = 0,
    scale = 1,
  }) {
    super();
    this.majorRadius = majorRadius;
    this.minorRadius = minorRadius;
    this.numCoils = numCoils;
    this.stretch = stretch;
    this.scale = scale;
    this.yMax = this.numCoils * this.minorRadius * 2 + this.stretch;
  }

  getPoint(t, optionalTarget = new Vector3()) {
    // t is a point on the curve in [0,1]
    const angle = t * this.numCoils * 2 * Math.PI;
    const tx = Math.cos(angle) * this.majorRadius;
    const ty = t * this.yMax;
    const tz = Math.sin(angle) * this.majorRadius;
    return optionalTarget.set(tx, ty, tz).multiplyScalar(this.scale);
  }
}
