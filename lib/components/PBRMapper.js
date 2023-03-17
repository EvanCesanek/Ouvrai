import { RepeatWrapping, Texture, TextureLoader } from 'three';

/**
 * A static class for using PBR texture maps from https://ambientcg.com/list?type=Atlas,Decal,Material
 */
export class PBRMapper {
  constructor() {
    this.loader = new TextureLoader();
    this.textures = {};
  }

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
   *
   * @param {string[]} textureURLs - an array of imported URLs
   * @param {string} textureName - name of AmbientCG texture (e.g. 'Wood049-1K')
   */
  load(textureURLs, textureName) {
    this.clear(textureName); // get rid of any old textures stored with the same name
    for (const path of textureURLs) {
      let mapName;
      // Assignment based on ambient CG
      if (path.includes('Color')) {
        mapName = 'map';
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

  setPBRMaps(textureName, material, displacementScale = 1, normalScale = 1) {
    for (let [key, entry] of Object.entries(this.textures[textureName])) {
      material[key] = entry.val;
    }
    // Set defaults that allow PBR maps to work
    //material.color = new Color('white');
    material.transparent = true;
    material.opacity = 1;
    material.roughness = 1;
    material.metalness = this.textures[textureName]['metalnessMap'] ? 1 : 0;
    material.displacementScale = displacementScale;
    material.displacementBias = material.displacementScale / 2;
    material.normalScale.set(normalScale, normalScale);
  }

  /**
   *
   * @param {Object3D[]} objects Array of objects to apply textures
   * @param {string} name Name of the texture to apply - allows you to check if the texture has already been loaded
   * @param {string[]} urls Array of texture asset URLs
   * @param {object} p
   * @param {number} p.xRepeatTimes Wrapping parameter
   * @param {number} p.yRepeatTimes Wrapping parameter
   * @param {number} p.displacementScale Effect of the displacement map
   */
  applyNewTexture(
    objects,
    name,
    urls,
    ...{ xRepeatTimes = 1, yRepeatTimes = 1, displacementScale = 0 }
  ) {
    if (!Object.keys(this.textures).includes(name)) {
      this.load(urls, name);
    }
    for (let obji of objects) {
      if (!obji) continue;
      this.setPBRMaps(name, obji.material, displacementScale, 1);
      obji.material.map.repeat.set(
        obji.scale.x * xRepeatTimes,
        obji.scale.y * yRepeatTimes
      );
    }
  }
}
