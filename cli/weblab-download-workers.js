#!/usr/bin/env node

import { Command } from 'commander';
import { join } from 'path';
import { existsSync, writeFileSync } from 'fs';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { dateStringYMDHMS } from './cli-utils.js';
import { firebaseConfig } from '../firebase-config.js';

import { dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));

const program = new Command();
program
  .name('weblab download-workers')
  .argument('<experiment-name>', 'name of experiment directory')
  .showHelpAfterError();
program.parse(process.argv);
//const options = program.opts();

const expName = program.args[0];

// Load the relevant config file
var projectPath = join(__dirname, '../experiments', expName);
var configPath = join(__dirname, '../experiments', expName, 'mturk-config.mjs');
if (!existsSync(configPath)) {
  console.error(`ERROR: config file ${configPath} not found`);
  process.exit(1);
}
var config;
try {
  config = await import(configPath); // async import() for variable import paths in ES6+
} catch (error) {
  console.error('ERROR: failed to import config file');
  console.error(error.message);
  process.exit(1);
}
config = config.parameters;

// Initialize connection to firebase via admin sdk
// Requires process.env.GOOGLE_APPLICATION_CREDENTIALS = '/path/to/serviceAccountFile.json'
const app = initializeApp({ databaseURL: firebaseConfig.databaseURL });
const db = getDatabase();

if (
  !Array.isArray(config.workersToDownload) ||
  !config.workersToDownload.length
) {
  console.log(
    `ERROR: workersToDownload incorrectly configured in ${expName} config file.`
  );
  process.exit(1);
}
var allData = {}; // accumulate subject data here
var undownloadedWorkers = [];

for (let subjectString of config.workersToDownload) {
  // First we must find the UID from the workers branch
  var refString = 'workers/' + subjectString + '/' + expName;
  console.log(`- Checking if ${refString} node exists in our database...`);
  var workerInfoRef = db.ref(refString);
  var dataSnapshot;
  try {
    dataSnapshot = await workerInfoRef.once('value');
  } catch (error) {
    console.error(error.message);
  }
  var uid;
  if (dataSnapshot.exists()) {
    let workerInfoNode = dataSnapshot.val();
    let keys = Object.keys(workerInfoNode); // keys should only be the $uid and 'submitted'
    let idx = keys.findIndex((x) => x == 'submitted');
    if (idx !== -1) {
      keys.splice(idx, 1); // remove 'submitted' (if it exists)
    }
    if (keys.length > 1) {
      // if there is more than one key after removing 'submitted', that's not good!
      console.log(
        `--- WARNING: ${subjectString} completed the experiment multiple times!`
      );
    }
    keys.forEach((s) => (s == 'submitted' ? null : (uid = s))); // loop over, grabbing the uid
  } else {
    undownloadedWorkers.push(subjectString);
    console.log(
      `--- ERROR: Failed to find ${subjectString} in workers branch. Continuing with next worker...\n`
    );
    continue;
  }

  // With the UID, we can access the data from the experiments branch
  refString = 'experiments/' + expName + '/' + uid;
  console.log(
    '--- Worker ID found and UID retrieved. Checking if ' +
      refString +
      ' node exists...'
  );
  var subjDataRef = db.ref(refString);
  try {
    dataSnapshot = await subjDataRef.once('value');
  } catch (error) {
    console.error(error.message);
  }
  var subjDataNode;
  if (dataSnapshot.exists()) {
    subjDataNode = dataSnapshot.val(); // we pull the subject data
  } else {
    undownloadedWorkers.push(subjectString);
    console.log(
      `\n----- ERROR: Failed to find ${uid} in the database. Continuing with next worker...\n`
    );
    continue;
  }
  allData[uid] = subjDataNode; // append to allData; square bracket notation because uid is a string
  console.log('----- Worker data appended to output.\n');
}

const numRetrieved =
  config.workersToDownload.length - undownloadedWorkers.length;
console.log(`- Done! Retrieved data from ${numRetrieved} subjects.`);
if (undownloadedWorkers.length > 0) {
  console.log(`- Failed to download data for:`);
  console.log(undownloadedWorkers);
}
var savePath = join(projectPath, `data_${dateStringYMDHMS()}.json`);
writeFileSync(savePath, JSON.stringify(allData, null, 2), 'utf8');
console.log(`--- Saved data to ${savePath}`);

// Must close firebase to exit cleanly
try {
  await deleteApp(app);
} catch (error) {
  console.error(error.message);
}
