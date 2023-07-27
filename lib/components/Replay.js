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

/**
 * The Replay class allows you to read in Ouvrai JSON files and select subject-trials from which to replay the saved data.
 * Note this is not guaranteed to match exactly what the participant saw.
 * The Replay machine simply animates the specified `avatar` using the recorded position and rotation data.
 * Ideally this will cause your experiment to go through the same series of states that the participant experienced.
 * @extends DisplayElement
 */
export class Replay extends DisplayElement {
  /**
   * Create a Replay machine instance in the experiment. Disabled in production builds.
   * @param {Object3D} avatar The object to control with the replay data, default `new Object3D()`
   * @param {String} positionDataName The name of the position data object (`Vector3`) in the trial data, default 'posn'
   * @param {String} rotationDataName The name of the rotation data object (`Quaternion`) in the trial data, default 'ori'
   * @param {HTMLElement} parent The parent DOM element in which to embed the Replay GUI, default 'points-panel'
   */
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
    this.uploader.dom.addEventListener('jsonload', this.#handleJSON.bind(this));

    this.clock = new Clock();
  }

  /**
   * Initialize the list of subject IDs when a JSON file is loaded and set up listener for a selected subject.
   * @private
   */
  #handleJSON() {
    this.gui.open();
    let subjects = Object.keys(this.uploader.json);
    this.controllers['subject'] = this.controllers['subject']
      .options(subjects)
      .onChange(this.#handleChangeSubject.bind(this))
      .setValue(subjects[0]);
  }

  /**
   * Initialize the list of trials for a selected subject and set up listener for a selected trial.
   * Also dispatches a `replayinfo` event containing the experiment configuration object to document.body, so the main experiment code can set config params as needed (see vr-gen template).
   * @private
   * @param {String} subject Subject ID (Firebase UID)
   */
  #handleChangeSubject(subject) {
    let trials = Object.keys(this.uploader.json[subject]);
    this.controllers['trial'] = this.controllers['trial']
      .options(trials)
      .onChange(this.#handleChangeTrial.bind(this))
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

  /**
   * Set up a three.js Animation based on the avatar and selected trial data and start playing.
   * @private
   * @param {Number|String} trial The trial number key in the JSON
   */
  #handleChangeTrial(trial) {
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

  /**
   * Dispatch a `replaytrial` event containing the trial data to document.body, so the main experiment code can set trial params as needed (see vr-gen template).
   * This occurs at the start of every animation loop of a selected trial.
   * @private
   */
  #dispatchReplayTrial() {
    document.body.dispatchEvent(
      new CustomEvent('replaytrial', {
        bubbles: true,
        cancelable: true,
        detail: { ...this.replayTrial },
      })
    );
  }

  /**
   * Start the replay Animation, dispatching `replaytrial` event at the start of every animation loop.
   */
  play() {
    this.action.paused = false;
    this.action.play();
    // initial event and loop listener
    this.#dispatchReplayTrial();
    //this.mixer.removeEventListener('loop', this.dispatchReplayTrial); // just in case
    this.mixer.addEventListener('loop', this.#dispatchReplayTrial.bind(this));
  }

  /**
   * Stop the replay Animation.
   */
  stop() {
    this.action.paused = false;
    this.action.stop();
  }

  /**
   * Pause the replay Animation.
   */
  pause() {
    this.action.paused = true;
  }

  /**
   * Step the replay Animation forward in time by 0.01 seconds (should pause first).
   */
  step() {
    this.action.time += 0.01;
  }

  /**
   * Call `exp.replay.update()` in your `displayFunc()` to update the Animation on each frame.
   * Note that this approach interpolates the saved kinematic data based on the current frame timestamp.
   */
  update() {
    if (!this.mixer) {
      return;
    }
    const delta = this.clock.getDelta();
    this.mixer.update(delta);
  }
}

/**
 * The JSONReader class helps to read Ouvrai data files for consumption by the Replay machine.
 * Simplified from https://gomakethings.com/how-to-upload-and-process-a-json-file-with-vanilla-js/
 */
export class JSONReader extends DisplayElement {
  /**
   * Create a new JSONReader.
   */
  constructor() {
    let html = `\
      <div style="margin-top:10px">
        <input type="file" id="file" accept=".json">
      </div>`;
    super({
      element: html,
      parent: document.getElementById('points-panel'),
      hide: false,
    });

    this.file = document.getElementById('file');

    this.reader = new FileReader();
    this.reader.addEventListener('load', this.handleFile.bind(this));

    this.file.addEventListener('change', this.handleSubmit.bind(this));
  }

  /**
   * Handle selected file change events
   * @param {Event} event The file change event
   */
  handleSubmit() {
    // If there's no file, do nothing
    if (!this.file.value.length) return;
    // Read the file
    this.reader.readAsText(this.file.files[0]);
  }

  /**
   * Log the uploaded file to the console
   * @param {Event} event The file loaded event
   */
  handleFile(event) {
    let str = event.target.result;
    this.json = JSON.parse(str);
    console.log('json', this.json);
    this.dom.dispatchEvent(new Event('jsonload'));
  }
}
