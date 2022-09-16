// SPECIAL CONFIG FILE FOR COMPENSATION HITs
// If a worker(s) emailed you saying they completed your task but couldn't submit:
//  1. Verify that they have a valid completion code (and any other validity checks you desire)
//  2. Modify the reward and workersToCompensate properties below
//  3. Run: weblab create-hit compensation
//  4. Send the preview URL from the console output to the worker via email
//  5. Monitor and approve as usual
//
// =============================== PARAMETERS ===============================
import { dateStringYMDHMS } from 'weblab-utils';

const parameters = {
  // general
  sandbox: true,

  // [create-hit]
  title: 'Compensation HIT',
  description: `Compensation HIT for an earlier study that you accepted but could not submit due to an error.`,
  keywords: 'compensation',
  reward: '0.50',
  workersToCompensate: ['A96LZMYB4B4ON'], // Determines # of assignments, > 9 at once will incur extra 20% fee
  allottedTime: { hours: 1, minutes: 0 },
  expiration: { days: 7, hours: 0 },
  autoApprove: { days: 7, hours: 0 },
  assignQIDs: [],
  batchLabel: dateStringYMDHMS().slice(0, 13), // 'YYYYMMDD_HHMM' - so you can only post one a minute

  // do not modify
  endpoint: 'https://mturk-requester.us-east-1.amazonaws.com',
  sandboxEndpoint: 'https://mturk-requester-sandbox.us-east-1.amazonaws.com',
  previewURL: 'https://worker.mturk.com/mturk/preview?groupId=',
  sandboxPreviewURL: 'https://workersandbox.mturk.com/mturk/preview?groupId=',
};

parameters.assignments = parameters.workersToCompensate.length;

// Qualifications disabled by default in sandbox
parameters.qualificationsDisabled = parameters.sandbox;

if (parameters.sandbox) {
  console.log('\n[mturk-config] MTurk Requester Sandbox is enabled.');
  parameters.endpoint = parameters.sandboxEndpoint;
  parameters.previewURL = parameters.sandboxPreviewURL;
}

export { parameters };
