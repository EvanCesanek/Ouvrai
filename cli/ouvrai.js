#! /usr/bin/env node

import { Command } from 'commander';
import tabtab from 'tabtab';
import { join } from 'path';
import { URL } from 'url';
import { homedir } from 'os';
import { exists } from './cli-utils.js';
import { readdir, readFile } from 'fs/promises';
import { config } from 'dotenv';
import { spawn } from 'child_process';

const program = new Command();

if (!process.argv.includes('completion')) {
  // Load .env variables
  config({ path: new URL('../config/.env', import.meta.url) });

  if (
    !process.env.PROLIFIC_AUTH_TOKEN ||
    process.env.PROLIFIC_AUTH_TOKEN === ''
  ) {
    // Check for Prolific credentials
    let prolificCredPath = join(homedir(), '.prolific/credentials.txt');
    if (await exists(prolificCredPath)) {
      process.env.PROLIFIC_AUTH_TOKEN = await readFile(prolificCredPath);
    } else {
      console.log(`\nWarning: Prolific credentials not found!\
      \nThe Prolific API uses API tokens to authenticate requests.\
      \nManage your API tokens on the Prolific web app: Settings > Go to API Token page\
      \nCopy your API token into a plain text file at ${prolificCredPath}.\n`);
    }
  }

  if (
    !process.env.AWS_ACCESS_KEY_ID ||
    process.env.AWS_ACCESS_KEY_ID === '' ||
    !process.env.AWS_SECRET_ACCESS_KEY ||
    process.env.AWS_SECRET_ACCESS_KEY === ''
  ) {
    // Check for MTurk credentials
    let mturkCredPath = join(homedir(), '.aws/credentials');
    if (!(await exists(mturkCredPath))) {
      console.log(`\nWarning: MTurk credentials not found!\
      \nThe MTurk API uses access keys to authenticate requests.\
      \nSee instructions at https://docs.aws.amazon.com/AWSMechTurk/latest/AWSMechanicalTurkGettingStartedGuide/SetUp.html\
      \nInsert your access keys into a plain text file at ${'lol'} (no file extension).\
      Contents should look like:\
      \n  [default]\
      \n  aws_access_key_id = AKIAIOSFODNN7EXAMPLE\
      \n  aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY\n`);
    }
  }
  // If you want to use firebase-admin package (we usually rely on global firebase-tools)
  // Store your Firebase Project Key credentials file at the following location and uncomment
  // process.env.GOOGLE_APPLICATION_CREDENTIALS = join(
  //   homedir(),
  //   '.firebase/credentials.json'
  // );
}

program
  .name('ouvrai')
  .version('1.0.0')
  .usage('<command>')
  .command('build', 'Build production version of experiment')
  .command('deploy', 'Deploy experiment to Firebase Hosting')
  .command('dev', 'Start the Vite development server and Firebase Emulators')
  .command('draft', 'Create draft study (Prolific) or post Sandbox HIT (MTurk)')
  .command('post', '($$$) Publish draft study (Prolific) or post HIT (MTurk)')
  .command('new', 'Create a new experiment from a template')
  .command('templatize', 'Create a template from an existing experiment')
  .command('setup', 'Set up Ouvrai to work with Firebase')
  .command('launch', 'Launch the Ouvrai web app')
  .command('download', 'Download participant data from Firebase')
  .command('wrangle', 'Wrangle Firebase JSON data into data tables');

program
  .command('install-completion')
  .description('(Mac/Linux) Install tab-autocompletions')
  .action(async () => {
    await tabtab
      .install({
        name: 'ouvrai',
        completer: 'ouvrai',
      })
      .catch((err) => console.error('INSTALL ERROR', err));
    return;
  });

program
  .command('uninstall-completion')
  .description('(Mac/Linux) Uninstall tab-autocompletions')
  .action(async () => {
    await tabtab
      .uninstall({
        name: 'ouvrai',
      })
      .catch((err) => console.error('UNINSTALL ERROR', err));

    return;
  });

program.command('completion', { hidden: true }).action(async () => {
  const env = tabtab.parseEnv(process.env);
  if (!env.complete) return;

  if (env.prev === 'ouvrai') {
    const libFolder = new URL('.', import.meta.url);
    var commands = [];
    let files;
    try {
      files = await readdir(libFolder);
    } catch (err) {
      return;
    }
    for (let file of files) {
      if (!/^ouvrai-/.test(file)) continue; // skip files without ouvrai prefix
      commands.push(file.replace(/ouvrai-|\.js/g, ''));
    }
    commands.push('help');
    return tabtab.log(commands);
  }
  if (
    ['dev', 'build', 'deploy', 'draft', 'post', 'templatize'].includes(env.prev)
  ) {
    const expFolder = new URL('../experiments', import.meta.url);
    let experiments = await readdir(expFolder);
    // filter out hidden files like .DS_Store
    experiments = experiments.filter((item) => !/(^|\/)\.[^/.]/g.test(item));
    experiments.push('-h:display help for command');
    return tabtab.log(experiments);
  }

  if (env.prev !== '-s') {
    return tabtab.log(['-s:use MTurk sandbox']);
  }
});

// You can test things out here - put whatever you want in the action function.
program
  .command('test')
  .description('Edit this function in /cli/ouvrai.js to test things out!')
  .action(async function () {
    console.log('Write your own tests in /cli/ouvrai.js.');
  });

program.parse();
