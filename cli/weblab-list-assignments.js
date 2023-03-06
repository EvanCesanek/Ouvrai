#!/usr/bin/env node

import { Command } from 'commander';
import { parseStringPromise } from 'xml2js';
import {
  MTurkClient,
  ListAssignmentsForHITCommand,
} from '@aws-sdk/client-mturk';

const program = new Command();

program
  .name('weblab list-assignments')
  .option('-s --sandbox', 'use MTurk sandbox')
  .option('-b --submitted', 'submitted assignments')
  .option('-a --approved', 'approved assignments')
  .option('-r --rejected', 'rejected assignments')
  .option('-l --list-workers', 'only display list of workers')
  .argument('<hit-id>', 'hit id')
  .showHelpAfterError();
program.parse(process.argv);
const options = program.opts();

var statuses = [];
if (options.submitted) {
  statuses.push('Submitted');
}
if (options.approved) {
  statuses.push('Approved');
}
if (options.rejected) {
  statuses.push('Rejected');
}
if (statuses.length === 0) {
  statuses = ['Submitted', 'Approved', 'Rejected'];
}

var endpoint;
if (options.sandbox) {
  console.log('\n[list-assignments] You are using the Requester Sandbox');
  endpoint = 'https://mturk-requester-sandbox.us-east-1.amazonaws.com';
} else {
  endpoint = 'https://mturk-requester.us-east-1.amazonaws.com';
}

// Set up MTurk connection
const client = new MTurkClient({ region: 'us-east-1', endpoint: endpoint });

const HITID = program.args[0];

// Get all submitted assignments
var ids = [];
const listAssignmentsForHITCommand = new ListAssignmentsForHITCommand({
  HITId: HITID,
  //AssignmentStatuses: statuses,
});
var listAssignmentsForHITCommandOutput;
try {
  listAssignmentsForHITCommandOutput = await client.send(
    listAssignmentsForHITCommand
  );
} catch (error) {
  console.log(error.message);
  process.exit(1);
}
//3BEFOD78WBAJ5R1ZJSQW5KY1VH1M4B

// Loop over assignments
for (let assignment of listAssignmentsForHITCommandOutput.Assignments) {
  ids.push(assignment.WorkerId);
  // Parse XML string
  let parsedData = await parseStringPromise(assignment.Answer);
  let recorded_data = parsedData.QuestionFormAnswers.Answer; // mturk-form data is 2 layers down
  if (!Array.isArray(recorded_data)) {
    recorded_data = [recorded_data]; // can be a single object -> make sure it's iterable
  }
  for (let qobj of recorded_data) {
    assignment[qobj.QuestionIdentifier] = Array.isArray(qobj.FreeText)
      ? qobj.FreeText.join()
      : qobj.FreeText;
  }
  delete assignment.Answer; // Don't need this any more
  if (!options.listWorkers) {
    console.log(assignment);
  }
}

console.log(`- List of workers with ${statuses.join(' or ')} assignments:`);
console.log(ids);
console.log('\n');
