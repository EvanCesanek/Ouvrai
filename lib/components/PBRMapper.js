import {
  Material,
  MeshStandardMaterial,
  RepeatWrapping,
  Texture,
  TextureLoader,
  Vector2,
} from 'three';

/**
 * A class for using PBR texture maps from https://ambientcg.com/list?type=Atlas,Decal,Material.
 * Included by default in `exp.sceneManager`.
 */
export class PBRMapper {
  constructor() {
    this.loader = new TextureLoader();
    this.textures = {};
  }

  /**
   * Dispose of textures in `textures[textureName]`.
   * @param {String} textureName Name of textures to clear
   */
  clear(textureName) {
    if (this.textures[textureName]) {
      for (let [, tx] of Object.entries(this.textures[textureName])) {
        if (tx instanceof Texture) {
          tx.dispose();
        }
      }
    }
    this.textures[textureName] = {};
  }

  /**
   * Load image files in as Textures, storing them in `this.textures[textureName]`
   * @param {String[]} textureURLs Array of imported URLs
   * @param {String} textureName Name of AmbientCG texture (e.g. 'Wood049-1K')
   */
  #load(textureURLs, textureName) {
    this.clear(textureName); // get rid of any old textures stored with the same name
    for (const path of textureURLs) {
      let mapName;
      // Assignment based on ambient CG
      if (path.includes('Color')) {
        mapName = 'map';
      } else if (path.includes('AmbientOcclusion')) {
        mapName = 'aoMap';
      } else if (path.includes('Displacement')) {
        mapName = 'displacementMap';
      } else if (path.includes('NormalGL')) {
        mapName = 'normalMap';
      } else if (path.includes('Roughness')) {
        mapName = 'roughnessMap';
      } else if (path.includes('Opacity')) {
        mapName = 'alphaMap';
      } else if (path.includes('Metalness')) {
        mapName = 'metalnessMap';
      }
      this.textures[textureName][mapName] = {
        val: this.loader.load(path),
      };
      this.textures[textureName][mapName].wrapS = RepeatWrapping;
      this.textures[textureName][mapName].wrapT = RepeatWrapping;
    }
  }

  /**
   * Update the relevant properties of an object's material to the loaded texture maps.
   * @private
   * @param {String} textureName Name of the new texture
   * @param {MeshStandardMaterial} material Material on which to apply the textures as different maps
   * @param {Vector2} repeatXY Number of times to repeat each map in each direction
   * @param {Number} displacementScale Scale of displacement map, default 0 (caution, usually doesn't work)
   * @param {Number} normalScale Scale of the normal map, default 1
   * @param {Number} aoScale Scale of the ambient occlusion map, default 1 (aoMap is usually not used)
   */
  #setPBRMaps(
    textureName,
    material,
    repeatXY,
    displacementScale = 0,
    normalScale = 1,
    aoScale = 1
  ) {
    for (let [key, entry] of Object.entries(this.textures[textureName])) {
      material[key] = entry.val;
      // repeat/offset cannot be set on light map or ambient occlusion map
      if (key !== 'lightMap' && key !== 'aoMap') {
        // Although here we set repeat for each map, only one value is used per material
        // The diffuse color (material['map']) takes precedence
        // This behavior may change in the future, see GitHub issues
        material[key].repeat.set(repeatXY.x, repeatXY.y);
      }
    }
    // Set defaults that allow PBR maps to work
    material.transparent = true;
    material.opacity = 1;
    material.roughness = 1;
    material.metalness = material.metalnessMap ? 1 : 0;
    material.displacementScale = displacementScale;
    //material.displacementBias = 0;
    material.normalScale.set(normalScale, normalScale);
    material.aoMapIntensity = aoScale;
  }

  /**
   * Apply a set of PBR texture maps to one or more objects. The material color of these objects should be 'white'.
   * If you are not seeing your objects, check the Network tab in the browser Dev Tools to see how long your textures are taking to load.
   * If they are too big, try exporting the 1K files from AmbientCG to lower-quality JPEGs (in Preview or similar app).
   * You may also try using the Color map only, instead of all the maps.
   * @param {Object3D[]} objects Array of objects to apply textures to.
   * @param {String} name Name of the texture to apply. Enables checking if the texture has already been loaded (save memory).
   * @param {String[]} urls Array of texture asset URLs
   * @param {Object} p Parameters object
   * @param {Number} p.xRepeatTimes Wrapping parameter, default 1
   * @param {Number} p.yRepeatTimes Wrapping parameter, default 1
   * @param {Number} p.displacementScale Effect of the displacement map, default 0
   * @param {Number} p.normalScale Effect of the normal map, default 1
   * @param {Number} p.aoScale Effect of the ambient occlusion map, default 1 (usually unused, requires second set of UVs)
   */
  applyNewTexture(
    objects,
    name,
    urls,
    ...{
      xRepeatTimes = 1,
      yRepeatTimes = 1,
      displacementScale = 0,
      normalScale = 1,
      aoScale = 1,
    }
  ) {
    // TODO: Placeholder texture - or blocker screen until all textures are loaded...
    if (!Object.keys(this.textures).includes(name)) {
      this.#load(urls, name);
    }
    for (let obji of objects) {
      if (!obji) continue;
      this.#setPBRMaps(
        name,
        obji.material,
        new Vector2(xRepeatTimes, yRepeatTimes),
        displacementScale,
        normalScale,
        aoScale
      );
      // Ambient occlusion requires a second set of UVs called 'uv2'
      // TODO: CHANGED IN v 151 - "aoMap and lightMap no longer use uv2. Set material.lightMap.channel to 0 for uv and 1 for uv2."
      // (https://github.com/mrdoob/three.js/wiki/Migration-Guide)
      if (obji.material.aoMap) {
        let uvs = obji.geometry.attributes.uv.array;
        obji.geometry.addAttribute('uv2', new THREE.BufferAttribute(uvs, 2));
      }
    }
  }
}
