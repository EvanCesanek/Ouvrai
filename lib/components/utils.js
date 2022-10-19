export function required(name) {
  throw new Error(`Parameter ${name} is required`);
}

export function clamp(num, min, max) {
  return Math.min(Math.max(num, min), max);
}

export function truncQuadCost(error, trunc = 1) {
  const absError = Math.abs(error);
  return Math.min(Math.pow(absError, 2), trunc);
}

/**
 * If start!==target, choose shortest rotation path. If start===target, make a full rotation (randomly choosing CW/CCW).
 * @param {number} startAngle - radians
 * @param {number} targetAngle - radians
 * @returns
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
 *
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
 * @returns
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
  static formatted() {
    var date = new Date();
    var yyyy = date.getFullYear().toString();
    var mm = ('0' + (date.getMonth() + 1)).slice(-2); // Date object has 0-indexed months
    var dd = ('0' + date.getDate()).slice(-2);
    var hh = ('0' + date.getHours()).slice(-2);
    var nn = ('0' + date.getMinutes()).slice(-2);
    var ss = ('0' + date.getSeconds()).slice(-2);
    return [yyyy, mm, dd, hh, nn, ss].join('-');
  }
  static absolute() {
    return Date.now();
  }
  static relative() {
    return performance.now();
  }
}

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

// // OLD WEBLAB-CORE
// // MOUSE-2D
// function getMousePos(canvas, evt) {
//   var rect = canvas.getBoundingClientRect();
//   return [evt.clientX - rect.left, evt.clientY - rect.top];
// }

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

export function round(value, places) {
  // Round a value to specified number of decimal places.
  if (typeof places == 'undefined') {
    places = 0;
  }
  for (var m = 1.0, i = 0; i < places; i++) {
    m *= 10.0;
  }
  value = Math.round(value * m) / m;

  return value;
}

export function linspace(startValue, stopValue, cardinality) {
  var arr = [];
  var step = (stopValue - startValue) / (cardinality - 1);
  for (var i = 0; i < cardinality; i++) {
    arr.push(startValue + step * i);
  }
  return arr;
}

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
