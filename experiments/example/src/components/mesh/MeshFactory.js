import {
  BoxGeometry,
  CylinderGeometry,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  TextureLoader,
  TorusGeometry,
  TubeGeometry,
} from 'three';
import { SpiralCurve } from './SpiralCurve';

const DEFAULT_MATERIAL = () => {
  return new MeshStandardMaterial({ color: 'white' });
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

  static box({ width, height, depth, texturePath = './textures/crate.gif' }) {
    const texture = new TextureLoader().load(texturePath);
    const geometry = new BoxGeometry(width, height, depth);
    const material = DEFAULT_MATERIAL();
    material.map = texture;
    return new Mesh(geometry, material);
  }
}
