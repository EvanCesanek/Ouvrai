#!/usr/bin/env node

// TODO: If >100 HITs, *may* need to use data.NextToken returned by listHITsCommand
// This must be passed in the input params for subsequent calls to listHITsCommand
// But maybe not -- maybe no pagination when NumResults is omitted from input params
// Anyway this shouldn't be a problem if you clean up your HITs promptly!

import { Command } from 'commander';
import { MTurkClient, ListHITsCommand } from '@aws-sdk/client-mturk';

const program = new Command();
program
  .name('weblab list-hits')
  .option('-s --sandbox', 'use sandbox mode', false)
  .option('-v --verbose', 'display lots of HIT info', false)
  .argument(
    '[experiment-name]',
    'name of experiment directory (if omitted, list all HITs)'
  )
  //.argument('[paginationToken]', 'pagination token')
  .showHelpAfterError();
program.parse(process.argv);
const options = program.opts();

const expName = program.args[0];
//const paginationToken = program.args[1];

var endpoint;
if (options.sandbox) {
  console.log('\n[list-hits]: You are using the Requester Sandbox');
  endpoint = 'https://mturk-requester-sandbox.us-east-1.amazonaws.com';
} else {
  endpoint = 'https://mturk-requester.us-east-1.amazonaws.com';
}

var allHITs = [];

const client = new MTurkClient({ region: 'us-east-1', endpoint: endpoint });
var listHITsCommand = new ListHITsCommand({
  //MaxResults: 100,
  //NextToken: paginationToken
});
var data;
try {
  data = await client.send(listHITsCommand);
} catch (error) {
  console.log(error.message);
}

if (data.NumResults === 0) {
  console.log('--- No HITs found.\n\n');
  process.exit(0);
}

// if (data.NumResults >= 100) {
//   console.log(
//     `--- WARNING: Too many HITs to display. Run list-hits again with ${data.NextToken} as additional argument to see next page of results.\n`
//   );
// }

for (let hit of data.HITs) {
  if (expName && hit.RequesterAnnotation != expName) {
    continue; // go to the next HIT if this one doesn't match
  }
  delete hit.Question;
  if (!options.verbose) {
    delete hit.MaxAssignments;
    delete hit.HITStatus;
    delete hit.HITLayoutId;
    delete hit.HITReviewStatus;
    delete hit.QualificationRequirements;
    delete hit.RequesterAnnotation;
    delete hit.AssignmentDurationInSeconds;
    delete hit.Expiration;
    delete hit.AutoApprovalDelayInSeconds;
    delete hit.Reward;
    delete hit.Keywords;
    delete hit.Description;
    delete hit.HITGroupId;
    delete hit.HITTypeId;
  }
  console.log(hit);
  allHITs.push(hit.HITId);
}
console.log(allHITs.join(' '));
