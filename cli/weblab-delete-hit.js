#!/usr/bin/env node

import { Command } from 'commander';
import {
  MTurkClient,
  UpdateExpirationForHITCommand,
  DeleteHITCommand,
} from '@aws-sdk/client-mturk';
import mturkConfig from '../config/mturk-config.js';
import ora from 'ora';

const program = new Command()
  .name('weblab delete-hit')
  .option('-s --sandbox', 'use MTurk sandbox')
  .argument('<hit-id...>', 'MTurk HIT ID(s)')
  .showHelpAfterError()
  .parse();
const options = program.opts();

// Set up MTurk connection
const client = new MTurkClient({
  region: 'us-east-1',
  endpoint: options.sandbox
    ? mturkConfig.sandboxEndpoint
    : mturkConfig.endpoint,
});

for (let HITID of program.args) {
  // Force the HIT to expire so no more assignments can be accepted
  let spinner = ora(`\nForcing HIT ${HITID} to expire...`).start();
  try {
    await client.send(
      new UpdateExpirationForHITCommand({
        ExpireAt: new Date(0),
        HITId: HITID,
      })
    );
  } catch (error) {
    spinner.fail(error.message);
    continue;
  }

  // Try to delete the HIT
  spinner = ora(`Deleting HIT ${HITID}...`);
  try {
    await client.send(new DeleteHITCommand({ HITId: HITID }));
  } catch (error) {
    spinner.fail(error.message);
    continue;
  }
  spinner.succeed();
}
