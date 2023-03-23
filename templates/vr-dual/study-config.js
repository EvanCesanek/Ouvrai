export default {
  // Generic
  title: 'VR Study of Movement Control',
  requirementsList: [
    'Virtual reality headset',
    'Right-hand controller that tracks position and orientation',
    'VR web browser application (pre-installed on most headsets)',
  ],
  requirementsPara: [
    'The study runs in the web browser application on your VR headset, so you should not need to install anything. This study was developed for the Meta Quest 2, but comparable VR headsets should work.',
    '<b>If using the Meta Quest 2, please enable 120 Hz refresh rate (Settings > System > Display) and check that the floor level is properly set (Settings > Guardian).</b>',
  ],
  summaryPara: [
    'You will make 130 reaching movements with your right hand, using a handheld tool to hit targets. Please make straight, direct movements and avoid rotating the tool.',
    'The actual study takes 8 - 12 minutes. The estimated completion time (25 minutes) includes additional time to get set up in VR and to log in to Prolific using the VR web browser.',
  ],
  instructionsList: [
    'You may reserve a spot in the study using any device.',
    'Put on your VR headset, open the web browser app, and log in to Prolific.',
    'On the study web page, click "Open study in new window". You must open the study this way so we can automatically record your Prolific ID and provide the submission link at the end.',
    'Consent to participate by ticking the checkbox and clicking Continue.',
    'You will see a preview of the VR scene. Click the ENTER VR button near the top of the window to begin.',
    'When you enter VR, you should see a "billboard" with further instructions directly in front of you. If you do not see these instructions, try resetting your view.',
    'When the study is over, you will be prompted to exit the experience. Back in the web browser, you will find the link to return to Prolific and record your completion.',
  ],
  instructionsPara: [
    "Are you interested in participating, but can't (or don't want to) use your VR headset right now? Let us know so we can invite you back!",
    'If you have any questions or comments, send us a message. We will respond as soon as possible.',
  ],

  totalAvailablePlaces: 5,

  prolific: {
    reward: 500, // Prolific format: cents, using the currency of your account.
    estimatedCompletionTime: 25, // minutes
    maximumAllowedTime: undefined, // default = 2 + 2*estimated + 2*sqrt(estimated)
    compatibleDevices: ['desktop', 'mobile', 'tablet'], // ['desktop', 'mobile', 'tablet']
    peripheralRequirements: [], // ['audio', 'camera', 'download', 'microphone'],
    naivety: undefined, // [0, 1] - Prolific selects it "intelligently" if undefined
    project: undefined, // Project ID - if undefined and you have multiple, you will be prompted to select one
    screeners: {
      ageRange: [18, 65],
      approvalRateRange: [95, 100],
      fluentEnglish: true,
      excludeDementia: true,
      excludeMS: true,
      excludeMentalHealthImpact: true,
      normalVision: true,
      ownVR: true,
    },
  },

  mturk: {
    reward: '5.00', // MTurk format: string, USD
    allottedTime: { days: 0, hours: 5, minutes: 0 },
    expiration: { days: 7, hours: 0, minutes: 0 },
    autoApprove: { days: 4, hours: 0, minutes: 0 },
    assignQIDs: [],
    excludeQIDs: [],
    restrictToQIDs: [],
    restrictLocation: 'US',
    restrictApprovalRate: 97,
    keywords:
      'learning, movement, psychology, experiment, research, study, game',
    newQualDescription: 'Simple reaching to targets',
    newQualKeywords: 'cursor, target, reaching, 2D',
  },

  // Bonuses
  workersToBonus: [],
  bonusAmounts: [],
  bonusMessage: 'Thank you!',

  // Downloading data
  workersToDownload: [],

  // Approving (Prolific only)
  workersToApprove: [],
};
