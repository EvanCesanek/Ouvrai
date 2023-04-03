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
import { readdir, rm, writeFile } from 'fs/promises';
import { readJSON } from 'fs-extra/esm';
import { join } from 'path';
import inquirer from 'inquirer';

const program = new Command()
  .name('ouvrai download')
  .argument('<studyname>', 'Name of study')
  .option(
    '-p, --partial',
    'Download data from partial sessions (in addition to complete sessions)'
  )
  .option(
    '-d, --dev',
    'Download from Firebase Emulator database (ouvrai dev must be running)'
  )
  .showHelpAfterError()
  .parse();

const options = program.opts();
const studyName = program.processedArgs[0];

const studyURL = new URL(`../experiments/${studyName}`, import.meta.url);
const studyPath = fileURLToPath(studyURL);

let spinner = ora(`Accessing study at ${studyPath}`).start();
if (await exists(studyURL)) {
  spinner.succeed();
} else {
  spinner.fail(`No study found at ${studyPath}`);
  process.exit(1);
}

let firebasePath = `/experiments/${studyName}`;

let savePath = join(studyPath, 'analysis');
if (!(await exists(savePath))) {
  mkdirSync(savePath);
}
let saveFile = join(savePath, `data_${dateStringYMDHMS()}.json`);
// Complete participant data only
let data;
try {
  if (options.dev) {
    spinner = ora(
      `Downloading from Firebase Emulator node ${firebasePath}`
    ).start();
    let client = await firebaseClient();
    let tempExportPath = join(studyPath, 'emulators');
    try {
      await client.emulators.export(tempExportPath, {
        project: firebaseConfig.projectId,
        force: true,
      });
      spinner.succeed();
    } catch (err) {
      spinner.fail();
      throw err;
    }
    let databaseExportPath = join(tempExportPath, 'database_export');
    let jsonFiles = await readdir(databaseExportPath);
    jsonFiles = jsonFiles.filter((fn) => fn.endsWith('.json'));
    let exportFile = join(databaseExportPath, jsonFiles[0]);
    spinner = ora(`Processing JSON file ${jsonFiles[0]}`).start();
    try {
      data = await readJSON(exportFile, 'utf8');
      data = data.experiments[studyName]; // key down to the subject level
      if (!options.partial) {
        // if we don't want partial sessions, delete them
        for (const [uid, subjectData] of Object.entries(data)) {
          if (!subjectData.info.completed) {
            delete data[uid];
          }
        }
      }
      spinner.succeed();
    } catch (err) {
      spinner.fail();
      throw err;
    }

    spinner = ora('Deleting temporary emulator export directory').start();
    try {
      await rm(tempExportPath, {
        recursive: true,
        force: true,
      });
      spinner.succeed();
    } catch (err) {
      spinner.fail();
      spinner.warn(
        `Non-fatal error: Failed to delete folder ${tempExportPath}
        \n  You may want to delete this folder manually.`
      );
    }
  } else {
    let projectId = await getLatestDeployProject(studyName);
    if (!projectId) {
      let answers = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'useDefaultProject',
          message: `Ouvrai couldn't find the Firebase project ID for this study in the deploy history.\
          \n  Would you like to proceed with the default project ID '${firebaseConfig.projectId}'?`,
        },
      ]);
      if (!answers.useDefaultProject) {
        process.exit();
      } else {
        projectId = firebaseConfig.projectId;
      }
    }
    data = await firebaseGetData(
      firebasePath,
      projectId,
      false,
      options.partial ? undefined : 'info/completed',
      options.partial ? undefined : 'true'
    );
  }
  spinner.succeed();
} catch (err) {
  spinner.fail();
  throw err;
}
let uids = Object.keys(data ?? {});
let N = uids.length;
if (N === 0) {
  ora(`No data found at ${firebasePath}`).fail();
  if (!options.partial) {
    ora(
      `(Use the --partial flag to include data from incomplete sessions)`
    ).info();
  }
  process.exit();
} else {
  ora(`Found data from ${N} sessions:`).info();
}
uids.forEach((x, i) =>
  console.log(
    `    ${i + 1}. Platform ID: ${data[x].info.workerId} (${
      data[x].info.platform
    }), Firebase UID: ${x}, ${data[x].info.completed ? 'Completed' : 'Partial'}`
  )
);

spinner = ora(`Saving data from to ${saveFile}`).start();
try {
  await writeFile(saveFile, JSON.stringify(data), 'utf8');
  spinner.succeed();
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
