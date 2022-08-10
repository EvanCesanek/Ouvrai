// SPECIAL CONFIG FILE FOR COMPENSATION HITs
// If a worker(s) emailed you saying they completed your task but couldn't submit:
//  1. Verify that they have a valid completion code (and any other validity checks you desire)
//  2. Modify the mturkReward and workersToCompensate properties below
//  3. Run: wjs create-hit compensation_hit
//  4. Send the printed previewURL to the worker via email (or tell them to search 'daniel wolpert compensation')
//  5. Monitor and approve as usual with listSubmissions/listHITs/approve
//
// =============================== PARAMETERS ===============================

import { dateStringYMDHMS } from 'weblab-utils';

const parameters = {
  // general
  sandbox: false,
  databaseURL: 'https://cognitivescience.firebaseio.com',

  // [create-hit]
  title: 'Compensation HIT',
  description:
    'Compensation HIT for an earlier study that you accepted but could not submit due to an error.',
  keywords: 'compensation',
  reward: '0.50',
  workersToCompensate: ['A96LZMYB4B4ON'], // Determines # of assignments, > 9 will incur extra 20% fee
  allottedTime: { hours: 1, minutes: 0 },
  expiration: { days: 7, hours: 0 },
  autoApprove: { days: 7, hours: 0 },
  assignQIDs: ['3090SA10WQOIIHNSPIRICY6N5J0CNV'],
  batchLabel: dateStringYMDHMS().slice(0, 13), // 'YYYYMMDD_HHMM' - so you can only post one a minute

  // FOR TESTING -- [send-bonuses]
  bonusHITIDs: ['3RHLQY6EEXLDFDXSGWMRXAGST9W4DF'],
  workersToBonus: ['A96LZMYB4B4ON'],
  bonusAmounts: ['0.01'],
  bonusMessage: 'Thank you!',

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
  console.log('\n[config] You are using the Requester Sandbox');
  parameters.endpoint = parameters.sandboxEndpoint;
  parameters.previewURL = parameters.sandboxPreviewURL;
}

export { parameters };
