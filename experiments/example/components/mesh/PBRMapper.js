import {
  Color,
  MeshStandardMaterial,
  RepeatWrapping,
  TextureLoader,
} from 'three';

/**
 * A static class for using PBR texture maps from https://ambientcg.com/list?type=Atlas,Decal,Material
 */
export class PBRMapper {
  /**
   *
   * @param {string} textureName - name of AmbientCG texture (e.g. 'Wood049-1K')
   * @param [MeshStandardMaterial] material -
   * @param {string} format - 'jpg' or 'png'
   */
  static async load(textureName, material, format = 'JPG') {
    // instantiate a loader
    const loader = new TextureLoader();
    const formatUpper = format.toUpperCase();
    const formatLower = format.toLowerCase();
    const prefix = `./components/textures/${textureName}-${formatUpper}/${textureName}`;

    // PBR Textures
    const textures = {
      map: {
        url: `${prefix}_Color.${formatLower}`,
        val: undefined,
      },
      displacementMap: {
        url: `${prefix}_Displacement.${formatLower}`,
        val: undefined,
      },
      normalMap: {
        url: `${prefix}_NormalGL.${formatLower}`,
        val: undefined,
      },
      roughnessMap: {
        url: `${prefix}_Roughness.${formatLower}`,
        val: undefined,
      },
      // alphaMap: {
      //   url: `${prefix}_Opacity.${formatLower}`,
      //   val: undefined,
      // },
    };

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
    if (material instanceof MeshStandardMaterial) {
      this.setPBRMaps(textures, material);
    }

    return textures;
  }

  static setPBRMaps(textures, material) {
    for (let [key, entry] of Object.entries(textures)) {
      material[key] = entry.val;
    }
    // Set defaults that allow PBR maps to work
    material.color = new Color('white');
    material.transparent = true;
    material.opacity = 1;
    material.roughness = 1;
    material.metalness = 1;
    material.displacementScale = 0;
    material.displacementBias = material.displacementScale / 2;
    material.needsUpdate = true;
    material.normalScale.set(1.5, 1.5);
  }
}
