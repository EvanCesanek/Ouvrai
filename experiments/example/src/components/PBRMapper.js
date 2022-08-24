import { Color, RepeatWrapping, TextureLoader } from 'three';

/**
 * A static class for using PBR texture maps from https://ambientcg.com/list?type=Atlas,Decal,Material
 */
export class PBRMapper {
  /**
   *
   * @param {string[]} textureURLs - an array of imported URLs
   * @param {string} textureName - name of AmbientCG texture (e.g. 'Wood049-1K')
   */
  static async load(textureURLs, textureName) {
    // instantiate a loader
    const loader = new TextureLoader();

    const textures = {};
    for (const path of textureURLs) {
      if (path.includes(textureName)) {
        let mapName;
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
        }
        textures[mapName] = {
          url: path,
          val: undefined,
        };
      }
    }

    // Async/await loading of textures
    for (let [, entry] of Object.entries(textures)) {
      try {
        entry.val = await loader.loadAsync(entry.url);
        entry.val.wrapS = RepeatWrapping;
        entry.val.wrapT = RepeatWrapping;
      } catch (error) {
        console.error(error.message);
      }
    }

    return textures;
  }

  static setPBRMaps(
    textures,
    material,
    displacementScale = 1,
    normalScale = 1
  ) {
    for (let [key, entry] of Object.entries(textures)) {
      material[key] = entry.val;
    }
    // Set defaults that allow PBR maps to work
    material.color = new Color('white');
    material.transparent = true;
    material.opacity = 1;
    material.roughness = 1;
    material.metalness = 1;
    material.displacementScale = displacementScale;
    material.displacementBias = material.displacementScale / 2;
    material.normalScale.set(normalScale, normalScale);
    //material.needsUpdate = true;
  }
}
