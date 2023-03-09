export default {
  title: 'Compensation HIT',
  summaryPara: [
    'This is a Compensation HIT for previous work that you were unable to submit. Please provide your demographic information and then click Submit. Thank you!',
  ],

  mturk: {
    reward: '0.01', // MTurk format: string, USD
    workersToCompensate: ['A96LZMYB4B4ON'],
    allottedTime: { hours: 1 },
    expiration: { days: 7 },
    autoApprove: { days: 14 },
    customQualificationsToAssign: [], // QID of the experiment they are being compensated for
  },
};
