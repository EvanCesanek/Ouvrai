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
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { rm, unlink, writeFile } from 'fs/promises';
import { readJSON } from 'fs-extra/esm';

const program = new Command()
  .name('ouvrai download')
  .argument('<experiment>', 'Name of experiment')
  .option(
    '-p, --project <projectId>',
    'Specify a Firebase project; default from study-history.json, then /config/firebase-config.js'
  )
  .option(
    '-p, --partial',
    'Download data from all sessions, including partial sessions'
  )
  .option(
    '-d, --dev',
    'Download from Firebase Emulator database (ouvrai dev must be running)'
  )
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
  (options.dev ? undefined : await getLatestDeployProject(expName)) ||
  firebaseConfig.projectId;
let firebasePath = `/experiments/${expName}`;

let savePath = new URL(`../experiments/${expName}/analysis`, import.meta.url);
if (!(await exists(savePath))) {
  mkdirSync(savePath);
}
let saveFile = new URL(
  `../experiments/${expName}/analysis/data_${dateStringYMDHMS()}.json`,
  import.meta.url
);
let saveFileDecoded = fileURLToPath(savePath);

// if (options.full) {
//   // If you are getting all the data from that node (not recommended...)
//   let client = firebaseClient();
//   let spinner = ora(`Downloading data from ${firebasePath}...`).start();
//   try {
//     await client.database.get(firebasePath, {
//       project: projectId,
//       output: saveFileDecoded,
//     });
//     spinner.succeed(`Data from ${firebasePath} saved to ${saveFileDecoded}.`);
//     process.exit(0);
//   } catch (err) {
//     spinner.fail(err.message);
//     process.exit(1);
//   }
// }

// Complete participant data only
spinner = ora(
  `Downloading participants with complete data from ${firebasePath}...`
).start();
let data;

try {
  if (options.dev) {
    let client = firebaseClient();
    await client.emulators.export(fileURLToPath(savePath), {
      project: projectId,
      force: true,
    });
    let exportFile = new URL(
      `../experiments/${expName}/analysis/database_export/${projectId}.json`,
      import.meta.url
    );
    data = await readJSON(exportFile, 'utf8');
    data = data.experiments[expName]; // key down to the subject level
    if (!options.full) {
      for (const [uid, subjectData] of Object.entries(data)) {
        if (!subjectData.info.completed) {
          delete data[uid];
        }
      }
    }
    await unlink(
      new URL(
        `../experiments/${expName}/analysis/firebase-export-metadata.json`,
        import.meta.url
      )
    );
    await rm(
      new URL(
        `../experiments/${expName}/analysis/database_export`,
        import.meta.url
      ),
      { recursive: true, force: true }
    );
    await rm(
      new URL(
        `../experiments/${expName}/analysis/auth_export`,
        import.meta.url
      ),
      { recursive: true, force: true }
    );
  } else {
    data = await firebaseGetData(
      firebasePath,
      projectId,
      false,
      options.full ? undefined : 'info/completed', // TODO: FIX THIS
      options.full ? undefined : 'true'
    );
  }
  spinner.succeed();
} catch (err) {
  spinner.fail();
  throw err;
}

let uids = Object.keys(data);
ora(
  `Found ${uids.length} participants with ${
    options.partial ? 'partial' : 'complete'
  } sessions:`
).info();
uids.forEach((x) =>
  console.log(
    ` - ${data[x].info.platform} ID: ${data[x].info.workerId}, Firebase UID: ${x}`
  )
);

spinner = ora(`Saving data...`).start();
try {
  await writeFile(saveFile, JSON.stringify(data), 'utf8');
  spinner.succeed(`Data from ${firebasePath} saved to ${saveFileDecoded}.`);
} catch (err) {
  spinner.fail();
  throw err;
}

// TODO:

// 'Looks like you downloaded data from a Prolific study. Would you like to download the demographic data for this study now?'
// (Similar for MTurk - logic to parse Assignments will be trickier though...)

// Aavoid downloading same participants again in the future?
// Probably need to record download events in Firebase and use that to check (order-by + start-at/equal-to)
// Instead of using cfg.completed = true/false, implement a cfg.status with various values (consented, completed, downloaded, etc)
