#!/usr/bin/env node

import { Command } from 'commander';
import {
  MTurkClient,
  DeleteQualificationTypeCommand,
} from '@aws-sdk/client-mturk';
import mturkConfig from '../config/mturk-config.js';

const program = new Command()
  .name('weblab delete-qual')
  .option('-s --sandbox', 'use MTurk sandbox', false)
  .argument('<qual-id...>', 'MTurk qualification id(s)')
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

for (let qid of program.args) {
  const deleteQualificationTypeCommand = new DeleteQualificationTypeCommand({
    QualificationTypeId: qid,
  });
  let spinner = ora(`Deleting qualification ${qid}`).start();
  try {
    await client.send(deleteQualificationTypeCommand);
    spinner.succeed('');
  } catch (error) {
    spinner.fail(`Failed to delete qualification ${qid}: ${error.message}`);
  }
}
