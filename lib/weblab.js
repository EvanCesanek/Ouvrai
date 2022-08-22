#! /usr/bin/env node

import { Command } from 'commander';
import tabtab from 'tabtab';
import { readdirSync } from 'fs';
import { join } from 'path';
import { URL } from 'url';
import { homedir } from 'os';
const program = new Command();

// Edit this line as needed to point to your Firebase Project Key credentials file
process.env.GOOGLE_APPLICATION_CREDENTIALS = join(
  homedir(),
  '.firebase/firebase_project_key.json'
);

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
  );

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
program.command('completion').action(() => {
  const env = tabtab.parseEnv(process.env);
  if (!env.complete) return;

  const __dirname = new URL('.', import.meta.url).pathname;

  if (env.prev === 'weblab') {
    const libFolder = join(__dirname, '../lib');
    var commands = [];
    readdirSync(libFolder).forEach((file) => {
      commands.push(file.replace(/weblab-|\.js/g, ''));
    });
    commands.push('help');
    return tabtab.log(commands);
  }

  if (
    [
      'create-hit',
      'create-qual',
      'deploy',
      'download-workers',
      'list-hits',
      'send-bonus',
      'serve',
    ].includes(env.prev)
  ) {
    const expFolder = join(__dirname, '../experiments');
    var experiments = readdirSync(expFolder).filter(
      // remove hidden files from list (like .DS_Store)
      (item) => !/(^|\/)\.[^/.]/g.test(item)
    );
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

program.parse(process.argv);
