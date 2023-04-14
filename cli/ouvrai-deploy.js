import { Command } from 'commander';
import { spawn } from 'child_process';
import firebaseConfig from '../config/firebase-config.js';
import {
  firebaseChooseProject,
  firebaseChooseSite,
  firebaseClient,
  updateStudyHistory,
  exists,
} from './cli-utils.js';
import { readJSON } from 'fs-extra/esm';
import { writeFile } from 'fs/promises';
import { quote } from 'shell-quote';
import { fileURLToPath } from 'url';
import { join } from 'path';
import ora from 'ora';

const program = new Command()
  .name('ouvrai deploy')
  .argument('<studyname>', 'Name of study')
  .option('-p, --project [projectname]', 'Choose (or specify) Firebase project')
  .option('-l, --local', 'Host production build locally with Emulator Suite')
  .showHelpAfterError()
  .parse();

let options = program.opts();
const studyName = program.args[0];

// Find the config file for this experiment
const studyURL = new URL(`../experiments/${studyName}`, import.meta.url);
const studyPath = fileURLToPath(studyURL);

const buildPath = join(studyPath, 'dist');

let spinner = ora(`Accessing production build at ${buildPath}`).start();
if (await exists(buildPath)) {
  spinner.succeed();
} else {
  spinner.fail(`No production build found at ${buildPath}\
  \n  You probably need to run: ouvrai build ${studyName}`);
  process.exit(1);
}

if (options.local) {
  // Local serve
  spawn('firebase', ['emulators:start'], {
    stdio: 'inherit',
    cwd: studyURL,
    shell: true,
  });
} else {
  const client = await firebaseClient();

  // User can choose project from list (boolean option), supply name of project (value option), or use default (no option)
  let projectId = options.project || firebaseConfig.projectId;
  if (projectId === true) {
    projectId = await firebaseChooseProject(client);
  }

  // Read in firebase.json
  let firebaseJSON;
  let firebaseURL = new URL(
    `../experiments/${studyName}/firebase.json`,
    import.meta.url
  );
  spinner = ora(
    `Reading firebase configuration from ${fileURLToPath(firebaseURL)}`
  ).start();
  try {
    firebaseJSON = await readJSON(firebaseURL, 'utf8');
    spinner.succeed();
  } catch (err) {
    spinner.fail();
    throw err;
  }

  // Prompt to use same Hosting site or select a different one
  let siteId = firebaseJSON.hosting.site;

  // Always prompt to choose a site, supplying siteId as default
  siteId = await firebaseChooseSite(client, projectId, undefined, siteId);

  // Write selection to firebase.json
  firebaseJSON.hosting.site = siteId;
  spinner = ora(
    `Writing selected Hosting site to ${fileURLToPath(firebaseURL)}`
  ).start();
  try {
    await writeFile(firebaseURL, JSON.stringify(firebaseJSON, null, 2));
    spinner.succeed();
  } catch (err) {
    spinner.fail();
    throw err;
  }

  // Deploy
  let args = [quote(['deploy', '-m', studyName])];
  let subprocess = spawn('firebase', args, {
    stdio: 'inherit', // inherit parent process IO streams
    cwd: studyURL, // change working directory
    shell: true,
  });
  subprocess.on('error', (e) => console.error(e));
  // If successful, update study-history.json
  subprocess.on('close', async (code) => {
    if (code === 0) {
      await updateStudyHistory(studyName, {
        siteId: siteId,
        projectId: projectId,
      });
    }
  });
}
