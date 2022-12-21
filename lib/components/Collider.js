import {
  Mesh,
  Quaternion,
  Raycaster,
  Vector3,
  MeshBasicMaterial,
  BoxGeometry,
} from 'three';

export class Collider extends Mesh {
  // Warning: don't use public instance fields for (geometry, material)
  // because they are defined *after* super() returns
  constructor(
    geometry = new BoxGeometry(1, 1, 1),
    material = new MeshBasicMaterial({ wireframe: true, color: 'green' })
  ) {
    super(geometry, material);
    this._v = new Vector3();
    this._q = new Quaternion();
    this._rc = new Raycaster();
    this.name = 'collider';
    this.visible = false;

    this.addEventListener('added', () => {
      this.geometry = this.geometry || this.parent.geometry;
      if (this.parent.collider && this.parent.collider.isObject3D) {
        this.parent.remove(this.parent.collider);
        console.warn('You are overwriting an existing collider object...');
      }
      this.parent.collider = this;
    });
  }

  test(object) {
    if (!this.parent) {
      console.warn('Collider has no parent object.');
      return;
    }
    // collision detection
    for (let vi = 0; vi < this.geometry.attributes.position.count; vi++) {
      this._v.fromBufferAttribute(this.geometry.attributes.position, vi); // get vertex position on collider
      this._v.applyMatrix4(this.parent.matrix); // apply collider's local transform
      this._v.sub(this.parent.position); // remove position component of local transform -> direction vector
      // get world space rotation of collider
      this.parent.getWorldQuaternion(this._q);
      // rotate direction vector so it is in world space
      this._v.applyQuaternion(this._q);
      // set origin and direction of raycaster
      this.parent.getWorldPosition(this._rc.ray.origin);
      this._rc.ray.direction = this._v.clone().normalize();
      // check for intersection
      let results = this._rc.intersectObject(object, false);
      // collision occurred if there is an intersection that is closer than the vertex
      if (results.length > 0 && results[0].distance < this._v.length()) {
        return true;
      }
    }
    return false;
  }
}
