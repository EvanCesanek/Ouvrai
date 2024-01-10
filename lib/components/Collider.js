import {
  Mesh,
  Quaternion,
  Raycaster,
  Vector3,
  MeshBasicMaterial,
  BoxGeometry,
  BufferGeometry,
  Material,
} from 'three';

/**
 * The Collider class implements a simple algorithm for collision detection.
 */
export class Collider extends Mesh {
  /**
   * Create a new Collider (should be added to a parent object after constructor).
   * When added to a parent, it will be accessible via the `collider` property.
   * @param {BufferGeometry} geometry Geometry of the collider. Need not match parent. Fewer vertices leads to faster collision testing. Default 1x1x1 BoxGeometry. If undefined when added to a parent Mesh, will assume parent Mesh geometry.
   * @param {Material} material For visualizing the collider. By default, collider is not visible and material is a green wireframe.
   */
  constructor(
    geometry = new BoxGeometry(1, 1, 1),
    material = new MeshBasicMaterial({ wireframe: true, color: 'green' })
  ) {
    // Don't use public instance fields for (geometry, material) because they are defined *after* super() returns
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
        console.warn('You are overwriting an existing Collider.');
      }
      this.parent.collider = this;
    });
  }

  /**
   * Test for a collision between this Collider and another object.
   * @param {Object3D} object Object to test for collisions against
   * @returns {Boolean} True if collision occurred, false otherwise
   */
  test(object) {
    if (!this.parent) {
      console.warn('Collider has no parent object.');
      return;
    }
    for (let vi = 0; vi < this.geometry.attributes.position.count; vi++) {
      this._v.fromBufferAttribute(this.geometry.attributes.position, vi); // get vertex position on collider
      this._v.applyMatrix4(this.parent.matrix); // apply collider's local transform
      this._v.sub(this.parent.position); // remove position component of local transform -> direction vector
      this.parent.getWorldQuaternion(this._q); // get world space rotation of collider
      this._v.applyQuaternion(this._q); // rotate direction vector so it is in world space
      this.parent.getWorldPosition(this._rc.ray.origin); // set origin of raycaster
      this._rc.ray.direction = this._v.clone().normalize(); // set direction of raycaster
      let results = this._rc.intersectObject(object, false); // check for intersection
      // collision occurred if there is an intersection that is closer than the vertex
      if (results.length > 0 && results[0].distance < this._v.length()) {
        return true;
      }
    }
    return false;
  }
}
