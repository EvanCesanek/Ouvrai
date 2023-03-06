#!/usr/bin/env node

import { Command } from 'commander';
import {
  dateStringYMDHMS,
  firebaseClient,
  getStudyConfig,
  firebaseChooseProject,
  isAlphanumeric,
  firebaseGetData,
} from './cli-utils.js';
import firebaseConfig from '../config/firebase-config.js';
import { writeFile } from 'fs/promises';
import ora from 'ora';

const program = new Command()
  .name('weblab download-workers')
  .argument('<experiment-name>', 'name of experiment directory')
  .option('-p --project [project]', 'choose or specify project')
  .showHelpAfterError()
  .parse();
const options = program.opts();

const expName = program.args[0];

// Load the relevant config file
let config = await getStudyConfig(expName);

// Initialize connection to firebase via admin sdk
const client = firebaseClient();

// User can choose project from list (boolean option), supply name of project (value option), or use default (no option)
let projectId = options.project || firebaseConfig.projectId;
if (projectId === true) {
  projectId = await firebaseChooseProject(client);
}

if (
  !Array.isArray(config.workersToDownload) ||
  !config.workersToDownload.length
) {
  console.log(
    `Error: workersToDownload incorrectly configured in ${expName} config file.`
  );
  process.exit(1);
}
const allData = {}; // accumulate subject data here
let missedWorkers = [];
let retrievedWorkers = [];

for (let workerId of config.workersToDownload) {
  console.log('--------------------------');
  if (!isAlphanumeric(workerId)) {
    ora().fail(`Invalid worker ID ${workerId}. Must be alphanumeric.`);
    continue;
  }
  // Check workers branch
  let refString = `/workers/${workerId}/${expName}`;
  let spinner = ora(`Checking completion record at ${refString}...`).start();
  let workerInfo = await firebaseGetData(refString, projectId, true);

  let keys;
  if (workerInfo) {
    keys = Object.keys(workerInfo); // keys should only be the $uid and 'submitted'
    keys = keys.filter((x) => x !== 'submitted');
    if (keys.length > 1) {
      // not good if there is more than one key after removing 'submitted'...
      spinner.warn(
        `Found multiple completion records for ${workerId}: ${keys.join(', ')}`
      );
    } else {
      spinner.succeed(`Found completion record for ${workerId}: ${keys[0]}`);
    }
  } else {
    missedWorkers.push(workerId);
    spinner.warn(`Failed to find entry at ${refString}.`);
    continue;
  }

  // With the UID, we can access the data from the experiments branch
  for (let uid of keys) {
    refString = `/experiments/${expName}/${uid}`;
    let spinner = ora(`Downloading data from ${refString}...`).start();
    let subjData = await firebaseGetData(refString, projectId, true);
    if (subjData) {
      allData[uid] = subjData; // append to allData
      retrievedWorkers.push(workerId);
      spinner.succeed(`Retrieved data for participant ${uid}`);
    } else {
      missedWorkers.push(workerId);
      spinner.fail(`Failed to find data at ${refString}`);
      continue;
    }
  }
}
console.log('--------------------------');
// Remove any retrieved workers from missed workers list
// This could happen if they had one not-found key and one found key
missedWorkers = missedWorkers.filter((x) => !retrievedWorkers.includes(x));
// Remove any duplicates (if they had multiple bad or good keys)
retrievedWorkers = [...new Set(retrievedWorkers)];
missedWorkers = [...new Set(missedWorkers)];

if (missedWorkers.length > 0) {
  ora().warn(`Failed to download data for: ${missedWorkers.join(', ')}`);
}

if (retrievedWorkers.length > 0) {
  let savePath = new URL(
    `../experiments/${expName}/analysis/data_${dateStringYMDHMS()}.json`,
    import.meta.url
  );
  let spinner = ora(`Saving data...`);
  try {
    await writeFile(savePath, JSON.stringify(allData, null, 2), 'utf8');
    spinner.succeed(
      `Data (N = ${retrievedWorkers.length}) saved to ${savePath.pathname}.`
    );
  } catch (err) {
    spinner.fail(`Failed to save data! Error: ${err.message}`);
  }
}
