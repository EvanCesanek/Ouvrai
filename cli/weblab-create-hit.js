#!/usr/bin/env node

// See:
// https://docs.aws.amazon.com/AWSMechTurk/latest/AWSMturkAPI/ApiReference_HTMLQuestionArticle.html

import { Command } from 'commander';
import {
  MTurkClient,
  CreateHITCommand,
  CreateQualificationTypeCommand,
  AssociateQualificationWithWorkerCommand,
} from '@aws-sdk/client-mturk';
import { join } from 'path';
import { existsSync, readFileSync } from 'fs';
import { URL } from 'url';
import replace from 'replace-in-file';
import readline from 'readline';
import { dateStringYMDHMS, DaysHoursMinutesToSeconds, ask } from './cli-utils';
import { firebaseConfig } from '../firebase-config';

const __dirname = new URL('.', import.meta.url).pathname;

const program = new Command();

program
  .name('weblab create-hit')
  .option('-s --sandbox', 'use MTurk sandbox')
  .argument('<experiment-name>', 'name of experiment directory')
  .showHelpAfterError();

program.parse(process.argv);
const options = program.opts();

// Find the config file for this experiment
const expName = program.args[0];
var configPath = join(__dirname, '../experiments', expName, 'mturk-config.mjs');
if (!existsSync(configPath)) {
  console.error('ERROR: config file not found');
  process.exit(1);
}
// Note: Need async import() for variable import paths in ECScript
var config;
try {
  config = await import(configPath);
} catch (error) {
  console.error(`ERROR: failed to import config file`);
  console.error(error.message);
  process.exit(1);
}
config = config.parameters;

// If sandbox set by flag, but not in config file, update config parameters
if (options.sandbox && !config.sandbox) {
  console.log('\n[create-hit] You are using the Requester Sandbox');
  config.endpoint = config.sandboxEndpoint;
  config.previewURL = config.sandboxPreviewURL;
}

// Set up MTurk connection
const client = new MTurkClient({
  region: 'us-east-1',
  endpoint: config.endpoint,
});

const mturkLayoutPath = join(
  __dirname,
  '../experiments',
  expName,
  'mturk-layout.html'
);
const firebaseJsonPath = join(
  __dirname,
  '../experiments',
  expName,
  'firebase.json'
);

if (expName === 'compensation') {
  await setupCompensationHIT();
} else {
  await overwriteMTurkLayout();
}
await setupHIT();

///// HELPER FUNCTIONS ///////
async function overwriteMTurkLayout() {
  var timestampComment = '// ' + new Date();
  var replaceOptions;

  let firebaseJSON = JSON.parse(readFileSync(firebaseJsonPath));
  let siteName = firebaseJSON.hosting.site;
  replaceOptions = {
    files: mturkLayoutPath,
    from: [/^.*expName = .*$/m, /^.*taskURL = .*$/m, /^.*databaseURL = .*$/m],
    to: [
      `        const expName = '${expName}'; ${timestampComment}`,
      `        const taskURL = 'https://${siteName}.web.app'; ${timestampComment}`,
      `        const databaseURL = '${firebaseConfig.databaseURL}'; ${timestampComment}`,
    ],
  };

  try {
    await replace(replaceOptions);
  } catch (error) {
    console.error('ERROR:', error);
  }
}

async function setupHIT() {
  const HTMLQuestion = prepareHTML();
  const QualificationRequirements = prepareQualificationRequirements();
  const createHITCommandInput = generateHIT(
    HTMLQuestion,
    QualificationRequirements
  );
  const createHITCommand = new CreateHITCommand(createHITCommandInput);
  var createHITCommandOutput;
  try {
    createHITCommandOutput = await client.send(createHITCommand);
    console.log('- A new HIT has been created. You can preview it here:');
    console.log(
      `--- ${config.previewURL + createHITCommandOutput.HIT.HITGroupId}`
    );
    console.log(`--- HITID = ${createHITCommandOutput.HIT.HITId}`);
  } catch (error) {
    console.log(error.message);
  }
}

function prepareHTML() {
  // Read in the HTMLQuestion we want to display
  // HTMLQuestion is the html code as a string
  var HTMLQuestion = readFileSync(mturkLayoutPath, 'utf8');
  // Prepend/append the required XML for an HTMLQuestion object (see MTurk API docs)
  var beginXmlTags =
    '<HTMLQuestion xmlns="http://mechanicalturk.amazonaws.com/AWSMechanicalTurkDataSchemas/2011-11-11/HTMLQuestion.xsd"> <HTMLContent><![CDATA[';
  var endXmlTags =
    ']]> </HTMLContent> <FrameHeight>0</FrameHeight> </HTMLQuestion>';
  HTMLQuestion = beginXmlTags + HTMLQuestion + endXmlTags;
  return HTMLQuestion;
}

function prepareQualificationRequirements() {
  var QualificationRequirements = [];

  if (expName === 'compensation') {
    QualificationRequirements = [
      {
        Comparator: 'Exists',
        QualificationTypeId: config.compensationQID,
        ActionsGuarded: 'DiscoverPreviewAndAccept',
      },
    ];
  } else {
    config.excludeQIDs.forEach((exqid) =>
      QualificationRequirements.push({
        Comparator: 'DoesNotExist',
        QualificationTypeId: exqid,
        ActionsGuarded: 'DiscoverPreviewAndAccept',
      })
    );
    config.restrictToQIDs.forEach((reqid) =>
      QualificationRequirements.push({
        Comparator: 'Exists',
        QualificationTypeId: reqid,
        ActionsGuarded: 'DiscoverPreviewAndAccept',
      })
    );
  }

  if (config.restrictLocation === 'US') {
    QualificationRequirements.push({
      QualificationTypeId: '00000000000000000071',
      Comparator: 'In',
      LocaleValues: [
        {
          Country: 'US',
        },
      ],
      ActionsGuarded: 'DiscoverPreviewAndAccept',
    });
  } else if (config.restrictLocation === 'NY') {
    QualificationRequirements.push({
      QualificationTypeId: '00000000000000000071',
      Comparator: 'In',
      LocaleValues: [
        {
          Country: 'US',
          Subdivision: 'NY',
        },
      ],
      ActionsGuarded: 'DiscoverPreviewAndAccept',
    });
  }

  if (config.restrictApprovalRate) {
    let cutoff;
    if (Number.isInteger(config.restrictApprovalRate)) {
      cutoff = config.restrictApprovalRate;
    } else {
      cutoff = 99;
    }
    QualificationRequirements.push({
      QualificationTypeId: '000000000000000000L0', // percentage approved
      Comparator: 'GreaterThanOrEqualTo',
      IntegerValues: [cutoff],
      ActionsGuarded: 'DiscoverPreviewAndAccept',
    }); // Note: percentage approved is locked to 100% until a worker completes 100 HITs
    QualificationRequirements.push({
      // ...so we pair it with this one:
      QualificationTypeId: '00000000000000000040', // number approved
      Comparator: 'GreaterThan',
      IntegerValues: [100],
      ActionsGuarded: 'DiscoverPreviewAndAccept',
    });
  }

  return QualificationRequirements;
}

function generateHIT(html_q, quals) {
  var myHIT = {
    Title: config.title,
    Description: config.description,
    Keywords: config.keywords,
    Reward: config.reward,
    MaxAssignments: config.assignments,
    AssignmentDurationInSeconds: DaysHoursMinutesToSeconds(
      0,
      config.allottedTime.hours,
      config.allottedTime.minutes
    ),
    LifetimeInSeconds: DaysHoursMinutesToSeconds(
      config.expiration.days,
      config.expiration.hours,
      0
    ),
    AutoApprovalDelayInSeconds: DaysHoursMinutesToSeconds(
      config.autoApprove.days,
      config.autoApprove.hours,
      config.autoApprove.minutes
    ),
    Question: html_q,
    RequesterAnnotation: expName, // Do not modify! Needed for some utilities
  };
  if (!config.qualificationsDisabled) {
    myHIT.QualificationRequirements = quals;
  }
  let batchLabel = dateStringYMDHMS().slice(0, 13); // default is 'YYYYMMDD_HHMM' - so you can only post one a minute
  if (typeof config.batchLabel === 'string') {
    // append any additional labeling (for faster posting)
    batchLabel += `_${config.batchLabel}`;
  }
  myHIT.UniqueRequestToken = `${expName}_${batchLabel}`;
  return myHIT;
}

async function setupCompensationHIT() {
  var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.pause();

  var createQualificationTypeCommandInput = {
    Name: `Compensation ${dateStringYMDHMS()}`,
    Description: `Qualification for a compensation HIT for the following worker(s): ${config.workersToCompensate}`,
    Keywords: `compensation, ${config.workersToCompensate.join(', ')}`,
    QualificationTypeStatus: 'Active',
  };

  const query =
    '\nYou are trying to create the following qualification: \n' +
    JSON.stringify(createQualificationTypeCommandInput, null, 2) +
    "\nIf you would like to continue, type 'yes': ";
  var answer;
  try {
    answer = await ask(rl, query);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  if (answer === 'yes') {
    const createQualificationTypeCommand = new CreateQualificationTypeCommand(
      createQualificationTypeCommandInput
    );
    var createQualificationTypeCommandOutput;
    try {
      createQualificationTypeCommandOutput = await client.send(
        createQualificationTypeCommand
      );
    } catch (error) {
      console.log(error.message);
    }
    console.log('- Qualification created:');
    console.log(createQualificationTypeCommandOutput.QualificationType); // successful response

    // Set this global
    config.compensationQID =
      createQualificationTypeCommandOutput.QualificationType.QualificationTypeId;

    // Assign to the workers
    for (let wkr of config.workersToCompensate) {
      console.log(
        `--- Assigning qualification ${config.compensationQID} to ${wkr}`
      );
      const associateQualificationWithWorkerCommandInput = {
        QualificationTypeId: config.compensationQID,
        WorkerId: wkr,
        SendNotification: true, // let them know
        IntegerValue: 1,
      };
      const associateQualificationWithWorkerCommand =
        new AssociateQualificationWithWorkerCommand(
          associateQualificationWithWorkerCommandInput
        );
      try {
        await client.send(associateQualificationWithWorkerCommand);
      } catch (error) {
        console.error(error.message);
      }
      console.log('----- Success!\n');
    }
  } else {
    console.log('\nQualification not created. Aborting command.\n\n');
    process.exit(0);
  }
}
