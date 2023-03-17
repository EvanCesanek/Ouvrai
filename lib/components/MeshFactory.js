import {
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  TubeGeometry,
  LineBasicMaterial,
  EdgesGeometry,
  LineSegments,
  RingGeometry,
  DoubleSide,
  Curve,
} from 'three';
import { pairs } from 'd3-array';

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
   * @param {object} p
   * @param {number} p.majorRadius Radius of the spring (default 1)
   * @param {number} p.minorRadius Radius of the tube (default 0.15)
   * @param {number} p.numCoils Number of coils (default 7)
   * @param {number} p.stretch Stretch length in meters (default 0 = coils touching)
   * @param {number} p.scale Default 1
   * @param {integer} p.tubularSegments Number of segments around the tube
   * @param {integer} p.radiusSegments Number of segments along the coils
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
   * @param {object} p
   * @param {BufferGeometry} p.geometry A three.js Geometry defining the shape
   * @param {number} p.thresholdAngle Don't show edges between faces with an angle less than this value
   * @param {string} p.color Line color
   * @param {number} p.linewidth Line width
   * @param {string} p.linecap Cap type
   * @param {string} p.linejoin Join type
   * @returns {LineSegments}
   */
  static edges({
    geometry,
    thresholdAngle = 1,
    color = 'white',
    linewidth = 1,
    linecap = 'round',
    linejoin = 'round',
  }) {
    const edges = new EdgesGeometry(geometry, thresholdAngle);
    const line = new LineSegments(
      edges,
      new LineBasicMaterial({
        color: color,
        linewidth: linewidth,
        linecap: linecap,
        linejoin: linejoin,
      })
    );
    return line;
  }

  /**
   * A 2D semi-circular region in the horizontal plane with an expanding/contracting ring.
   * Used to provide information about reach distance without showing exact position.
   * @returns {Mesh}
   */
  static noFeedbackZone({ near = 0.01, far = 0.2, opacity = 0.15 }) {
    const zone = new Mesh(
      new RingGeometry(near, far, 30, 1, 0, Math.PI),
      new MeshBasicMaterial({
        transparent: true,
        opacity: opacity,
        color: 'black',
      })
    );
    zone.near = near;
    zone.far = far;
    // Rotate back so local XY lies in world XZ
    zone.rotateX(-Math.PI / 2);

    const ring = new Mesh(
      new RingGeometry(0.975, 1.025, 30, 1, 0, Math.PI),
      new MeshBasicMaterial({ color: 'black' })
    );
    // prevent z-fighting
    // local +Z = world +Y because parent is rotated
    ring.position.z += 0.001;
    ring.visible = false;

    zone.material.side = DoubleSide;
    ring.material.side = DoubleSide;

    zone.ring = ring;
    zone.add(ring);

    return zone;
  }
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
