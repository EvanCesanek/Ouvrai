#!/usr/bin/env node

import { Command } from 'commander';
import { MTurkClient } from '@aws-sdk/client-mturk';
import mturkConfig from '../config/mturk-config.js';
import ora from 'ora';
import { mturkListQualifications } from './cli-utils.js';

const program = new Command()
  .name('weblab list-quals')
  .option('-s --sandbox', 'use MTurk sandbox')
  .option('-v --verbose [number]', 'display more info for each qual')
  .option('-l --list-only', 'display only a list of QIDs')
  .argument('[query...]', 'search query')
  .showHelpAfterError()
  .parse();
const options = program.opts();

// MTURK
// Set up MTurk connection
const client = new MTurkClient({
  region: 'us-east-1',
  endpoint: options.sandbox
    ? mturkConfig.sandboxEndpoint
    : mturkConfig.endpoint,
});

let query = program.args.length > 0 ? program.args.join(' ') : undefined;

let res;
let spinner = ora('Retrieving qualifications...');
try {
  res = await mturkListQualifications(client, query);
  spinner.succeed(
    `Found ${res.NumResults} qualifications` +
      (query ? ` matching search query "${query}": ` : '')
  );
} catch (error) {
  spinner.fail(error.message);
  process.exit(1);
}

if (options.listOnly) {
  let qidList = res.QualificationTypes.map((x) => x.QualificationTypeId);
  console.log(qidList.join(' '));
} else {
  for (let qual of res.QualificationTypes) {
    let fieldsToPrint = {
      QualificationTypeId: qual.QualificationTypeId,
      Name: qual.Name,
      Keywords: qual.Keywords,
    };
    if (options.verbose == 1) {
      fieldsToPrint.Description = qual.Description;
      fieldsToPrint.CreationTime = qual.CreationTime;
    } else if (options.verbose == 2) {
      fieldsToPrint = qual;
    }
    console.log(fieldsToPrint);
  }
}
