import { Command } from 'commander';
import { spawn } from 'child_process';
import inquirer from 'inquirer';
import {
  firebaseChooseProject,
  firebaseChooseSite,
  firebaseClient,
} from './cli-utils.js';
import { readJSON } from 'fs-extra/esm';
import { unlink, writeFile } from 'fs/promises';
import { quote } from 'shell-quote';

const program = new Command();
program.showHelpAfterError();

let client = firebaseClient();

// Get Firebase project
let projectId = await firebaseChooseProject(client);

// Get Firebase site
let siteId = await firebaseChooseSite(
  client,
  projectId,
  'You have multiple Firebase Hosting sites. Please choose a default site:'
);

const firebaseURL = new URL(
  '../config/template/firebase.json',
  import.meta.url
);
const firebaseJSON = await readJSON(firebaseURL);
firebaseJSON.hosting.site = siteId;
try {
  await writeFile(firebaseURL, JSON.stringify(firebaseJSON, null, 2));
} catch (err) {
  console.log(
    `Setup failed! Could not write to ${decodeURIComponent(
      firebaseURL.pathname
    )}`
  );
  console.error(err.message);
  process.exit(1);
}

// Initialize the database
let args = [quote(['init', 'database', '--project', projectId])];
let init = spawn(`firebase`, args, {
  cwd: new URL('../config/template', import.meta.url),
  stdio: 'inherit',
  shell: true,
});
//
init.on('close', async (code) => {
  console.log('Creating firebase-config.js');
  if (code === 0) {
    // Get the app ID of this project's associated web app
    let apps = await client.apps.list('web', { project: projectId });
    let appNames = apps.map((x) => x.displayName);
    apps = apps.map((x) => x.appId);
    let appId;
    if (apps.length === 0) {
      console.log(
        `You have not created a web app in this project!\n` +
          `Creating one for you...`
      );
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
    console.log(`Using WEB app '${appNames[0]}' (appId = ${appId}).`);

    // Get the config object and write it to /config/firebase-config.js
    let configObject = await client.apps.sdkconfig('web', appId);
    await writeFile(
      new URL('../config/firebase-config.js', import.meta.url),
      `// File automatically generated using CLI setup:\nexport default ` +
        JSON.stringify(configObject.sdkConfig, null, 2)
    );
    await unlink(new URL('../config/template/.gitignore', import.meta.url)); // delete .gitignore file...
    console.log(
      'Success! Configuration files can be found in the /config folder.'
    );
    console.log(
      `By default, experiments will deploy to https://${siteId}.web.app.` +
        '\nYou will be given the option to select a different site each time you deploy.'
    );
  } else {
    console.log(
      'Error in Firebase initialization! See console output for more info.'
    );
    process.exit(1);
  }
});
