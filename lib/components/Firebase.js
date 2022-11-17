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
import { firebaseConfig } from '../../firebase-config';
import { required } from './utils.js';

export class Firebase {
  app;
  auth;
  database;
  databaseConnected = false;
  userCredentials;
  uid;

  constructor({
    expName,
    workerId = required('workerId'),
    config = firebaseConfig,
  }) {
    this.app = initializeApp(config);
    this.auth = getAuth(this.app);
    this.database = getDatabase(this.app);
    if (location.hostname === 'localhost') {
      connectAuthEmulator(this.auth, 'http://localhost:9099');
      connectDatabaseEmulator(this.database, 'localhost', 8000);
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

    this.expName = expName;
    this.workerId = workerId;
  }

  async signInAnonymously() {
    try {
      await signOut(this.auth);
    } catch (error) {
      console.error(error.message);
    }

    try {
      this.userCredentials = await signInAnonymously(this.auth);
      this.uid = this.userCredentials.user.uid;
    } catch (error) {
      console.error(error.message);
    }
  }

  async saveTrial(trialdata, savesuccessfulDetail) {
    trialdata = this.cleanTrialData(trialdata);
    try {
      await set(
        ref(
          this.database,
          `experiments/${this.expName}/${this.uid}/${trialdata.trialNumber}`
        ),
        trialdata
      );
      const saveSuccessfulEvent = new CustomEvent('savesuccessful', {
        bubbles: true,
        cancelable: true,
        detail: savesuccessfulDetail,
      });
      document.body.dispatchEvent(saveSuccessfulEvent);
    } catch (error) {
      console.error(error.message);
    }
  }

  async recordCompletion() {
    try {
      await set(
        ref(
          this.database,
          `workers/${this.workerId}/${this.expName}/${this.uid}`
        ),
        {
          uid: this.uid,
        }
      );
    } catch (error) {
      console.error(error.message);
    }
  }

  cleanTrialData(trialdata) {
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
    var snapshot;
    try {
      snapshot = await get(
        ref(this.database, `/experiments/${this.expName}/${this.uid}`)
      );
    } catch (error) {
      console.error(error.message);
    }
    if (snapshot.exists()) {
      const subjData = JSON.stringify(snapshot.toJSON(), null, '\t');
      var a = document.createElement('a');
      var file = new Blob([subjData], { type: 'text/plain' });
      a.href = URL.createObjectURL(file);
      a.download = `${this.expName}-${this.uid}.json`;
      a.click();
    } else {
      console.error('Failed to find data in the database.');
    }
  }
}
