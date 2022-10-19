import {
  AdditiveBlending,
  BufferGeometry,
  Float32BufferAttribute,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
} from 'three';

export function onSelectStart() {
  this.userData.isSelecting = true;
  if (this.userData.clock) this.userData.clock.start();
}

export function onSelectEnd() {
  this.userData.isSelecting = false;
}

export function buildController(data) {
  let geometry, material;

  switch (data.targetRayMode) {
    case 'tracked-pointer':
      geometry = new BufferGeometry();
      geometry.setAttribute(
        'position',
        new Float32BufferAttribute([0, 0, 0, 0, 0, -1], 3)
      );
      geometry.setAttribute(
        'color',
        new Float32BufferAttribute([0.5, 0.5, 0.5, 0, 0, 0], 3)
      );

      material = new LineBasicMaterial({
        vertexColors: true,
        blending: AdditiveBlending,
      });

      return new Line(geometry, material);

    case 'gaze':
      geometry = new RingGeometry(0.02, 0.04, 32).translate(0, 0, -1);
      material = new MeshBasicMaterial({
        opacity: 0.5,
        transparent: true,
      });
      return new Mesh(geometry, material);
  }
}
