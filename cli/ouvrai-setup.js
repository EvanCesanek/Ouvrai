import { Command } from 'commander';
import { spawn } from 'child_process';
import inquirer from 'inquirer';
import {
  firebaseChooseProject,
  firebaseClient,
  pythonSetup,
  spawnSyncPython,
} from './cli-utils.js';
import { readJSON } from 'fs-extra/esm';
import { unlink, writeFile } from 'fs/promises';
import { quote } from 'shell-quote';
import { fileURLToPath } from 'url';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import ora from 'ora';
import chalk from 'chalk';

const program = new Command().name('ouvrai setup').showHelpAfterError().parse();

console.log(chalk.bold('=== Accessing Firebase'));

let client = await firebaseClient();

// Get Firebase project
let projectId = await firebaseChooseProject(client);

// Always use <projectName>.web.app as the default site.
let spinner = ora(
  `Getting default Hosting site for project '${projectId}'`
).start();
let sites = await client.hosting.sites.list({ project: projectId });
let siteId = sites.sites.map((x) => x.name.split('/').slice(-1)[0])[0];
spinner.succeed(`Default Hosting site is https://${siteId}.web.app`);

const firebaseURL = new URL(
  '../config/template/firebase.json',
  import.meta.url
);
spinner = ora(
  `Writing default Hosting site to configuration file: ${fileURLToPath(
    firebaseURL
  )}`
).start();
const firebaseJSON = await readJSON(firebaseURL);
firebaseJSON.hosting.site = siteId;
try {
  await writeFile(firebaseURL, JSON.stringify(firebaseJSON, null, 2));
  spinner.succeed();
} catch (err) {
  spinner.fail();
  ora(err.message).fail();
  process.exit(1);
}

// Initialize the database
let args = [quote(['init', 'database', '--project', projectId])];
let subprocess = spawn(`firebase`, args, {
  cwd: new URL('../config/template', import.meta.url),
  stdio: 'inherit',
  shell: true,
});

subprocess.on('close', async (code) => {
  if (code === 0) {
    console.log(chalk.bold('\n=== Configuring Ouvrai and Firebase'));
    // Get the app ID of this project's associated web app
    let apps = await client.apps.list('web', { project: projectId });
    let appNames = apps.map((x) => x.displayName);
    apps = apps.map((x) => x.appId);
    let appId;
    if (apps.length === 0) {
      let appInfo = await client.apps.create('web', 'myapp', {
        project: projectId,
      });
      appId = appInfo.appId;
    } else if (apps.length > 1) {
      let answers = await inquirer.prompt([
        {
          type: 'list',
          name: 'appId',
          message:
            'You have multiple web apps in this project. Which would you like to use?',
          choices: apps,
        },
      ]);
      appId = answers.appId;
    } else {
      appId = apps[0];
    }
    ora(`Using WEB app '${appNames[0]}' (appId = ${appId}).`).succeed();

    // Get the config object and write it to /config/firebase-config.js
    let configObject = await client.apps.sdkconfig('web', appId);

    let configURL = new URL('../config/firebase-config.js', import.meta.url);
    spinner = ora(
      `Writing '${appNames[0]}' configuration data to ${fileURLToPath(
        configURL
      )}`
    ).start();
    await writeFile(
      configURL,
      `// File automatically generated using CLI setup:\nexport default ` +
        JSON.stringify(configObject.sdkConfig, null, 2)
    );
    spinner.succeed();
    spinner = ora(
      'Removing unnecessary .gitignore file from config/template'
    ).start();
    await unlink(new URL('../config/template/.gitignore', import.meta.url));
    spinner.succeed();

    // Check for Anonymous Authentication
    spinner = ora(
      'Checking that you have enabled Anonymous Authentication on Firebase'
    ).start();
    let app = initializeApp(configObject.sdkConfig);
    let auth = getAuth(app);
    let p = await signInAnonymously(auth).catch((err) => {
      if (
        err.code === 'auth/admin-restricted-operation' ||
        err.code === 'auth/configuration-not-found'
      ) {
        spinner.fail();
        ora(`Error: You must enable Anonymous Authentication from the Firebase web console:\
        \n  https://console.firebase.google.com/project/${projectId}/authentication/providers\
        \n  Do that now and then run ouvrai setup again.`).fail();
        process.exit(1);
      }
    });
    spinner.succeed();
    ora(
      chalk.bold(
        `Ouvrai successfully configured for Firebase project '${projectId}'.\n`
      )
    ).succeed();

    // Install python package (in editable mode) & dependencies
    console.log(chalk.bold('=== Python Setup'));
    await pythonSetup();
  } else {
    ora(
      'Error in Firebase initialization! See console output for more info.'
    ).fail();
    process.exit(1);
  }
  console.log();
  ora(`${chalk.bold('Ouvrai setup complete!')}\
  \n  We recommend starting by creating a new study from the 'cursor' template:\
  \n    ouvrai new my-new-study cursor\
  \n    ouvrai dev my-new-study\n`).succeed();
});
