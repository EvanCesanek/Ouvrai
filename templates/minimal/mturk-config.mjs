// =============================== PARAMETERS ===============================

const parameters = {
  sandbox: true,

  // [create-hit]
  title: `Web game: Move your cursor to hit the targets`,
  description: `In this game, you will use your mouse/trackpad to hit the targets. Instructions: Start each trial from the home position in the center of the screen. When the target circle appears, move the cursor into the target. Then return to the home position. Bonus payments are based on your final score.`,
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
  batchLabel: 'batch00', // increment to post multiple batches

  // [create-qual]
  newQualDescription: `Simple reaching to targets`,
  newQualKeywords: `cursor, target, reaching, 2D`,

  // [send-bonus], [p-send-bonus]
  bonusHITIDs: [],
  bonusAmounts: [],
  workersToBonus: [],
  bonusMessage: 'Thank you!',

  // [download-workers]
  workersToDownload: [],

  // [p-approve]
  workersToApprove: [],

  // do not modify
  endpoint: 'https://mturk-requester.us-east-1.amazonaws.com',
  sandboxEndpoint: 'https://mturk-requester-sandbox.us-east-1.amazonaws.com',
  previewURL: 'https://worker.mturk.com/mturk/preview?groupId=',
  sandboxPreviewURL: 'https://workersandbox.mturk.com/mturk/preview?groupId=',
};

// Qualifications disabled by default in sandbox
parameters.qualificationsDisabled = parameters.sandbox;

if (parameters.sandbox) {
  console.log('\n[mturk-config] MTurk Requester Sandbox is enabled.');
  parameters.endpoint = parameters.sandboxEndpoint;
  parameters.previewURL = parameters.sandboxPreviewURL;
}

export { parameters };
