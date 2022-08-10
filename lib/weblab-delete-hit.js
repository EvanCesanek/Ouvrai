#!/usr/bin/env node

import { Command } from 'commander';
import {
  MTurkClient,
  UpdateExpirationForHITCommand,
  DeleteHITCommand,
} from '@aws-sdk/client-mturk';

const program = new Command();

program
  .name('weblab delete-hit')
  .option('-s --sandbox', 'use MTurk sandbox')
  .argument('<hit-id...>', 'MTurk HIT ID(s)')
  .showHelpAfterError();
program.parse(process.argv);
const options = program.opts();

var endpoint;
if (options.sandbox) {
  console.log('\n[delete-hit] You are using the Requester Sandbox');
  endpoint = 'https://mturk-requester-sandbox.us-east-1.amazonaws.com';
} else {
  endpoint = 'https://mturk-requester.us-east-1.amazonaws.com';
}

// Set up MTurk connection
const client = new MTurkClient({ region: 'us-east-1', endpoint: endpoint });

for (let HITID of program.args) {
  // Force the HIT to expire, so no more assignments can be accepted
  const updateExpirationForHITCommand = new UpdateExpirationForHITCommand({
    ExpireAt: new Date(0),
    HITId: HITID,
  });
  try {
    await client.send(updateExpirationForHITCommand);
  } catch (error) {
    console.error(error.message);
    console.error(
      `ERROR: Failed to update expiration for HIT ${HITID}. Continuing...`
    );
    continue;
  }
  console.log(`\nForced HIT to expire. No new assignments can be accepted.`);

  // Try to delete the HIT
  const deleteHITCommand = new DeleteHITCommand({ HITId: HITID });
  try {
    await client.send(deleteHITCommand);
  } catch (error) {
    console.error(error.message);
    console.error(
      `ERROR: Failed to delete HIT ${HITID}. Review submitted assignments or wait for pending assignments. Continuing...`
    );
    continue;
  }

  console.log(`HIT ${HITID} deleted.`);
}
