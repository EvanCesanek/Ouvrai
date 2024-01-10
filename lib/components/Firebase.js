import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInAnonymously,
  connectAuthEmulator,
  signOut,
} from 'firebase/auth';
import {
  get,
  getDatabase,
  ref,
  set,
  connectDatabaseEmulator,
  onValue,
} from 'firebase/database';
import firebaseConfig from '../../config/firebase-config.js';
import { required } from './utils.js';

/**
 * The Firebase class maintains connection with Firebase and handles saving data to the correct database locations at various points.
 */
export class Firebase {
  app;
  auth;
  database;
  databaseConnected = false;
  //authConnected = false;
  //userCredentials;
  uid;

  /**
   * An instance of the Firebase class is initialized as part of `new Experiment()`.
   * @param {Object} p
   * @param {String} p.experiment Name of the experiment, for use in Firebase database paths.
   * @param {String} p.workerId Prolific or AMT worker ID, for use in Firebase database paths (workers branch).
   * @param {Boolean} p.demo Set true to prevent Firebase initialization in experiment demos.
   * @param {Object} p.config Firebase project configuration, default imported JSON from /config/firebase-config.js.
   */
  constructor({
    experiment,
    workerId = required('workerId'),
    demo = false,
    config = firebaseConfig,
  }) {
    this.experiment = experiment;
    this.workerId = workerId;
    this.demo = demo;

    // No Firebase in demo versions
    if (this.demo) {
      console.warn(
        'You are running a demo version of an Ouvrai experiment. Not connecting to Firebase.'
      );
      return;
    }

    this.app = initializeApp(config);
    this.auth = getAuth(this.app);
    this.database = getDatabase(this.app);

    // If we are in Vite dev mode, connect the local emulators
    if (import.meta.env.DEV) {
      connectAuthEmulator(
        this.auth,
        //`http://${location.hostname}:${authEmulatorPort}`
        `http://${location.hostname}:${
          import.meta.env.VITE_EMULATORS_AUTH_PORT
        }`
      );
      connectDatabaseEmulator(
        this.database,
        location.hostname,
        import.meta.env.VITE_EMULATORS_DATABASE_PORT
      );
    }

    // Monitor whether we are connected to Firebase and change `databaseConnected` flag as appropriate
    const connectedRef = ref(this.database, '.info/connected');
    onValue(connectedRef, (snap) => {
      if (snap.val() === true) {
        this.databaseConnected = true;
        const connectedEvent = new CustomEvent('dbconnect', {
          bubbles: true,
          cancelable: true,
          detail: {},
        });
        document.body.dispatchEvent(connectedEvent);
        //console.log(`dispatched dbconnect event to body:`);
        //console.log(connectedEvent);
      } else {
        this.databaseConnected = false;
        const disconnectedEvent = new CustomEvent('dbdisconnect', {
          bubbles: true,
          cancelable: true,
          detail: {},
        });
        document.body.dispatchEvent(disconnectedEvent);
        //console.log(`dispatched dbdisconnect event to body:`);
        //console.log(disconnectedEvent);
      }
    });
  }

  /**
   * Asynchronous sign-out procedure. Awaits signOut, then returns the signed out User.
   * @returns {User} Previous user
   */
  async signOut() {
    if (this.demo) return;

    let previousUser = this.auth.currentUser;
    if (previousUser) {
      await signOut(this.auth);
      return previousUser;
    } else {
      return;
    }
  }

  /**
   * Aynchronous sign-in procedure. Returns the Promise of the new user.
   * @param {Number} retries If in dev mode, number of times to retry (3 seconds/try). Default 3.
   * @returns {Promise<UserCredential>} Current user
   */
  signInAnonymous(retries = 3) {
    if (this.demo) return;

    console.log('Authenticating with Firebase...');
    if (import.meta.env.DEV) {
      // Retry N times with delay via Promise catch chaining
      function rejectDelay(reason) {
        return new Promise(function (resolve, reject) {
          if (
            reason.code === 'auth/network-request-failed' ||
            reason.code === 'auth/internal-error'
          ) {
            console.warn(
              'Ouvrai sign-in failed in development mode. Auth Emulator may need more time to start. Retrying in 3 seconds.'
            );
            setTimeout(reject.bind(null, reason), 3000); // TODO: double this wait time on each retry?
          } else {
            console.error(reason);
          }
        });
      }
      let p = signInAnonymously(this.auth);
      for (let i = 0; i < retries; i++) {
        p = p
          .catch(() => {
            return signInAnonymously(this.auth);
          })
          .catch(rejectDelay);
      }
      return p;
    } else {
      return signInAnonymously(this.auth);
    }
  }

  /**
   * Asynchronous write trialdata to Firebase database.
   * If successful, sets `exp.firebase.saveSuccessful = true` and dispatches a `'savesuccessful'` event to document.body.
   * If fails, sets `exp.firebase.saveFailed` to the Firebase error message.
   * @param {Object} trialdata The JSON object to be saved. Must contain `trialNumber` property, which determines where it will be saved.
   * @param {*} savesuccessfulDetail Optional additional information to pass in the `detail` property of the `'savesuccessful'` event.
   */
  async saveTrial(trialdata, savesuccessfulDetail) {
    this.saveSuccessful = false;

    if (trialdata.isReplay === true) {
      return;
    }

    if (this.demo) {
      this.saveSuccessful = true;
      return;
    }

    trialdata = this.#cleanTrialData(trialdata);
    try {
      await set(
        ref(
          this.database,
          `experiments/${this.experiment}/${this.uid}/${trialdata.trialNumber}`
        ),
        trialdata
      );
      this.saveSuccessful = true;
      const saveSuccessfulEvent = new CustomEvent('savesuccessful', {
        bubbles: true,
        cancelable: true,
        detail: savesuccessfulDetail,
      });
      document.body.dispatchEvent(saveSuccessfulEvent);
    } catch (error) {
      this.saveFailed = error.message;
    } finally {
      return;
    }
  }

  /**
   * Asynchronous write to workers branch indicating the time of consent.
   * @returns {Promise<void>} Promise that resolves when write is complete.
   */
  recordConsent() {
    if (this.demo) return;

    return set(
      ref(
        this.database,
        `/workers/${this.workerId}/${this.experiment}/${this.uid}/consented`
      ),
      new Date().toISOString()
    );
  }

  /**
   * Asynchronous write to workers branch indicating the time of completion.
   * @returns {Promise<void>} Promise that resolves when write is complete.
   */
  recordCompletion() {
    if (this.demo) return Promise.resolve();

    return set(
      ref(
        this.database,
        `/workers/${this.workerId}/${this.experiment}/${this.uid}/completed`
      ),
      new Date().toISOString()
    );
  }

  /**
   * Clean the trial data before saving to Firebase by replacing values like `[]`, `null`, and `undefined` with -9999.
   * If this is not done, these values will simply be excluded (Firebase interprets null values to mean "delete data at this location").
   * One example of a potential negative consequence of __not cleaning__ is when frame data arrays contain `null` on some frames.
   * If we are missing these frames, it becomes impossible to align the frame data arrays with one another.
   * @param {Object} trialdata Trial data that is about to be saved to Firebase
   * @returns {Object} Cleaned trial data
   */
  #cleanTrialData(trialdata) {
    const nanValue = -9999;
    Object.keys(trialdata).forEach(function (tdi) {
      if (Array.isArray(trialdata[tdi])) {
        if (trialdata[tdi].length === 0) {
          // replace empty arrays with nanValue
          trialdata[tdi][0] = nanValue;
        } else {
          // replace array entries that are falsy but not zero or false
          trialdata[tdi] = trialdata[tdi].map((x) =>
            !x && x !== 0 && x !== false ? nanValue : x
          );
        }
      } else if (
        // trial data that is falsy but not zero or false
        !trialdata[tdi] &&
        trialdata[tdi] !== 0 &&
        trialdata[tdi] !== false
      ) {
        trialdata[tdi] = nanValue;
      }
    });
    return trialdata;
  }

  /**
   * Locally save all data saved to Firebase so far in the current session (to Downloads folder).
   * In DEV mode, Ouvrai creates a default event listener that triggers this function on pressing `Shift+S`.
   * This listener is disabled in production builds.
   */
  async localSave() {
    let snapshot;
    try {
      snapshot = await get(
        ref(this.database, `/experiments/${this.experiment}/${this.uid}`)
      );
    } catch (error) {
      console.error(error.message);
    }
    if (snapshot.exists()) {
      const subjJSON = {};
      subjJSON[this.uid] = snapshot.val();
      const subjData = JSON.stringify(subjJSON, null, 2);
      let a = document.createElement('a');
      let file = new Blob([subjData], { type: 'text/plain' });
      a.href = URL.createObjectURL(file);
      a.download = `data_TEST_${this.experiment}-${this.uid}.json`;
      a.click();
    } else {
      console.error('Failed to find data in the database.');
    }
  }
}
