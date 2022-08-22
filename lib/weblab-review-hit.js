#!/usr/bin/env node

import { Command } from 'commander';
import {
  MTurkClient,
  GetHITCommand,
  ListAssignmentsForHITCommand,
  ApproveAssignmentCommand,
  RejectAssignmentCommand,
  AssociateQualificationWithWorkerCommand,
} from '@aws-sdk/client-mturk';
import { join } from 'path';
import { existsSync } from 'fs';
import { URL } from 'url';
import readline from 'readline';
import parser from 'xml2json';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { ask } from 'weblab-utils';
import { firebaseConfig } from '../firebase-config';

const __dirname = new URL('.', import.meta.url).pathname;
const program = new Command();
program
  .option('-s --sandbox', 'use MTurk sandbox')
  .argument(
    '<hit-id...>',
    'MTurk HIT ID(s); must be from same experiment name!'
  )
  .showHelpAfterError();
program.parse(process.argv);
const options = program.opts();

var endpoint;
if (options.sandbox) {
  console.log('\n[review-hit] You are using the Requester Sandbox');
  endpoint = 'https://mturk-requester-sandbox.us-east-1.amazonaws.com';
} else {
  endpoint = 'https://mturk-requester.us-east-1.amazonaws.com';
}

// Set up MTurk connection
const client = new MTurkClient({ region: 'us-east-1', endpoint: endpoint });

// Set up CL input interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
rl.pause();

// Get the experiment name out of the RequesterAnnotation of the HIT
// Note we take the first HITID, assuming the same config file for all HITs
const getHITCommand = new GetHITCommand({ HITId: program.args[0] });
var getHITCommandOutput;
try {
  getHITCommandOutput = await client.send(getHITCommand);
} catch (error) {
  console.log(error.message);
  process.exit(1);
}
var expName = getHITCommandOutput.HIT.RequesterAnnotation; // RequesterAnnotation===expName

// Load the relevant config file
var configPath = join(__dirname, '../experiments', expName, 'mturk-config.js');
if (!existsSync(configPath)) {
  console.error('ERROR: config file not found');
  process.exit(1);
}
var config;
try {
  config = await import(configPath); // async import() for variable import paths in ES6+
} catch (error) {
  console.error('ERROR: failed to import config file');
  console.error(error.message);
  process.exit(1);
}
config = config.parameters;

// Initialize connection to firebase via admin sdk
// Requires process.env.GOOGLE_APPLICATION_CREDENTIALS = '/path/to/serviceAccountFile.json'
const app = initializeApp({ databaseURL: firebaseConfig.databaseURL });
const db = getDatabase(); // Get a database reference to the root

for (let HITID of program.args) {
  // Get all submitted assignments
  const listAssignmentsForHITCommand = new ListAssignmentsForHITCommand({
    HITId: HITID,
    AssignmentStatuses: ['Submitted'],
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
  console.log(
    `\n- HIT ${HITID}: found ${listAssignmentsForHITCommandOutput.NumResults} submission for review.\n`
  );

  // Loop over assignments
  for (let assignment of listAssignmentsForHITCommandOutput.Assignments) {
    console.log('- Checking Worker ' + assignment.WorkerId + ': ');

    // Parse XML string
    var parsedData = JSON.parse(parser.toJson(assignment.Answer));
    var recorded_data = parsedData.QuestionFormAnswers.Answer; // mturk-form data is 2 layers down
    if (!Array.isArray(recorded_data)) {
      recorded_data = [recorded_data]; // can be a single object -> make sure it's iterable
    }
    console.log('--- MTurk submission data:');
    for (let qobj of recorded_data) {
      console.log(`----- ${qobj.QuestionIdentifier}: ${qobj.FreeText}`);
    }

    if (expName !== 'compensation_hit') {
      var submittedCode;
      let codeObject = recorded_data.find(
        (input) => input.QuestionIdentifier === 'confirmationCode'
      );
      if (!codeObject) {
        console.log(
          '----- WARNING: Worker submitted without entering code! This should be impossible, please report!'
        );
      } else {
        submittedCode = codeObject.FreeText; // FreeText is the object key that has the value
      }

      // Check that this worker exists, and their code matches their uid
      const workerInfoRef = db.ref(
        'workers/' + assignment.WorkerId + '/' + expName
      );

      var dataSnapshot;
      try {
        dataSnapshot = await workerInfoRef.once('value');
      } catch (error) {
        console.error(error);
        process.exit(1);
      }

      if (dataSnapshot.exists()) {
        let workerInfoNode = dataSnapshot.val();
        console.log('--- Firebase workers-branch data:');
        for (const [k, v] of Object.entries(workerInfoNode)) {
          console.log(`----- ${k}: ${JSON.stringify(v)}`);
        }
        // Possibility 1: Workers branch entry matches the submitted code.
        if (Object.keys(workerInfoNode).indexOf(submittedCode) !== -1) {
          console.log(
            `\n--- APPROVE: Submitted code ${submittedCode} matches entry at workers/${assignment.WorkerId}/${expName}/.`
          );
        } else {
          // Possibility 2: Worker appears in workers branch (so it seems like they finished)
          console.log(
            `\n--- WARNING: Submitted code ${submittedCode} does not match entry at workers/${assignment.WorkerId}/${expName}/. Approve if you can locate the data.`
          );
        }
      } else {
        // Possibility 3: Worker does not appear in workers branch
        console.log(
          `\n--- WARNING: Worker not found in in workers/${expName}/. Reject if you cannot locate the data.`
        );
      }
    } else {
      console.log('***** Compensation HIT');
    }
    await promptApproveReject(assignment);
  }
}

console.log('- All submitted assignments processed.\n');

// Must close firebase to exit cleanly
try {
  await deleteApp(app);
} catch (error) {
  console.error(error.message);
}

async function promptApproveReject(assignment) {
  var query = `\
    \n--- Would you like to...\
    \n----- Approve and pay the worker ('A')?\
    \n----- Reject the work ('R')?\
    \n----- Or take no action at this time (other)?\
    \n--->> `;
  var answer = await ask(rl, query);

  if (answer === 'A') {
    const approveAssignmentCommand = new ApproveAssignmentCommand({
      AssignmentId: assignment.AssignmentId,
      RequesterFeedback: 'Thank you!',
    });
    try {
      await client.send(approveAssignmentCommand);
    } catch (error) {
      console.log(error.message);
    }
    await assignQuals(assignment);
  } else if (answer === 'R') {
    const rejectAssignmentCommand = new RejectAssignmentCommand({
      AssignmentId: assignment.AssignmentId,
      RequesterFeedback:
        'Your submission was invalid. Contact the requester if you believe this was an error.',
    });
    try {
      await client.send(rejectAssignmentCommand);
    } catch (error) {
      console.log(error.message);
    }
    console.log('----- Assignment rejected.\n');

    query =
      '----- Would you like to assign qualifications to this worker? (y/N) ';
    answer = await ask(rl, query);

    if (answer === 'y') {
      await assignQuals(assignment);
    }
  } else {
    console.log('----- No action taken.\n');
  }
  return;
}

async function assignQuals(assignment) {
  // If there are qualifications to assign
  if (!config.qualificationsDisabled && config.assignQIDs) {
    // Loop over them and assign
    for (let qid of config.assignQIDs) {
      console.log(
        '--- Assigning qualification ' + qid + ' to ' + assignment.WorkerId
      );
      const associateQualificationWithWorkerCommand =
        new AssociateQualificationWithWorkerCommand({
          QualificationTypeId: qid,
          WorkerId: assignment.WorkerId,
          // Send a notification email to the Worker saying that the qualification was assigned?
          SendNotification: false, // Note: this is true by default
          IntegerValue: 1, // For "scored" quals (we don't use this currently)
        });
      try {
        await client.send(associateQualificationWithWorkerCommand);
      } catch (error) {
        console.log(error.message);
      }
    }
  } else {
    console.log(
      '--- No qualifications to assign (or you are in sandbox mode and they are disabled).'
    );
  }
  return;
}
