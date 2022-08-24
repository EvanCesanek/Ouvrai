import { Tween } from '@tweenjs/tween.js';
import { Vector3 } from 'three';
import { CSS2D } from './CSS2D';

export class Points {
  total;
  text;
  css2d;
  currencyFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  });
  panel;

  constructor() {
    this.total = 0;
    this.text = this.currencyFormatter.format(0);
    this.css2d = new CSS2D('');
    this.css2d.object.element.style.fontSize = '24pt';
    this.panelPoints = document.getElementById('points-panel-points');
    this.panelPoints.textContent = this.total;
    this.panelBonus = document.getElementById('points-panel-bonus');
    this.panelBonus.textContent = this.text;
    this.panelWorker = document.getElementById('points-panel-worker');
  }

  add(
    earned,
    animate = false,
    animateParams = {
      color: 'white',
      startPosn: new Vector3(...[0, 0, 0]),
      endPosn: new Vector3(...[0, 0.1, 0]),
    }
  ) {
    const updatePointsTween = new Tween(this)
      // duration depends on amount
      .to({ total: this.total + earned }, earned * 10)
      .onUpdate(() => {
        this.total = Math.round(this.total);
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
      this.css2d.object.element.innerHTML = `+${earned}`;
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
      this.total += earned;
      this.panelPoints.textContent = this.total;
      this.text = this.currencyFormatter.format(this.total / 10000);
      this.panelBonus.textContent = this.text;
    }
  }
}
