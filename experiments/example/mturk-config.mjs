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
  assignQIDs: [],
  excludeQIDs: [],
  restrictToQIDs: [],
  restrictLocation: 'US',
  restrictApprovalRate: 97,
  batchLabel: 'batch00_' + dateStringMMDDYY(), // increment to post multiple batches

  // [create-qual]
  newQualDescription: `Object families with outliers, stabilization by stretching springs`,
  newQualKeywords: `objects, families, outlier, springs, 3D, VR`,

  // [send-bonus]
  bonusHITIDs: [],
  workersToBonus: [],
  bonusAmounts: [],
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
