#!/usr/bin/env node

import { Command } from 'commander';
import {
  MTurkClient,
  ListAssignmentsForHITCommand,
  SendBonusCommand,
} from '@aws-sdk/client-mturk';
import { join } from 'path';
import { existsSync } from 'fs';
import { dateStringMMDDYY } from './cli-utils.js';

import { dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));

const program = new Command();

program
  .name('weblab send-bonus')
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
  console.error('ERROR: failed to import config file');
  console.error(error.message);
  process.exit(1);
}
config = config.parameters;

// If sandbox set by flag, but not in config file, update config parameters
if (options.sandbox && !config.sandbox) {
  console.log('\n[send-bonus] You are using the Requester Sandbox');
  config.endpoint = config.sandboxEndpoint;
  config.previewURL = config.sandboxPreviewURL;
}

if (!Array.isArray(config.workersToBonus) || !config.workersToBonus.length) {
  console.log(
    `ERROR: workersToBonus incorrectly configured in ${expName} config file.`
  );
  process.exit(1);
}
if (
  !Array.isArray(config.bonusAmounts) ||
  !config.bonusAmounts.length ||
  config.bonusAmounts.length !== config.workersToBonus.length
) {
  console.log(
    `ERROR: bonusAmounts incorrectly configured in ${expName} config file.`
  );
  process.exit(1);
}
if (!Array.isArray(config.bonusHITIDs) || !config.bonusHITIDs.length) {
  console.log(
    `ERROR: bonusHITIDs incorrectly configured in ${expName} config file.`
  );
  process.exit(1);
}

// Set up MTurk connection
const client = new MTurkClient({
  region: 'us-east-1',
  endpoint: config.endpoint,
});

var bi = -1; // bonus index
var unbonusedWorkers = [];
workerLoop: for (let workerID of config.workersToBonus) {
  bi++;
  hitLoop: for (let HITID of config.bonusHITIDs) {
    let listAssignmentsForHITCommand = new ListAssignmentsForHITCommand({
      HITId: HITID,
    });
    let listAssignmentsForHITCommandOutput;
    try {
      listAssignmentsForHITCommandOutput = await client.send(
        listAssignmentsForHITCommand
      );
    } catch (error) {
      console.log(error.message);
      console.log('- WARNING: Bad HIT ID. Continuing with next HIT ID...');
      continue hitLoop;
    }
    for (let assignment of listAssignmentsForHITCommandOutput.Assignments) {
      if (workerID === assignment.WorkerId) {
        var sendBonusCommandInput = {
          AssignmentId: assignment.AssignmentId, // required
          BonusAmount: config.bonusAmounts[bi], // required
          Reason: config.bonusMessage,
          WorkerId: workerID, // required
          // UniqueRequestToken prevents repeated bonuses (in same day) when it's unclear if they succeeded (e.g., network lapse)
          UniqueRequestToken: `${workerID}_${dateStringMMDDYY()}`,
        };
        var sendBonusCommand = new SendBonusCommand(sendBonusCommandInput);
        try {
          await client.send(sendBonusCommand);
        } catch (error) {
          console.error(error.message);
          console.error(
            `- ERROR: Error sending bonus to ${workerID}. Continuing with next worker...\n`
          );
          unbonusedWorkers.push(workerID);
          continue workerLoop;
        }

        console.log(
          `--- Sent bonus of $${config.bonusAmounts[bi]} to ${workerID}\n`
        );
        continue workerLoop;
      }
    }
  }
  console.log(
    `- ERROR: No assignment found for ${workerID}. No bonus sent. Continuing with next worker...\n`
  );
  unbonusedWorkers.push(workerID);
}

console.log(`Done! Sent ${bi + 1 - unbonusedWorkers.length} bonuses.`);
if (unbonusedWorkers.length > 0) {
  console.log(`- Failed to send bonuses to:`);
  console.log(unbonusedWorkers);
}
process.exit(0);
