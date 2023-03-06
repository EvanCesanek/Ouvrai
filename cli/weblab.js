#! /usr/bin/env node

import { Command } from 'commander';
import tabtab from 'tabtab';
import { join } from 'path';
import { URL } from 'url';
import { homedir } from 'os';
import { exists, firebaseClient } from './cli-utils.js';
import { readdir, readFile } from 'fs/promises';
import { config } from 'dotenv';
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
      console.log(
        '\nWarning: Prolific credentials not found!\nThe Prolific API uses API tokens to authenticate requests. ' +
          'You can view and manage your API tokens on the Prolific web app: Settings > Go to API Token page. ' +
          `Copy your API token into a plain text file at ${prolificCredPath}.`
      );
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
      console.log(
        '\nWarning: MTurk credentials not found!\nThe MTurk API uses access keys to authenticate requests. ' +
          'For detailed instructions, see:' +
          '\n\t- https://docs.aws.amazon.com/AWSMechTurk/latest/AWSMechanicalTurkGettingStartedGuide/SetUp.html' +
          `Insert your access keys into a plain text file at ${mturkCredPath} (no file extension). ` +
          '\nContents should look like:' +
          '\n  [default]' +
          '\n  aws_access_key_id = AKIAIOSFODNN7EXAMPLE' +
          '\n  aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY\n'
      );
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
  .name('weblab')
  .version('1.0.0')
  .usage('<command>')
  .command('get-balance', 'get MTurk account balance')
  .command('create-hit <experiment-name>', 'create MTurk HIT')
  .command('list-hits [experiment-name]', 'list MTurk HITs')
  .command('review-hit <hit-id...>', 'approve/reject MTurk HIT(s) submissions')
  .command('delete-hit <hit-id...>', 'delete MTurk HIT(s)')
  .command('list-assignments <hit-id>', 'list assignments for an MTurk HIT')
  .command('send-bonus <experiment-name>', 'send bonuses to MTurk workers')
  .command('create-qual <experiment-name>', 'create MTurk qualification')
  .command('list-quals [query...]', 'list MTurk qualifications')
  .command('delete-qual <qual-id...>', 'delete MTurk qualification(s)')
  .command('deploy <experiment-name>', 'deploy experiment to Firebase Hosting')
  .command(
    'serve <experiment-name>',
    'serve experiment locally with Firebase Emulator Suite'
  )
  .command(
    'download-workers <experiment-name>',
    'download data for specific workers from Firebase Realtime Database'
  )
  .command('p-get-user', 'get my Prolific user info')
  .command('p-get-studies', 'get my Prolific studies')
  .command(
    'p-get-submissions <study-id>',
    'get submissions for Prolific studies'
  )
  .command(
    'p-approve <experiment-name> <study-id>',
    'bulk approve a Prolific study'
  )
  .command(
    'p-send-bonus <experiment-name> <study-id>',
    'send bonuses for Prolific study'
  )

  .command(
    'new-experiment <experiment-name> [template-name]',
    'create a new experiment'
  )
  .command(
    'new-template <experiment-name> <template-name>',
    'templatize an experiment'
  )
  .command('setup', 'configure Firebase for hosting and database')
  .command('draft-study', 'create a draft study')
  .command('post-study', 'post study for participants')
  .command('get-prolific-screeners', 'get prolific requirements list')
  .command('launch-dashboard', 'launch the local dashboard app')
  .command('dev', 'launch Vite development server')
  .command('build', 'build production version with Vite')
  .command('approve-hit', 'approve MTurk HITs');

program.command('install-completion').action(async () => {
  await tabtab
    .install({
      name: 'weblab',
      completer: 'weblab',
    })
    .catch((err) => console.error('INSTALL ERROR', err));
  return;
});

program.command('uninstall-completion').action(async () => {
  await tabtab
    .uninstall({
      name: 'weblab',
    })
    .catch((err) => console.error('UNINSTALL ERROR', err));

  return;
});

program.command('completion').action(async () => {
  const env = tabtab.parseEnv(process.env);
  if (!env.complete) return;

  if (env.prev === 'weblab') {
    const libFolder = new URL('.', import.meta.url).pathname;
    var commands = [];
    let files;
    try {
      files = await readdir(libFolder);
    } catch (err) {
      return;
    }
    for (let file of files) {
      if (!/^weblab-/.test(file)) continue; // skip files without weblab prefix
      commands.push(file.replace(/weblab-|\.js/g, ''));
    }
    //console.log('commands', commands);
    commands.push('help');
    return tabtab.log(commands);
  }
  if (
    [
      'dev',
      'build',
      'create-hit',
      'create-qual',
      'deploy',
      'download-workers',
      'list-hits',
      'send-bonus',
      'serve',
      'p-approve',
      'p-send-bonus',
    ].includes(env.prev)
  ) {
    const expFolder = new URL('../experiments', import.meta.url);
    let experiments = await readdir(expFolder);
    // filter out hidden files like .DS_Store
    experiments = experiments.filter((item) => !/(^|\/)\.[^/.]/g.test(item));
    experiments.push('-h:display help for command');
    return tabtab.log(experiments);
  }

  // TODO: Something clever to recommend relevant HITIDs and QIDs for these commands:
  // if(["delete-hit","list-assignments","review-hit"].includes(env.prev)){
  //   return tabtab.log(hitids);
  // }
  // if(["delete-qual"].includes(env.prev)){
  //   return tabtab.log(qualids);
  // }
  if (env.prev !== '-s') {
    return tabtab.log(['-s:use MTurk sandbox']);
  }
});

// You can test things out here - put whatever you want in the action function.
program
  .command('test')
  .description('Edit this function in /cli/weblab.js to test things out!')
  .action(async function () {
    let client = firebaseClient();
    //console.log(client.cli.options);
    let data = await client.database.get('/experiments/example', {
      shallow: true,
      json: true,
      project: 'cognitivescience',
    });
    // console.log(
    //   data
    //   //await client.hosting.sites.list({ project: 'cognitivescience' }) // not enough info!
    //   // await client.hosting.sites.get('cogsci-lab31', {
    //   //   project: 'cognitivescience',
    //   // })
    // );
  });

program.parse();
