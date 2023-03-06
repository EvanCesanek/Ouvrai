import { Command } from 'commander';
import {
  MTurkClient,
  ListAssignmentsForHITCommand,
  ApproveAssignmentCommand,
} from '@aws-sdk/client-mturk';
import mturkConfig from '../config/mturk-config.js';

const program = new Command()
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
  // Get all submitted assignments
  const listAssignmentsForHITCommand = new ListAssignmentsForHITCommand({
    HITId: HITID,
    AssignmentStatuses: ['Submitted'],
  });
  let listAssignmentsForHITCommandOutput;
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
    const approveAssignmentCommand = new ApproveAssignmentCommand({
      AssignmentId: assignment.AssignmentId,
      RequesterFeedback: 'Thank you!',
    });
    try {
      await client.send(approveAssignmentCommand);
    } catch (error) {
      console.log(error.message);
    }
    console.log('- Approved worker ' + assignment.WorkerId + ': ');
  }
}
