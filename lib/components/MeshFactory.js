import {
  BoxGeometry,
  CylinderGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  LineBasicMaterial,
  EdgesGeometry,
  LineSegments,
  RingGeometry,
  DoubleSide,
} from 'three';
import { SpiralCurve } from './SpiralCurve';

const DEFAULT_MATERIAL = () => {
  //return new MeshBasicMaterial();
  return new MeshStandardMaterial();
};

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
