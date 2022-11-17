// =============================== PARAMETERS ===============================

const parameters = {
  sandbox: true,

  // [create-hit]
  //title: `Predict the weight of objects (~10 minute game, $1 + performance bonus)`,
  title: `[VR headset required] Reach to targets in virtual reality`,
  //description: `Play a simple web game where you learn to predict the weights of different objects. Maximum performance bonus = $1.00.`,
  description: `Put on your VR  headset, go to tinyurl.com/labvr, and enter the game! In your right hand, you will see that you are holding a T-shaped tool. Cubes will appear in front of you, one by one. Hit red cubes with the red side of tool, and hit blue cubes with the blue side.`,
  reward: '1.00',
  keywords: `learning, movement, psychology, experiment, research, study, game, vr, virtual reality`,
  allottedTime: { hours: 4, minutes: 0 },
  expiration: { days: 7, hours: 0 },
  autoApprove: { days: 10, hours: 0 },
  assignments: 9,
  assignQIDs: [],
  excludeQIDs: [],
  restrictToQIDs: [],
  restrictLocation: 'US',
  restrictApprovalRate: 97,
  batchLabel: 'batch00', // increment to post multiple batches

  // [create-qual]
  newQualDescription: `Control points reaching task in virtual reality`,
  newQualKeywords: `control points, context, reaching, vr, virtual reality`,

  // [send-bonus], [p-send-bonus]
  bonusHITIDs: [],
  bonusAmounts: [],
  workersToBonus: [],
  bonusMessage: 'Thank you!',

  // [download-workers]
  workersToDownload: ['61b0d9edbb51917ec1dcc38b'],

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
