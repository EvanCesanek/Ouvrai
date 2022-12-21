import ThreeMeshUI from 'three-mesh-ui';
import FontJSON from 'three-mesh-ui/examples/assets/Roboto-msdf.json';
import FontImage from 'three-mesh-ui/examples/assets/Roboto-msdf.png';

export class XRVisor extends ThreeMeshUI.Block {
  constructor() {
    super({
      width: 0.01,
      height: 0.01,
      backgroundOpacity: 0,
      fontFamily: FontJSON,
      fontTexture: FontImage,
      fontSize: 0.07,
    });
    this.position.set(0, 0, 0.45);
    this.text = new ThreeMeshUI.Text({
      content: '',
    });
    this.add(this.text);
  }
}
