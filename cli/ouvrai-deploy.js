#!/usr/bin/env node

import { Command } from 'commander';
import { spawn } from 'child_process';
import inquirer from 'inquirer';
import firebaseConfig from '../config/firebase-config.js';
import {
  firebaseChooseProject,
  firebaseChooseSite,
  firebaseClient,
  updateStudyHistory,
  exists,
  dateStringYMDHMS,
} from './cli-utils.js';
import { readJSON } from 'fs-extra/esm';
import { writeFile } from 'fs/promises';
import { quote } from 'shell-quote';
import { fileURLToPath } from 'url';

const program = new Command();
program
  .argument('<experiment>', 'name of experiment directory')
  .option('-p, --project [project]', 'choose or specify Firebase project')
  .option('-l, --local', 'host production build locally with Emulator Suite')
  .showHelpAfterError();

program.parse(process.argv);
let options = program.opts();

// Find the config file for this experiment
const expName = program.args[0];
const projectPath = new URL(`../experiments/${expName}`, import.meta.url);
const projectPathDecoded = fileURLToPath(projectPath);
const distPath = new URL(`../experiments/${expName}/dist`, import.meta.url);
if (!(await exists(projectPath))) {
  console.log(
    `Error: Experiment ${expName} does not exist at ${projectPathDecoded}.`
  );
  process.exit(1);
} else if (!(await exists(distPath))) {
  console.log(
    `Error: No production build of ${expName}. Run 'ouvrai build ${expName}'.`
  );
  process.exit(1);
}

if (options.local) {
  // Local serve
  spawn('firebase', ['emulators:start'], {
    stdio: 'inherit',
    cwd: projectPath,
    shell: true,
  });
} else {
  const client = firebaseClient();

  // User can choose project from list (boolean option), supply name of project (value option), or use default (no option)
  let projectId = options.project || firebaseConfig.projectId;
  if (projectId === true) {
    projectId = await firebaseChooseProject(client);
  }

  // Read in firebase.json
  let firebaseJSON;
  let firebaseURL = new URL(
    `../experiments/${expName}/firebase.json`,
    import.meta.url
  );
  try {
    firebaseJSON = await readJSON(firebaseURL, 'utf8');
  } catch (err) {
    console.log(err.message);
    process.exit(1);
  }

  // Prompt to use same Hosting site or select a different one
  let siteId = firebaseJSON.hosting.site;
  let useCurrentSite = false;
  if (siteId) {
    let answers = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'useCurrentSite',
        default: true,
        message: `Do you want to deploy to ${siteId}.web.app?`,
      },
    ]);
    useCurrentSite = answers.useCurrentSite;
  }
  if (!useCurrentSite) {
    siteId = await firebaseChooseSite(client, projectId);
  }

  // Write selection to firebase.json
  firebaseJSON.hosting.site = siteId;
  try {
    await writeFile(firebaseURL, JSON.stringify(firebaseJSON, null, 2));
  } catch (err) {
    console.log(`Error: Write failed to ${fileURLToPath(firebaseURL)}`);
    console.error(err.message);
    process.exit(1);
  }

  // Deploy
  let args = [quote(['deploy', '-m', `${expName}, ${dateStringYMDHMS()}`])];
  let init = spawn('firebase', args, {
    stdio: 'inherit', // inherit parent process IO streams
    cwd: projectPath, // change working directory
    shell: true,
  });
  // If successful, update study-history.json
  init.on('close', async (code) => {
    if (code === 0) {
      await updateStudyHistory(expName, 'siteId', siteId);
      await updateStudyHistory(expName, 'projectId', projectId);
    }
  });
}
