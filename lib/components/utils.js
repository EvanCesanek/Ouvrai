import { Easing, Tween } from '@tweenjs/tween.js';
import { Object3D, Vector3 } from 'three';

/**
 * Throws an error. Use this as the default value for a positional arg or a named arg in destructuring syntax.
 * @param {string} name Name of the argument, for the error message.
 */
export function required(name) {
  throw new Error(
    `Parameter "${name}" is required. See stack trace in console.`
  );
}

export function clamp(num, min, max) {
  return Math.min(Math.max(num, min), max);
}

/**
 *
 * @param {object} p
 * @param {number} p.theta Angle in radians (use atan or atan2 if you have XY coords)
 * @param {integer} p.n Number of discrete angular steps from 0 to 2*pi
 * @returns {number} Angle in radian
 */
export function quantizeAngle(theta, n = 4) {
  let step = (2 * Math.PI) / n;
  return step * Math.round(theta / step);
}

/**
 * Truncated quadratic cost function. Useful for converting error to points.
 * @param {number} error Number to square.
 * @param {number} trunc Truncation threshold (default = 1).
 * @returns Cost
 */
export function truncQuadCost(error, trunc = 1) {
  const absError = Math.abs(error);
  return Math.min(Math.pow(absError, 2), trunc);
}

export function colorNameToHex(str) {
  let ctx = document.createElement('canvas').getContext('2d');
  ctx.fillStyle = str;
  return ctx.fillStyle;
}

/**
 * If start!==target, choose shortest rotation path.
 * If start===target, make a full rotation (randomly choosing CW/CCW).
 * @param {number} startAngle - radians
 * @param {number} targetAngle - radians
 * @returns Two-element array [targetAngle, distance]
 */
export function rotationHelper(startAngle, targetAngle, direction = 0) {
  let movementAngle = targetAngle - startAngle;
  movementAngle = movementAngle % (2 * Math.PI);
  let distance = Math.abs(movementAngle);
  if (distance > Math.PI && direction === 0) {
    const oppositeSign = -Math.sign(movementAngle);
    movementAngle = oppositeSign * (Math.PI * 2 - distance);
  }
  if (movementAngle === 0) {
    let randSign = 2 * (Math.random() > 0.5) - 1;
    movementAngle = randSign * Math.PI * 2;
  }
  targetAngle = startAngle + movementAngle;
  distance = Math.abs(movementAngle);
  return [targetAngle, distance];
}

/**
 * Compute the length of a spring at a given point in time.
 * @param {number} t - absolute time into trajectory (seconds)
 * @param {number} error - initial difference between spring length and equilibrium length
 * @param {number} gamma - parameter
 * @param {number} Gamma - parameter
 * @param {number} Omega - parameter
 * @param {string} regime - 'underdamped' or 'overdamped'
 * @param {number} initialPosn - a fixed offset given by the initial position of the mass
 * @returns {number} - position of mass at time t
 */
export function computeMassSpringDamperPosition(
  t,
  error,
  gamma,
  Gamma,
  Omega,
  regime,
  initialPosn
) {
  let newPosn;
  if (regime === 'underdamped') {
    newPosn =
      error +
      Math.exp(-gamma * t) *
        (-error * Math.cos(Omega * t) +
          (gamma * -error * Math.sin(Omega * t)) / Omega);
  } else if (regime === 'overdamped') {
    newPosn =
      error +
      (-error / 2 + (gamma * -error) / (2 * Gamma)) *
        Math.exp(-(gamma - Gamma) * t) +
      (-error / 2 - (gamma * -error) / (2 * Gamma)) *
        Math.exp(-(gamma + Gamma) * t);
  }
  newPosn = newPosn + initialPosn;
  return newPosn;
}

/**
 * Compute the parameters needed for computeMassSpringDamperPosition()
 * @param {number} mass
 * @param {number} springConstant
 * @param {number} springDamping
 * @returns {object} Parameters object
 */
export function computeMassSpringDamperParameters(
  mass,
  springConstant,
  springDamping
) {
  let omega, Omega, gamma, Gamma, regime;
  omega = Math.sqrt(springConstant / mass);
  gamma = springDamping / (2 * mass);
  if (omega > gamma) {
    regime = 'underdamped';
    Omega = Math.sqrt(Math.pow(omega, 2) - Math.pow(gamma, 2));
  } else if (omega < gamma) {
    regime = 'overdamped';
    Gamma = Math.sqrt(Math.pow(gamma, 2) - Math.pow(omega, 2));
  }
  return {
    omega: omega,
    Omega: Omega || null,
    gamma: gamma,
    Gamma: Gamma || null,
    regime: regime,
  };
}

export class DateTime {
  static formatted(join = '-') {
    let date = new Date();
    let yyyy = date.getFullYear().toString();
    let mm = ('0' + (date.getMonth() + 1)).slice(-2); // Date object has 0-indexed months
    let dd = ('0' + date.getDate()).slice(-2);
    let hh = ('0' + date.getHours()).slice(-2);
    let nn = ('0' + date.getMinutes()).slice(-2);
    let ss = ('0' + date.getSeconds()).slice(-2);
    return [yyyy, mm, dd, hh, nn, ss].join(join);
  }
  static absolute() {
    return Date.now();
  }
  static relative() {
    return performance.now();
  }
}

/**
 * Randomly sample 3D vector from spherical cap. Vector is oriented along -Z.
 * See: https://stackoverflow.com/questions/38997302/
 * @param {number} maxAngle Defines the spread of the cone.
 * @param {number} distance Defines the length of the vector.
 * @returns {Vector3} Random `Vector3`
 */
export function randomVectorFromCone(maxAngle, distance) {
  let dz = Math.cos(maxAngle) + Math.random() * (1 - Math.cos(maxAngle));
  let phi = Math.random() * 2 * Math.PI;
  let dx = Math.sqrt(1 - dz ** 2) * Math.cos(phi);
  let dy = Math.sqrt(1 - dz ** 2) * Math.sin(phi);
  return new Vector3(dx, dy, -dz).multiplyScalar(distance);
}

export function randomNormal(min, max, truncateStd = 3) {
  let u = 0;
  let v = 0;
  while (u === 0) {
    u = Math.random();
  } // Converting [0,1) to (0,1)
  while (v === 0) {
    v = Math.random();
  }
  let num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  if (Math.abs(num) > truncateStd) {
    num = randomNormal(min, max, truncateStd); // resample if out of range
  } else {
    num = (num + truncateStd) / (2 * truncateStd); // Translate to 0 -> 1
    num *= max - min; // Stretch to fill range
    num += min; // offset to min
  }
  return num;
}

/**
 * @param {integer} N String length
 * @returns {string} Random `N`-digit numeric string, left-padded with zeros
 */
export function randomNumericString(N = 7) {
  let out = String(Math.round(Math.random() * 10 ** N));
  return out.padStart(N, '0');
}

export function round(value, places = 0) {
  let m = 1.0;
  for (let i = 0; i < places; i++) {
    m *= 10.0;
  }
  value = Math.round(value * m) / m;
  return value;
}

export function linspace(startValue, stopValue, cardinality) {
  let arr = [];
  let step = (stopValue - startValue) / (cardinality - 1);
  for (let i = 0; i < cardinality; i++) {
    arr.push(startValue + step * i);
  }
  return arr;
}

/**
 * Compute the position of the object after a rotational error clamp.
 * @param {Object3D} home Home position
 * @param {Object3D} object Object to clamp
 * @param {Object3D} grip Grip object
 * @returns {Vector3} Clamped object position (remember to set)
 */
export function rotationalClamp(home, object, grip) {
  home.pxz = home.getWorldPosition(new Vector3()).setY(0); // home xz (world)
  let pxz = object.getWorldPosition(new Vector3()).setY(0); // tool xz (world)
  let d = pxz.distanceTo(home.pxz); // distance in the XZ plane
  let hw = home.getWorldPosition(new Vector3()); // start from home (world)
  hw = hw.add(new Vector3(0, grip.position.y, d)); // clamp x, preserve y, extend out by d
  grip.worldToLocal(hw); // convert to grip space
  object.position.copy(hw); // set as tool position
}

/**
 * Check whether two objects are aligned in world space
 * @param {object} p Parameters object
 * @param {Object3D} p.o1 First object
 * @param {Object3D} p.o2 Second object
 * @param {number|false} [p.distanceThresh=0.01] Max distance (default 1 cm)
 * @param {number|false} [p.angleThresh=0.0873] Max angular distance around `axis` (default 0.0873 radians =~ 5 degrees)
 * @param {string} [p.axis='z'] World axis around which to check angle alignment ('x', 'y', or default 'z')
 * @returns {boolean} true if o1 and o2 are within the specified thresholds, false otherwise
 */
export function checkAlignment({
  o1,
  o2,
  distanceThresh = 0.01, // 1 cm
  angleThresh = 0.0873, // ~5 deg
  axis = 'z',
}) {
  let aOkay = !angleThresh;
  let dOkay = !distanceThresh;

  if (!dOkay) {
    let o1p = o1.getWorldPosition(new Vector3());
    let o2p = o2.getWorldPosition(new Vector3());
    let d = o1p.distanceTo(o2p); // distance
    dOkay = d < distanceThresh;
    //console.log(`distance = ${d}`, dOkay);
  }
  if (!aOkay) {
    o1.updateWorldMatrix(true, false);
    o2.updateWorldMatrix(true, false);
    // Scene object does not have matrixWorld, only matrix
    let o1a = o1.isScene ? o1.matrix.elements : o1.matrixWorld.elements;
    let o2a = o2.isScene ? o2.matrix.elements : o2.matrixWorld.elements;
    // start of slice (first 3 columns of matrix world are +X, +Y, +Z)
    let ss = axis === 'x' ? 0 : axis === 'y' ? 4 : 8;
    // slice, normalize, and compute angle between (arccos of dot product)
    o1a = new Vector3(...o1a.slice(ss, ss + 3)).normalize();
    o2a = new Vector3(...o2a.slice(ss, ss + 3)).normalize();
    let a = Math.abs(Math.acos(o1a.dot(o2a)));
    //console.log(`angle = ${(a * 180) / Math.PI}`);
    aOkay = a < angleThresh;
  }
  return dOkay && aOkay;
}

/**
 * Convenience function to generate a Tween for a demo avatar object.
 * @param {object} p
 * @param {Object3D} p.object Three.js object to animate
 * @param {number} p.maxAngle Angular cone extent (radians) to sample reaches from
 * @param {number} p.distance Length of the reaches
 * @param {number} p.duration Duration of the reaches (one-way, ms)
 * @param {number} p.initialDelay Milliseconds before starting (default 800)
 * @param {number} p.repeatDelay Milliseconds between repetitions (default duration/8)
 * @param {Easing} p.easing Tween easing function
 * @param {boolean} p.yoyo Automatically animate the return reach? (default true)
 * @param {integer} p.reps Repetitions (default 1)
 * @param {boolean} p.recursive Generate reaches recursively for randomness? (default true)
 * @returns {Tween} A Tween that will perform the desired animation
 */
export function generateDemoReaches({
  object = required('object'),
  maxAngle = required('maxAngle'),
  distance = required('distance'),
  duration = required('duration'),
  initialDelay = 800,
  repeatDelay,
  easing = Easing.Quadratic.InOut,
  yoyo = true,
  reps = 1,
  recursive = true,
}) {
  // We want to translate distance in a random direction within maxAngle
  let end = object.position
    .clone()
    .add(randomVectorFromCone(maxAngle, distance));

  let tween = new Tween(object.position)
    .to({ ...end }, duration)
    .delay(initialDelay)
    .repeat(reps)
    .repeatDelay(repeatDelay || duration / 8)
    .yoyo(yoyo)
    .easing(easing);

  // recursive allows each repetition to differ slightly
  if (recursive) {
    tween.onComplete(
      () =>
        (object.demoTween = generateDemoReaches({
          object: object,
          maxAngle: maxAngle,
          distance: distance,
          duration: duration,
          easing: easing,
          yoyo: yoyo,
          reps: reps,
        }).start())
    );
  }
  return tween;
}

// function randomInteger(min, max) {
//   // Integer between min and max (inclusive)
//   return Math.floor(Math.random() * (max - min + 1)) + min;
// }

// // MATH
// function weightedAverageVector(a1, a2, w1) {
//   w1 = clamp(w1, 0, 1);
//   return a1.map(function (x, i) {
//     return w1 * x + (1 - w1) * a2[i];
//   });
// }

// function getQuadrant(xy) {
//   const x = xy[0];
//   const y = xy[1];
//   if (x > 0 && y > 0) return 1;
//   else if (x < 0 && y > 0) return 2;
//   else if (x < 0 && y < 0) return 3;
//   else if (x > 0 && y < 0) return 4;
//   else if (x === 0 && y > 0) return 'y+';
//   else if (x === 0 && y < 0) return 'y-';
//   else if (y === 0 && x < 0) return 'x-';
//   else if (y === 0 && x > 0) return 'x+';
//   else return 'o';
// }

// function isHome(cursor, target, tolerance) {
//   var d = distance(cursor, target);
//   return d < tolerance;
// }

// function distance(p1, p2) {
//   if (!(Array.isArray(p1) || Array.isArray(p2))) {
//     console.error('ERROR: distance(p1,p2) requires array arguments');
//   }
//   var d = 0.0;
//   for (let i = 0; i < p1.length; i++) {
//     d += Math.pow(p1[i] - p2[i], 2);
//   }
//   return Math.sqrt(d);
// }

// function radialToEuclidean(angle, distance, homeXY, ySign = -1) {
//   if (!homeXY) {
//     homeXY = [0, 0];
//   }
//   return [
//     homeXY[0] + Math.cos(angle) * distance,
//     homeXY[1] + ySign * Math.sin(angle) * distance,
//   ];
// }

// function computeScreenHeight() {
//   // the upper point (in 3D space)
//   let topback = new Vector3();
//   topback.copy(carousel.position);
//   topback.add(
//     new Vector3(
//       carouselParams.majorRadius - exp.cfg.targetWidth,
//       carouselParams.minorRadius * 2,
//       0
//     )
//   );
//   // the lower point (in 3D space)
//   let bottomfront = new Vector3();
//   bottomfront.copy(carousel.position);
//   bottomfront.add(
//     new Vector3(
//       carouselParams.majorRadius + exp.cfg.targetWidth,
//       carouselParams.minorRadius * 2 - exp.cfg.targetHeights[trial.targetId],
//       0
//     )
//   );
//   // Project to NDC [-1, 1] on each dimension
//   topback.project(camera);
//   bottomfront.project(camera);
//   // Print
//   console.log(`top NDC = ${(topback.x, topback.y, topback.z)}`);
//   console.log(`bottom NDC = ${(bottomfront.x, bottomfront.y, bottomfront.z)}`);
// }

//////////////////////////
// Controls can be helpful for debug and examining object geometry
// Must attach to cssRenderer.domElement bc it's on top of renderer.domElement
// let controls = new PointerLockControls(camera, document.body);
// document.body.addEventListener('keydown', (e) => {
//   switch (e.key) {
//     case 'w':
//       controls.moveForward(0.01);
//       break;
//     case 's':
//       controls.moveForward(-0.01);
//       break;
//     case 'd':
//       controls.moveRight(0.01);
//       break;
//     case 'a':
//       controls.moveRight(-0.01);
//       break;
//   }
// });
//////////////////////////

// // GRAPHICS-2D
// function colorGradient(start, end, steps) {
//   if (start.every((x) => x <= 1)) {
//     //console.warn('WJS: You supplied RGB values all in [0, 1]. Rescaling [0, 255]...');
//     start = start.map((x) => x * 255);
//   }
//   var i,
//     j,
//     wStart,
//     wEnd,
//     output = [];

//   for (i = 0; i < steps; i++) {
//     var combinedRGB = [];
//     wStart = i / (steps - 1);
//     wEnd = 1 - wStart;
//     for (j = 0; j < 3; j++) {
//       combinedRGB[j] = Math.round(start[j] * wEnd + end[j] * wStart);
//     }
//     output.push(combinedRGB);
//   }
//   return output;
// }

// // EXPLOSION
// class Explosion {
//   constructor(
//     position,
//     initialRadius,
//     color,
//     duration,
//     fragments,
//     fragmentSize,
//     speed
//   ) {
//     this.popping = false;
//     this.timer = new Timer();
//     this.position = position;
//     this.initialRadius = initialRadius;
//     this.duration = duration;
//     this.fragments = fragments;
//     this.fragmentSize = fragmentSize;
//     this.speed = speed;
//     this.gradient = colorGradient(color, [0, 0, 0], Math.floor(duration / 10));
//   }

//   pop(position, initialRadius) {
//     if (this.popping) {
//       return;
//     }

//     if (position) {
//       this.position = [position[0], position[1]];
//     }

//     if (initialRadius) {
//       this.initialRadius = initialRadius;
//     }

//     this.popping = true;
//     this.timer.reset();
//   }

//   // draw() {
//   //   if (this.timer.expiredMSec(this.duration)) {
//   //     this.popping = false;
//   //     return;
//   //   }

//   //   var t = this.timer.elapsedMSec();
//   //   var radius =
//   //     (Math.pow((this.duration - t) / this.duration, 2) * this.fragmentSize) /
//   //     2;

//   //   for (let i = 0; i < this.fragments; i++) {
//   //     var angle = (2 * Math.PI * i) / this.fragments;
//   //     var x =
//   //       this.position[0] +
//   //       Math.sin(angle) * (this.speed * t + this.initialRadius);
//   //     var y =
//   //       this.position[1] +
//   //       Math.cos(angle) * (this.speed * t + this.initialRadius);
//   //     drawCircle([x, y], radius, this.gradient[Math.floor(t / 10)], true, 2);
//   //   }
//   // }
// }
