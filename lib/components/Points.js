import { Tween } from '@tweenjs/tween.js';
import { Vector3 } from 'three';
import { CSS2D } from './CSS2D';

/**
 * An instance of the Points class is included by default in each `new Experiment()`.
 * It tracks the participant's crowdsourcing platform ID, current score, and bonus payment.
 * The `panel` property contains a `PointsPanel` instance used to display this information in the DOM overlay element `panel-container`.
 */
export class Points {
  total;
  text;
  css2d;
  currencyFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  });

  /**
   * An instance of the Points class is included by default in each `Experiment`.
   * It tracks the participant's crowdsourcing platform ID, current score, and bonus payment.
   * The `panel` property contains a `PointsPanel` instance used to display this information in the DOM overlay element `panel-container`.
   * @param {Object} p Parameters object
   * @param {Boolean} score Display score on panel?
   * @param {Boolean} bonus Display bonus payment on panel?
   */
  constructor({ score = true, bonus = true }) {
    this.panel = new PointsPanel({ score: score, bonus: bonus });
    this.total = 0;
    this.text = this.currencyFormatter.format(0);
    this.css2d = new CSS2D('');
    this.css2d.object.element.style.fontSize = '24pt';
    this.panelPoints = document.getElementById('points-panel-points');
    if (this.panelPoints) {
      this.panelPoints.textContent = this.total;
      this.panelBonus = document.getElementById('points-panel-bonus');
      this.panelBonus.textContent = this.text;
    }
    this.panelWorker = document.getElementById('points-panel-worker');
  }

  /**
   * Increase `this.total` points (internally and on the PointsPanel)
   * @param {Number} earned Number of points to add
   * @param {Boolean} animate Move & fade overlay text showing earned points with a tween.js animation on `this.css2d`?
   * @param {Object} animateOpts Options for the tween.js animation
   * @param {String} animateOpts.color Text color, default 'white'
   * @param {Vector3} animateOpts.startPosn Start position, default `new Vector3(0, 0, 0)`
   * @param {Vector3} animateOpts.endPosn End position, default `new Vector3(0, 0.1, 0)`
   */
  add(
    earned,
    animate = false,
    animateParams = {
      color: 'white',
      startPosn: new Vector3(0, 0, 0),
      endPosn: new Vector3(0, 0.1, 0),
    }
  ) {
    const updatePointsTween = new Tween(this)
      // duration depends on amount
      .to({ total: this.total + earned }, Math.abs(earned) * 10)
      .onUpdate(() => {
        this.total = Math.max(0, Math.round(this.total));
        this.panelPoints.textContent = this.total;
      })
      .onComplete(() => {
        this.text = this.currencyFormatter.format(this.total / 10000);
        this.panelBonus.textContent = this.text;
      });

    if (animate) {
      // Initialize
      this.css2d.object.position.set(...animateParams.startPosn);
      this.css2d.object.element.style.opacity = 1;
      this.css2d.object.element.innerHTML =
        earned >= 0 ? `+${earned}` : `\u2212${Math.abs(earned)}`;
      this.css2d.object.element.style.color = animateParams.color;

      // movement+fade -> score increase
      new Tween(this.css2d.object)
        .to(
          {
            position: { y: animateParams.endPosn.y },
            element: { style: { opacity: 0 } },
          },
          500
        )
        .delay(700)
        .start()
        .chain(updatePointsTween);
    } else {
      updatePointsTween.delay(700).start();
      // this.total += earned;
      // this.panelPoints.textContent = this.total;
      // this.text = this.currencyFormatter.format(this.total / 10000);
      // this.panelBonus.textContent = this.text;
    }
  }
}

/**
 * Displays the participant's crowdsourcing platform ID, current score, and bonus payment as a panel in the 'panel-container'
 * @extends DisplayElement
 */
export class PointsPanel extends DisplayElement {
  /**
   * DOM element intended to be used with the `Points` class.
   * @param {Object} p
   */
  constructor({ score = false, bonus = false }) {
    // TODO: Use javascript to create this
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
