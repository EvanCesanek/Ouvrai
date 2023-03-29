import { JSONReader } from './JSONReader';
import { DisplayElement } from './DisplayElement';
import {
  AnimationClip,
  AnimationMixer,
  Clock,
  Object3D,
  Quaternion,
  QuaternionKeyframeTrack,
  VectorKeyframeTrack,
} from 'three';
import GUI from 'three/examples/jsm/libs/lil-gui.module.min.js'; // https://lil-gui.georgealways.com/

export class Replay extends DisplayElement {
  constructor(
    avatar = new Object3D(),
    positionDataName = 'posn',
    rotationDataName = 'ori',
    parent = document.getElementById('points-panel')
  ) {
    if (import.meta.env.PROD) {
      return null; // No replay machine in production build!
    }
    let html = `
      <div style="margin-top: 10px">
        <select name="subject" id="replay-select-subject" style="width:40%">
            <option value="" disabled selected>Choose participant:</option>
        </select>
        <select name="trial" id="replay-select-trial" style="width:40%; margin: 0 10px">
            <option value="" disabled selected>Choose trial:</option>
        </select>
      </div>`;
    super({
      element: html,
      parent: parent,
    });
    this.avatar = avatar;
    this.positionDataName = positionDataName;
    this.rotationDataName = rotationDataName;

    this.subject = '';
    this.trial = '0';
    this.action = {};
    this.action.time = 0;
    this.action.timeScale = 1;

    this.gui = new GUI({
      width: '100%',
      title: 'Replay',
      container: this.dom.parentNode,
    });
    //this.gui.hide();
    this.gui.close();
    this.controllers = [];
    this.gui.addFolder('Select');
    this.controllers['subject'] = this.gui.folders[0].add(this, 'subject');
    this.controllers['trial'] = this.gui.folders[0].add(this, 'trial');
    this.gui.addFolder('Controls');
    this.controllers['time'] = this.gui.folders[1]
      .add(this.action, 'time', 0, 1)
      .listen();
    this.controllers['timeScale'] = this.gui.folders[1].add(
      this.action,
      'timeScale'
    );

    this.uploader = new JSONReader();
    this.uploader.dom.addEventListener('jsonload', this.handleJSON.bind(this));

    // this.subjectSelect = document.getElementById('replay-select-subject');
    // this.subjectSelect.onchange = this.changeSubject.bind(this);
    // this.trialSelect = document.getElementById('replay-select-trial');
    // this.trialSelect.onchange = this.changeTrial.bind(this);

    this.clock = new Clock();
  }

  handleJSON() {
    this.gui.open();
    let subjects = Object.keys(this.uploader.json);
    this.controllers['subject'] = this.controllers['subject']
      .options(subjects)
      .onChange(this.handleChangeSubject.bind(this))
      .setValue(subjects[0]);
    // this.gui
    //   .add(this, 'subject', subjects)
    //   .onChange(this.handleChangeSubject.bind(this))
    //   .setValue(subjects[0]);
    //this.populateDropdown(Object.keys(this.uploader.json), this.subjectSelect);
  }

  // populateDropdown(options, selectElement) {
  //   let placeholder = selectElement.firstElementChild; // keep the default "Choose X:" option
  //   let elements = [placeholder];
  //   for (let opt of options) {
  //     let el = document.createElement('option');
  //     el.textContent = opt;
  //     el.value = opt;
  //     elements.push(el);
  //   }
  //   selectElement.replaceChildren(...elements);
  // }

  handleChangeSubject(subject) {
    let trials = Object.keys(this.uploader.json[subject]);
    this.controllers['trial'] = this.controllers['trial']
      .options(trials)
      .onChange(this.handleChangeTrial.bind(this))
      .setValue(trials[0]);
    this.cfg = this.uploader.json[subject]['info'];
    console.log('Replay Info', this.cfg);

    document.body.dispatchEvent(
      new CustomEvent('replayinfo', {
        bubbles: true,
        cancelable: true,
        detail: this.cfg,
      })
    );
  }

  handleChangeTrial(trial) {
    this.replayTrial = this.uploader.json[this.subject][trial];
    console.log('Replay Trial:', this.replayTrial);
    const tracks = [];

    // Create keyframe tracks
    // Flat value arrays required! Internal loop uses a stride parameter for each keyframeType.
    // https://newscrewdriver.com/2021/05/16/notes-of-a-three-js-beginner-quaternionkeyframetrack-struggles/
    let timeArray = this.replayTrial['t'].map(
      (x, i, arr) => (x - arr[0]) / 1000
    );

    let positionArray = this.replayTrial[this.positionDataName].flatMap(
      (x) => Object.values(x) // these are not Vector3s...
    );
    let positionTrack = new VectorKeyframeTrack(
      '.position',
      timeArray,
      positionArray
    );
    tracks.push(positionTrack);

    if (this.rotationDataName) {
      let quaternionArray = this.replayTrial[this.rotationDataName].flatMap(
        (x) =>
          x.isQuaternion
            ? [x._x, x._y, x._z, x._w]
            : x.isEuler
            ? new Quaternion().setFromEuler(x).toArray()
            : Object.values(x)
      );
      let quaternionTrack = new QuaternionKeyframeTrack(
        '.quaternion',
        timeArray,
        quaternionArray
      );
      tracks.push(quaternionTrack);
    }

    // Create animation
    const clip = new AnimationClip('replay', -1, tracks);
    // Animate static meshes by connecting to animation mixer
    this.mixer = new AnimationMixer(this.avatar);

    // Create an action on that mixer
    this.action = this.mixer.clipAction(clip);
    this.play();

    // GUI
    this.controllers['time'].destroy();
    this.controllers['timeScale'].destroy();
    this.controllers['time'] = this.gui.folders[1].add(
      this.action,
      'timeScale',
      0,
      1
    );
    this.controllers['timeScale'] = this.gui.folders[1]
      .add(this.action, 'time', 0, clip.duration)
      .listen();
  }

  dispatchReplayTrial() {
    document.body.dispatchEvent(
      new CustomEvent('replaytrial', {
        bubbles: true,
        cancelable: true,
        detail: { ...this.replayTrial },
      })
    );
  }

  setAvatar(avatar) {
    this.avatar = avatar;
  }

  play() {
    this.action.paused = false;
    this.action.play();
    // initial event and loop listener
    this.dispatchReplayTrial();
    //this.mixer.removeEventListener('loop', this.dispatchReplayTrial); // just in case
    this.mixer.addEventListener('loop', this.dispatchReplayTrial.bind(this));
  }

  stop() {
    this.action.paused = false;
    this.action.stop();
  }

  pause() {
    this.action.paused = true;
  }

  step() {
    this.action.time += 0.01;
  }

  update() {
    if (!this.mixer) {
      return;
    }
    const delta = this.clock.getDelta();
    this.mixer.update(delta);
  }
}
