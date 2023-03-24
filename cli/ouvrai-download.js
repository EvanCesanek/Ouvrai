#!/usr/bin/env node

import { Command } from 'commander';
import ora from 'ora';
import {
  dateStringYMDHMS,
  exists,
  firebaseClient,
  firebaseGetData,
  getLatestDeployProject,
} from './cli-utils.js';
import firebaseConfig from '../config/firebase-config.js';
import { mkdir, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';

const program = new Command()
  .option(
    '-p, --project <projectId>',
    'Specify a Firebase project; if omitted, looks in study-history.json, then in /config/firebase-config.js'
  )
  .option('-f, --full', '[Not recommended] Download all data from study node')
  .argument('<experiment-name>', 'Name of experiment')
  .showHelpAfterError()
  .parse();

const options = program.opts();
const expName = program.processedArgs[0];

const projectPath = new URL(`../experiments/${expName}`, import.meta.url);
const projectPathDecoded = fileURLToPath(projectPath);

let spinner = ora(`Accessing study at ${projectPathDecoded}.`).start();
if (await exists(projectPath)) {
  spinner.succeed();
} else {
  spinner.fail(`No study found at ${projectPathDecoded}.`);
  process.exit(1);
}

let projectId =
  options.project ||
  getLatestDeployProject(expName) ||
  firebaseConfig.projectId;
let firebasePath = `/experiments/${expName}`;

let savePath = new URL(
  `../experiments/${expName}/analysis/data_${dateStringYMDHMS()}.json`,
  import.meta.url
);
let savePathDecoded = fileURLToPath(savePath);
if (!(await exists(savePath))) {
  mkdirSync(
    fileURLToPath(
      new URL(`../experiments/${expName}/analysis`, import.meta.url)
    )
  );
}
if (options.full) {
  // If you are getting all the data from that node (not recommended...)
  let client = firebaseClient();
  let spinner = ora(`Downloading data from ${firebasePath}...`).start();
  try {
    await client.database.get(firebasePath, {
      project: 'cognitivescience',
      output: savePathDecoded,
    });
    spinner.succeed(`Data from ${firebasePath} saved to ${savePathDecoded}...`);
    process.exit(0);
  } catch (err) {
    spinner.fail(err.message);
    process.exit(1);
  }
}

// TODO: Would be really nice to use the Admin SDK here for better querying...
spinner = ora(
  `Downloading data for participants who completed the study from ${firebasePath}...`
).start();
try {
  let data = Object.keys(
    await firebaseGetData(firebasePath, projectId, true, 'info', 'false')
  );
  spinner.succeed();
} catch (err) {
  spinner.fail(err.message);
  process.exit(1);
}

spinner = ora(`Saving data...`).start();
try {
  await writeFile(savePath, JSON.stringify(allData, null, 2), 'utf8');
  spinner.succeed(
    `Data (N = ${retrievedWorkers.length}) saved to ${fileURLToPath(savePath)}.`
  );
} catch (err) {
  spinner.fail(`Failed to save data! Error: ${err.message}`);
}
