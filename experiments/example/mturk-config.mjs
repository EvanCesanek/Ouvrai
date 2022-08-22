// SPECIAL CONFIG FILE FOR COMPENSATION HITs
// If a worker(s) emailed you saying they completed your task but couldn't submit:
//  1. Verify that they have a valid completion code (and any other validity checks you desire)
//  2. Modify the mturkReward and workersToCompensate properties below
//  3. Run: wjs create-hit compensation_hit
//  4. Send the printed previewURL to the worker via email (or tell them to search 'daniel wolpert compensation')
//  5. Monitor and approve as usual with listSubmissions/listHITs/approve
//
// =============================== PARAMETERS ===============================

import { dateStringMMDDYY } from 'weblab-utils';

const parameters = {
  sandbox: true,

  // [create-hit]
  title: `Predict the weight of objects (~10 minute game, $1 + performance bonus)`,
  description: `Play a simple web game where you learn to predict the weights of different objects. Maximum performance bonus = $1.00.`,
  reward: '1.00',
  keywords: `learning, movement, psychology, experiment, research, study, game`,
  allottedTime: { hours: 3, minutes: 0 },
  expiration: { days: 7, hours: 0 },
  autoApprove: { days: 4, hours: 0 },
  assignments: 9,
  assignQIDs: ['3090SA10WQOIIHNSPIRICY6N5J0CNV'],
  excludeQIDs: ['3090SA10WQOIIHNSPIRICY6N5J0CNV'],
  restrictToQIDs: [],
  restrictLocation: 'US',
  restrictApprovalRate: 97,
  batchLabel: 'batch001_' + dateStringMMDDYY(), // increment to post multiple batches

  // [create-qual]
  newQualDescription: `Object families with outliers, stabilization by stretching springs`,
  newQualKeywords: `objects, families, outlier, springs, 3D, VR`,

  // [send-bonus]
  bonusHITIDs: ['3RHLQY6EEXLDFDXSGWMRXAGST9W4DF'],
  workersToBonus: ['A96LZMYB4B4ON'],
  bonusAmounts: ['0.01'],
  bonusMessage: 'Thank you!',

  // [download-workers]
  workersToDownload: [],

  // do not modify
  endpoint: 'https://mturk-requester.us-east-1.amazonaws.com',
  sandboxEndpoint: 'https://mturk-requester-sandbox.us-east-1.amazonaws.com',
  previewURL: 'https://worker.mturk.com/mturk/preview?groupId=',
  sandboxPreviewURL: 'https://workersandbox.mturk.com/mturk/preview?groupId=',
};

// Qualifications disabled by default in sandbox
parameters.qualificationsDisabled = parameters.sandbox;

if (parameters.sandbox) {
  console.log('\n[mturk-config] You are using the Requester Sandbox');
  parameters.endpoint = parameters.sandboxEndpoint;
  parameters.previewURL = parameters.sandboxPreviewURL;
}

export { parameters };
