import { DisplayElement } from './DisplayElement';

export class PointsPanel extends DisplayElement {
  constructor({ score = false, bonus = false }) {
    let html = `<div id="points-panel" class="panel">
      Worker ID: <span id="points-panel-worker" class="panel-data"></span>
      <br />`;
    if (score) {
      html += `Score: <span id="points-panel-points" class="panel-data"></span>`;
    }
    if (bonus) {
      html += `&NonBreakingSpace;
    <span>Bonus:</span>
    <span id="points-panel-bonus" class="panel-data"></span>`;
    }
    html += '<div id="loadingbar"></div></div>';

    super({
      element: html,
      display: 'block',
      hide: false,
    });

    document.getElementById('panel-container').append(this.dom);
  }
}
