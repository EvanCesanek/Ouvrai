#!/usr/bin/env node

import { Command } from 'commander';
import {
  MTurkClient,
  DeleteQualificationTypeCommand,
} from '@aws-sdk/client-mturk';

const program = new Command();
program
  .name('weblab delete-qual')
  .option('-s --sandbox', 'use MTurk sandbox', false)
  .argument('<qual-id...>', 'MTurk qualification id(s)');
program.parse(process.argv);
const options = program.opts();

var endpoint;
if (options.sandbox) {
  console.log('\n[Note: You are using the Requester Sandbox]');
  endpoint = 'https://mturk-requester-sandbox.us-east-1.amazonaws.com';
} else {
  endpoint = 'https://mturk-requester.us-east-1.amazonaws.com';
}
const client = new MTurkClient({ region: 'us-east-1', endpoint: endpoint });

for (let qid of program.args) {
  const deleteQualificationTypeCommand = new DeleteQualificationTypeCommand({
    QualificationTypeId: qid,
  });
  try {
    await client.send(deleteQualificationTypeCommand);
  } catch (error) {
    console.error(error.message);
    console.error(`ERROR: Failed to delete qual ${qid}. Continuing...`);
  }
  console.log(`- Qualification ${qid} deleted.`);
}
