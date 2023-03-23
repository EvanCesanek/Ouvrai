export default {
  // Generic
  title: 'Study of movement control',
  requirementsList: [
    'Standard mouse or trackpad',
    'Recently updated web browser',
  ],
  requirementsPara: [],
  summaryPara: [
    'Use your mouse/trackpad to move the white cursor to different targets. You must complete the experiment in fullscreen mode. Bonus payments based on your final score.',
  ],
  instructionsList: [
    'Start each movement from the home position in the center. ',
    'When a target appears, move the cursor inside the target. ',
    'When the target disappears, return to the home position.',
  ],
  instructionsPara: [],

  totalAvailablePlaces: 5,
  studyAllowlist: [],
  studyBlocklist: [],

  prolific: {
    reward: 100, // Prolific format: cents, using the currency of your account.
    estimatedCompletionTime: 5, // minutes
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
    },
  },

  mturk: {
    reward: '1.00', // MTurk format: string, USD
    allottedTime: { days: 0, hours: 3, minutes: 0 },
    expiration: { days: 7, hours: 0, minutes: 0 },
    autoApprove: { days: 14, hours: 0, minutes: 0 },
    customQualificationsToAssign: [],
    qualificationAllowlist: [],
    qualificationBlocklist: [],
    restrictLocation: 'US',
    restrictApprovalRate: 97,
    keywords: 'cursor, reaching, 2D',
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
