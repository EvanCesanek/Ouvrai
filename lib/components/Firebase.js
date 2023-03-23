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

export class Firebase {
  app;
  auth;
  database;
  databaseConnected = false;
  authConnected = false;
  userCredentials;
  uid;

  constructor({
    experiment,
    workerId = required('workerId'),
    demo = false,
    config = firebaseConfig,
    authEmulatorPort = 9099,
    databaseEmulatorPort = 8000,
  }) {
    this.experiment = experiment;
    this.workerId = workerId;
    this.demo = demo;

    // No Firebase in demo versions
    if (this.demo) {
      this.databaseConnected = true;
      this.authConnected = true;
      return;
    }

    this.app = initializeApp(config);
    this.auth = getAuth(this.app);
    this.database = getDatabase(this.app);
    if (
      location.hostname === 'localhost' ||
      location.hostname === '127.0.0.1'
    ) {
      connectAuthEmulator(this.auth, `http://localhost:${authEmulatorPort}`);
      connectDatabaseEmulator(this.database, 'localhost', databaseEmulatorPort);
    }

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
   *
   * @returns {Promise<UserCredential>} previous user
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
            setTimeout(reject.bind(null, reason), 3000); // TODO: double this wait time on each retry
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

  async saveTrial(trialdata, savesuccessfulDetail) {
    if (trialdata.isReplay === true) {
      this.saveSuccessful = false;
      return;
    }

    if (this.demo) {
      this.saveSuccessful = true;
      return;
    }

    this.saveSuccessful = false;
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
    }
  }

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

  recordCompletion() {
    if (this.demo) return;

    return set(
      ref(
        this.database,
        `/workers/${this.workerId}/${this.experiment}/${this.uid}/completed`
      ),
      new Date().toISOString()
    );
  }

  #cleanTrialData(trialdata) {
    const nanValue = -9999;
    Object.keys(trialdata).forEach(function (tdi) {
      if (Array.isArray(trialdata[tdi])) {
        if (trialdata[tdi].length === 0) {
          trialdata[tdi][0] = nanValue;
        } else {
          trialdata[tdi] = trialdata[tdi].map((x) =>
            !x && x !== 0 && x !== false ? nanValue : x
          );
        }
      } else if (
        !trialdata[tdi] &&
        trialdata[tdi] !== 0 &&
        trialdata[tdi] !== false
      ) {
        trialdata[tdi] = nanValue;
      }
    });
    return trialdata;
  }

  async localSave() {
    if (this.demo) return;

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
      a.download = `${this.experiment}-${this.uid}.json`;
      a.click();
    } else {
      console.error('Failed to find data in the database.');
    }
  }
}
