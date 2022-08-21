import { Curve, Vector3 } from 'three';

export class SpiralCurve extends Curve {
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
