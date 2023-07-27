import express, { json, Router } from 'express';
import { readdir } from 'fs/promises';
import { URL } from 'url';
import { readJSON } from 'fs-extra/esm';
import {
  GetAccountBalanceCommand,
  DeleteHITCommand,
  ListHITsCommand,
  ListAssignmentsForHITCommand,
  UpdateExpirationForHITCommand,
  MTurkClient,
  RejectAssignmentCommand,
  ApproveAssignmentCommand,
  AssociateQualificationWithWorkerCommand,
} from '@aws-sdk/client-mturk';
import { firebaseClient, mturkConfig } from '../cli/cli-utils.js';

const port = 5002;
const app = express();

const recordRoutes = Router();

// client connections
let mturk, mturkSandbox, firebase;

// here we create a route in our router.
// different functions for get, post, delete... see docs
recordRoutes.route('/api/studies').get(async function (req, res) {
  let experiments;
  try {
    let path = new URL('../experiments', import.meta.url);
    experiments = await readdir(path);
  } catch (err) {
    throw err;
  }
  experiments = experiments.filter((x) => x !== '.DS_Store');

  let result = [];

  for (let e of experiments) {
    // Read local site history file
    let site;
    try {
      let path = new URL(
        `../experiments/${e}/study-history.json`,
        import.meta.url
      );
      let studyHistory = await readJSON(path);
      site = studyHistory.siteId?.pop() || 'Not deployed';
    } catch (err) {
      site = 'No study history';
    }

    result.push({
      name: e,
      key: e,
      site: site,
    });
  }

  res.json(result); // need to put result in response (res)
});

recordRoutes.route('/api/mturk/balance').get(async function (req, res) {
  let client = req.query.sandbox ? mturkSandbox : mturk;
  let result = await client.send(new GetAccountBalanceCommand());
  res.json(result);
});

recordRoutes
  .route('/api/mturk/assignments/:assignmentId/reject')
  .post(async function (req, res) {
    let client = req.query.sandbox ? mturkSandbox : mturk;
    try {
      let result = await client.send(
        new RejectAssignmentCommand({
          AssignmentId: req.params.assignmentId,
          RequesterFeedback:
            'Sorry, your submission was not accepted. Contact the Requester for more information or to request a reversal.',
        })
      );
      res.json(result);
    } catch (err) {
      console.log(err.name, err.TurkErrorCode, err.message);
      res.send(err);
    }
  });

recordRoutes
  .route('/api/mturk/assignments/:assignmentId/approve')
  .post(async function (req, res) {
    let client = req.query.sandbox ? mturkSandbox : mturk;
    try {
      let result = await client.send(
        new ApproveAssignmentCommand({
          AssignmentId: req.params.assignmentId,
          RequesterFeedback: 'Thank you!',
          OverrideRejection: true,
        })
      );
      res.json(result);
    } catch (err) {
      console.log(err.name, err.TurkErrorCode, err.message);
      res.send(err);
    }
  });

recordRoutes
  .route('/api/mturk/workers/:workerId/assignQual')
  .post(async function (req, res) {
    console.log('QID', req.body.qid);
    let client = req.query.sandbox ? mturkSandbox : mturk;
    try {
      let result = await client.send(
        new AssociateQualificationWithWorkerCommand({
          QualificationTypeId: req.body.qid, // QID HERE
          WorkerId: req.params.workerId,
          SendNotification: false, // Don't need to email the worker
          IntegerValue: 1, // Ignore (this is for "scored" qualifications)
        })
      );
    } catch (err) {
      console.log(err.name, err.TurkErrorCode, err.message);
      res.send(err);
    }
  });

recordRoutes.route('/api/mturk/hits').get(async function (req, res) {
  let client = req.query.sandbox ? mturkSandbox : mturk;
  let result = await client.send(new ListHITsCommand({}));
  for (let h of result.HITs) {
    h.Assignments = await client
      .send(new ListAssignmentsForHITCommand({ HITId: h.HITId }))
      .then((res) => res.Assignments);
  }
  res.json(result);
});

recordRoutes.route('/api/mturk/hits/:hitId').delete(async function (req, res) {
  let client = req.query.sandbox ? mturkSandbox : mturk;
  // Try to delete the HIT
  try {
    let result = await client.send(
      new DeleteHITCommand({ HITId: req.params.hitId })
    );
    res.json(result);
  } catch (err) {
    console.log(err.name, err.TurkErrorCode, err.message);
    res.send(err);
  }
});

recordRoutes
  .route('/api/mturk/hits/:hitId/expire')
  .post(async function (req, res) {
    let client = req.query.sandbox ? mturkSandbox : mturk;
    // Force the HIT to expire so no more assignments can be accepted
    let result = await client.send(
      new UpdateExpirationForHITCommand({
        ExpireAt: new Date(0),
        HITId: req.params.hitId,
      })
    );
    res.json(result);
  });

recordRoutes.route('/api/firebase').get(async function (req, res) {
  // Poll Firebase for projects
  let result = await firebase.projects.list();
  res.json(result);
});

recordRoutes.route('/api/prolific/me').get(async function (req, res) {
  let result = await fetch('https://api.prolific.co/api/v1/users/me', {
    headers: {
      Authorization: `Token ${process.env.PROLIFIC_AUTH_TOKEN}`,
    },
  }).then((res) => res.json());
  res.json(result);
});

recordRoutes.route('/api/prolific/workspaces').get(async function (req, res) {
  let result = await fetch('https://api.prolific.co/api/v1/workspaces/', {
    headers: {
      Authorization: `Token ${process.env.PROLIFIC_AUTH_TOKEN}`,
    },
  }).then((res) => res.json());
  res.json(result);
});

recordRoutes
  .route('/api/prolific/workspaces/:workspace')
  .get(async function (req, res) {
    let result = await fetch(
      `https://api.prolific.co/api/v1/workspaces/${req.params.workspace}`,
      {
        headers: {
          Authorization: `Token ${process.env.PROLIFIC_AUTH_TOKEN}`,
        },
      }
    ).then((res) => res.json());
    res.json(result);
  });

//app.use(cors());
app.use(json());
app.use(recordRoutes);

// listens on the port
app.listen(port, async () => {
  console.log(`Server is running on port: ${port}`);
  mturk = new MTurkClient({
    region: 'us-east-1',
    endpoint: mturkConfig.endpoint,
  });
  mturkSandbox = new MTurkClient({
    region: 'us-east-1',
    endpoint: mturkConfig.sandboxEndpoint,
  });
  firebase = await firebaseClient();
});
