import {
  AssociateQualificationWithWorkerCommand,
  CreateHITCommand,
  CreateQualificationTypeCommand,
  ListQualificationTypesCommand,
} from '@aws-sdk/client-mturk';
import axios from 'axios';
import inquirer from 'inquirer';
import jsdom from 'jsdom';
import replace from 'replace-in-file';
import { createRequire } from 'module';
import { execSync, spawn } from 'child_process';
import { join } from 'path';
import { readJSON } from 'fs-extra/esm';
import { access, readFile, writeFile } from 'fs/promises';
import { minify } from 'html-minifier-terser';
import ora from 'ora';

/*********
 * Basic Utilities */

export function dhmToSeconds({ days = 0, hours = 0, minutes = 0 }) {
  return ((24 * days + hours) * 60 + minutes) * 60;
}

export function dateStringMMDDYY() {
  let date = new Date();
  let formattedDate = ('0' + date.getDate()).slice(-2);
  let formattedMonth = ('0' + (date.getMonth() + 1)).slice(-2);
  let formattedYear = date.getFullYear().toString().slice(-2);
  let dateString = formattedMonth + formattedDate + formattedYear;
  return dateString;
}

export function dateStringYMDHMS() {
  let date = new Date();
  let formattedYear = date.getFullYear().toString();
  let formattedMonth = ('0' + (date.getMonth() + 1)).slice(-2); // JavaScript Date object has 0-indexed months
  let formattedDate = ('0' + date.getDate()).slice(-2);
  let formattedHours = ('0' + date.getHours()).slice(-2);
  let formattedMinutes = ('0' + date.getMinutes()).slice(-2);
  let formattedSeconds = ('0' + date.getSeconds()).slice(-2);

  let dateString =
    formattedYear +
    formattedMonth +
    formattedDate +
    '_' +
    formattedHours +
    formattedMinutes +
    formattedSeconds;
  return dateString;
}

export function isAlphanumeric(str) {
  let code, i, len;
  for (i = 0, len = str.length; i < len; i++) {
    code = str.charCodeAt(i);
    if (
      !(code > 47 && code < 58) && // numeric (0-9)
      !(code > 64 && code < 91) && // upper alpha (A-Z)
      !(code > 96 && code < 123) // lower alpha (a-z)
    ) {
      return false;
    }
  }
  return true;
}

export function ask(rl, query) {
  // rl must be opened and not paused
  rl.resume();
  return new Promise((resolve) => {
    rl.question(query, (input) => {
      rl.pause();
      resolve(input);
    });
  });
}

/*********
 * Prolific Utilities */

export async function prolificCreateStudyObject(expName, studyURL, config) {
  config.description = prolificPrepareDescriptionHTML(config);
  let studyObject = {
    name: config.title,
    internal_name: expName,
    description: config.description,
    external_study_url:
      studyURL +
      '?PROLIFIC_PID={{%PROLIFIC_PID%}}&STUDY_ID={{%STUDY_ID%}}&SESSION_ID={{%SESSION_ID%}}',
    prolific_id_option: 'url_parameters',
    completion_option: 'url',
    completion_codes: [
      {
        code: config.prolific.defaultCompletionCode || 'OUVRAI',
        code_type: 'COMPLETED',
      },
    ],
    total_available_places: config.totalAvailablePlaces,
    estimated_completion_time: config.prolific.estimatedCompletionTime,
    maximum_allowed_time: config.prolific.maximumAllowedTime,
    reward: config.prolific.reward,
    device_compatibility: config.prolific.compatibleDevices,
    peripheral_requirements: [],
    eligibility_requirements: [],
    naivety_distribution_rate: config.prolific.naivety,
    project: config.prolific.project,
  };
  if (!studyObject.project) {
    studyObject.project = await prolificSelectProject();
  }
  return studyObject;
}

export async function prolificCreateDraftStudy(studyObject) {
  try {
    let res = await axios.post(
      `https://api.prolific.co/api/v1/studies/`,
      studyObject,
      {
        headers: {
          Authorization: `Token ${process.env.PROLIFIC_AUTH_TOKEN}`,
        },
      }
    );
    console.log(
      `Successfully created draft study!` +
        `\n Preview it at https://app.prolific.co/researcher/workspaces/studies/${res.data.id}.`
    );
    return res.data;
  } catch (err) {
    console.log(studyObject);
    console.log(err.message);
    process.exit(1);
  }
}

export async function prolificListWorkspaces() {
  try {
    let res = await axios.get('https://api.prolific.co/api/v1/workspaces/', {
      headers: {
        Authorization: `Token ${process.env.PROLIFIC_AUTH_TOKEN}`,
      },
    });
    return res.data.results;
  } catch (err) {
    console.log(err.message);
    process.exit(1);
  }
}

export async function prolificListProjects(workspaceId) {
  if (!workspaceId) {
    console.log('workspaceId is required!');
    process.exit(1);
  }
  try {
    let res = await axios.get(
      `https://api.prolific.co/api/v1/workspaces/${workspaceId}/projects/`,
      {
        headers: {
          Authorization: `Token ${process.env.PROLIFIC_AUTH_TOKEN}`,
        },
      }
    );
    return res.data.results;
  } catch (err) {
    console.log(err.message);
    process.exit(1);
  }
}

export async function prolificListStudies({ filterStates, byProject = false }) {
  if (!byProject) {
    let states = [
      'ACTIVE',
      'PAUSED',
      'UNPUBLISHED',
      'PUBLISHING',
      'COMPLETED',
      'AWAITING REVIEW',
      'UNKNOWN',
      'SCHEDULED',
    ];

    // Check filterStates argument
    if (
      Array.isArray(filterStates) &&
      !filterStates.every((x) => states.indexOf(x) !== -1)
    ) {
      console.log(
        `Error: filterStates must be array of strings in (${states.join(
          ', '
        )}).`
      );
      return;
    }

    if (!filterStates) {
      let answers = await inquirer.prompt([
        {
          type: 'checkbox',
          name: 'filterStates',
          message: 'Do you only want to see studies in certain states?',
          choices: states,
          default: states,
        },
      ]);
      filterStates = answers.filterStates;
    }
    let stateStringArray = `(${filterStates.join('|')})`;

    // Get all studies, filtered by state
    try {
      let res = await axios.get('https://api.prolific.co/api/v1/studies/', {
        params: {
          state: stateStringArray,
        },
        headers: {
          Authorization: `Token ${process.env.PROLIFIC_AUTH_TOKEN}`,
        },
      });
      return res.data.results;
    } catch (err) {
      console.log(err.message);
      process.exit(1);
    }
  } else {
    let projectId = prolificSelectProject();

    try {
      let res = await axios.get(
        `https://api.prolific.co/api/v1/projects/${projectId}/studies/`,
        {
          headers: {
            Authorization: `Token ${process.env.PROLIFIC_AUTH_TOKEN}`,
          },
        }
      );
      return res.data.results;
    } catch (err) {
      console.log(err.message);
      process.exit(1);
    }
  }
}

export async function prolificSelectProject() {
  // List all studies in project
  let workspaces = await prolificListWorkspaces();
  let workspaceId;
  if (workspaces.length > 1) {
    let workspaceNames = workspaces.map((x) => ({
      name: x.title,
      value: x.id,
    }));
    let answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'workspaceId',
        message: 'Please choose a workspace:',
        choices: workspaceNames,
      },
    ]);
    workspaceId = answers.workspaceId;
  } else {
    workspaceId = workspaces[0].id;
  }

  let projects = await prolificListProjects(workspaceId);
  let projectId;
  if (projects.length > 1) {
    let projectNames = projects.map((x) => ({
      name: x.title,
      value: x.id,
    }));
    let answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'projectId',
        message: 'Please choose a project:',
        choices: projectNames,
      },
    ]);
    projectId = answers.projectId;
  } else {
    projectId = projects[0].id;
  }
  return projectId;
}

export async function prolificPostStudy(studyId) {
  let answers = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: `You are about to post a study on Prolific, which will cost money! Are you sure you want to do this?`,
      default: false,
    },
  ]);
  if (!answers.confirm) {
    console.log('\nYour study has NOT been posted to Prolific.\n');
    process.exit(1);
  }
  try {
    let res = await axios.post(
      `https://api.prolific.co/api/v1/studies/${studyId}/transition`,
      {
        action: 'PUBLISH',
      },
      {
        headers: {
          Authorization: `Token ${process.env.PROLIFIC_AUTH_TOKEN}`,
        },
      }
    );
    return res;
  } catch (err) {
    console.log(err.message);
  }
}

function prolificPrepareDescriptionHTML(config) {
  let description;
  // Requirements
  // If requirements list items are supplied
  if (
    Array.isArray(config.requirementsList) &&
    config.requirementsList.length > 0
  ) {
    // Add the header
    description = '<h2>Requirements</h2>';
    // Add the ordered list
    description += '<p><ul>';
    for (let req of config.requirementsList) {
      description += `<li>${req}</li>`;
    }
    description += '</ul><p>';
  }
  // If requirements paragraphs are supplied
  if (
    Array.isArray(config.requirementsPara) &&
    config.requirementsPara.length > 0
  ) {
    // Add the header if it's not there already
    if (description.indexOf('<h2>Requirements</h2>') === -1) {
      description += '<h2>Requirements</h2>';
    }
    for (let reqp of config.requirementsPara) {
      description += `<p>${reqp}</p>`;
    }
  }

  // Summary
  if (Array.isArray(config.summaryPara) && config.summaryPara.length > 0) {
    // Add the header
    description = '<h2>Summary</h2>';
    for (let summp of config.summaryPara) {
      description += `<p>${summp}</p>`;
    }
  }

  // Instructions
  // If instructions list items are supplied
  if (
    Array.isArray(config.instructionsList) &&
    config.instructionsList.length > 0
  ) {
    // Add the header
    description += '<h2>Instructions</h2>';
    // Add the ordered list
    description += '<p><ol>';
    for (let instr of config.instructionsList) {
      description += `<li>${instr}</li>`;
    }
    description += '</ol><p>';
  }
  // If instructions paragraphs are supplied
  if (
    Array.isArray(config.instructionsPara) &&
    config.instructionsPara.length > 0
  ) {
    // Add the header if it's not there already
    if (description.indexOf('<h2>Instructions</h2>') === -1) {
      description += '<h2>Instructions</h2>';
    }
    // Add each paragraph
    for (let instrp of config.instructionsPara) {
      description += `<p>${instrp}</p>`;
    }
  }
  return description;
}

/*********
 * MTurk Utilities */

export async function mturkPostStudy(
  client,
  expName,
  studyURL,
  config,
  firebaseConfig,
  mturkConfig,
  options
) {
  if (!options.sandbox) {
    let answers = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: `You are about to post a real study on MTurk, which will cost money! Are you sure you want to do this?`,
        default: false,
      },
    ]);
    if (!answers.confirm) {
      console.log('\nYour study has NOT been posted to MTurk.\n');
      process.exit(1);
    }
  }

  const htmlQuestion = await mturkPrepareHTML(
    expName,
    studyURL,
    config,
    firebaseConfig,
    options
  );

  const qualificationRequirements = await mturkPrepareQualifications(
    client,
    expName,
    config,
    options
  );

  if (options.compensation) {
    config.totalAvailablePlaces = config.workersToCompensate.length;
  }
  const createHITCommandInput = mturkCreateHIT(
    expName,
    htmlQuestion,
    qualificationRequirements,
    config
  );

  let sampleSizes = await mturkPromptPostCopies(config.totalAvailablePlaces);

  let previewURL = options.sandbox
    ? mturkConfig.sandboxPreviewURL
    : mturkConfig.previewURL;

  let baseToken = createHITCommandInput.UniqueRequestToken;
  let i = 0;
  for (let n of sampleSizes) {
    console.log('-------------------');
    i++;
    createHITCommandInput.UniqueRequestToken =
      baseToken + `_v${String(i).padStart(3, '0')}`;
    createHITCommandInput.MaxAssignments = n;
    const createHITCommand = new CreateHITCommand(createHITCommandInput);
    try {
      let createHITCommandOutput = await client.send(createHITCommand);
      console.log(
        `Successfully created draft study! (${createHITCommandOutput.HIT.HITId})` +
          `\nPreview it at ${
            previewURL + createHITCommandOutput.HIT.HITGroupId
          }.`
      );

      await updateStudyHistory(
        expName,
        'HITId',
        createHITCommandOutput.HIT.HITId
      );
    } catch (error) {
      console.log(error.message);
      process.exit(1);
    }
  }
}

async function mturkPrepareHTML(
  expName,
  studyURL,
  config,
  firebaseConfig,
  options
) {
  let HTMLQuestion;
  if (options.compensation) {
    const mturkLayoutPath = new URL(
      '../config/layout/mturk-layout-compensation.html',
      import.meta.url
    );
    HTMLQuestion = await readFile(mturkLayoutPath, 'utf8');
  } else {
    const mturkLayoutPath = new URL(
      '../config/layout/mturk-layout.html',
      import.meta.url
    ).pathname;
    // 1. Overwrite JavaScript variables
    let timestampComment = '// ' + new Date();
    let replaceOptions = {
      files: mturkLayoutPath,
      from: [/^.*expName = .*$/m, /^.*taskURL = .*$/m, /^.*databaseURL = .*$/m],
      to: [
        `        const expName = '${expName}'; ${timestampComment}`,
        `        const taskURL = '${studyURL}'; ${timestampComment}`,
        `        const databaseURL = '${firebaseConfig.databaseURL}'; ${timestampComment}`,
      ],
    };

    try {
      await replace(replaceOptions);
    } catch (error) {
      console.log(error.message);
      process.exit(1);
    }

    // 2. Modify the DOM
    let dom = await jsdom.JSDOM.fromFile(mturkLayoutPath);
    let document = dom.window.document;
    // Title
    document.getElementById('title-text').textContent = config.title;
    // Requirements
    let reqdiv = document.getElementById('requirements');
    let removeReqDiv = true;
    // If requirements list items are supplied
    if (
      Array.isArray(config.requirementsList) &&
      config.requirementsList.length > 0
    ) {
      removeReqDiv = false;
      let reqlist = reqdiv.appendChild(document.createElement('ul'));
      reqlist.style = 'padding-left: 1em';
      for (let req of config.requirementsList) {
        let x = reqlist.appendChild(document.createElement('li'));
        x.textContent = req;
      }
    }
    // If requirements paragraphs are supplied
    if (
      Array.isArray(config.requirementsPara) &&
      config.requirementsPara.length > 0
    ) {
      removeReqDiv = false;
      for (let reqp of config.requirementsPara) {
        let x = reqdiv.appendChild(document.createElement('p'));
        x.textContent = reqp;
      }
    }

    // Summary
    let summarydiv = document.getElementById('summary');
    let removeSummaryDiv = true;
    if (Array.isArray(config.summaryPara) && config.summaryPara.length > 0) {
      removeSummaryDiv = false;
      for (let summp of config.summaryPara) {
        let x = summarydiv.appendChild(document.createElement('p'));
        x.textContent = summp;
      }
    }

    // Instructions
    let instrdiv = document.getElementById('instructions');
    let removeInstrDiv = true;
    // If instructions list items are supplied
    if (
      Array.isArray(config.instructionsList) &&
      config.instructionsList.length > 0
    ) {
      removeInstrDiv = false;
      let instrlist = instrdiv.appendChild(document.createElement('ol'));
      instrlist.style = 'padding-left: 1em';
      for (let instr of config.instructionsList) {
        let x = instrlist.appendChild(document.createElement('li'));
        x.textContent = instr;
      }
    }
    // If instructions paragraphs are supplied
    if (
      Array.isArray(config.instructionsPara) &&
      config.instructionsPara.length > 0
    ) {
      removeInstrDiv = false;
      for (let instrp of config.instructionsPara) {
        let x = instrdiv.appendChild(document.createElement('p'));
        x.textContent = instrp;
      }
    }

    if (removeReqDiv) {
      reqdiv.parentElement?.removeChild(reqdiv);
    }
    if (removeSummaryDiv) {
      summarydiv.parentElement?.removeChild(summarydiv);
    }
    if (removeInstrDiv) {
      instrdiv.parentElement?.removeChild(instrdiv);
    }

    // Serialize back into HTML string
    HTMLQuestion = dom.serialize();
  }

  // Minify
  HTMLQuestion = await minify(HTMLQuestion, {
    collapseWhitespace: true,
    removeComments: true,
    minifyJS: true,
  });

  // 3. Prepend/append the required XML for an HTMLQuestion object (see MTurk API docs)
  let beginXmlTags =
    '<HTMLQuestion xmlns="http://mechanicalturk.amazonaws.com/AWSMechanicalTurkDataSchemas/2011-11-11/HTMLQuestion.xsd"> <HTMLContent><![CDATA[';
  let endXmlTags =
    ']]> </HTMLContent> <FrameHeight>0</FrameHeight> </HTMLQuestion>';
  HTMLQuestion = beginXmlTags + HTMLQuestion + endXmlTags;

  return HTMLQuestion;
}

async function mturkPrepareQualifications(client, expName, config, options) {
  let QualificationRequirements = [];

  if (options.compensation || expName === 'compensation') {
    if (
      !config.workersToCompensate ||
      config.workersToCompensate.length === 0
    ) {
      console.log(
        'Error: You must specify workersToCompensate in /experiments/compensation/study-config.js.'
      );
      process.exit(1);
    }
    const req = new CreateQualificationTypeCommand({
      Name: `Compensation ${dateStringYMDHMS()}`,
      Description: `Qualification for a compensation HIT for the following worker(s): ${config.workersToCompensate}`,
      Keywords: `compensation, ${config.workersToCompensate.join(', ')}`,
      QualificationTypeStatus: 'Active',
    });
    let qid;
    let spinner = ora(`Creating qualification for compensation HIT...`).start();
    try {
      let res = await client.send(req);
      qid = res.QualificationType.QualificationTypeId;
      spinner.succeed();
    } catch (error) {
      spinner.fail(error.message);
    }

    // Assign to the workers
    for (let wkr of config.workersToCompensate) {
      let spinner = ora(`Assigning qualification ${qid} to ${wkr}`);
      const req = new AssociateQualificationWithWorkerCommand({
        QualificationTypeId: qid,
        WorkerId: wkr,
        SendNotification: true, // let them know
        IntegerValue: 1,
      });
      try {
        await client.send(req);
        spinner.succeed();
      } catch (error) {
        spinner.fail(
          `Failed to assign qualification to ${wkr}: ${error.message}`
        );
      }
    }

    QualificationRequirements = [
      {
        Comparator: 'Exists',
        QualificationTypeId: qid,
        ActionsGuarded: 'DiscoverPreviewAndAccept',
      },
    ];
    return QualificationRequirements;
  }

  let studyConsentQID = await mturkGetQualificationByName(client, expName);
  if (!studyConsentQID) {
    ora('No qualification exists for this study.').info();
    const req = new CreateQualificationTypeCommand({
      Name: expName,
      Description: `Assigned to workers who consent to participate in study '${expName}'`,
      Keywords: ['ouvrai', 'consent', ...(config.mturk?.keywords || '')].join(
        ', '
      ),
      QualificationTypeStatus: 'Active',
    });
    let spinner = ora(`Creating qualification for '${expName}'...`).start();
    try {
      let res = await client.send(req);
      studyConsentQID = res.QualificationType.QualificationTypeId;
      spinner.succeed();
    } catch (error) {
      spinner.fail(error.message);
    }
  }

  QualificationRequirements.push({
    Comparator: 'DoesNotExist',
    QualificationTypeId: studyConsentQID,
    ActionsGuarded: 'DiscoverPreviewAndAccept',
  });

  if (
    (!config.mturk?.qualificationBlocklist ||
      config.mturk?.qualificationBlocklist?.length === 0) &&
    (!config.mturk?.qualificationAllowlist ||
      config.mturk?.qualificationAllowlist?.length === 0)
  ) {
    ora(
      'Tip: To exclude participants who completed specific past studies, use the studyAllowlist parameter of study-config.js. ' +
        'To allow only those who have completed specific past studies, use the studyBlocklist parameter.'
    ).info();
  }

  // Block list
  config.mturk?.qualificationBlocklist?.forEach((exqid) =>
    QualificationRequirements.push({
      Comparator: 'DoesNotExist',
      QualificationTypeId: exqid,
      ActionsGuarded: 'DiscoverPreviewAndAccept',
    })
  );

  // Allow list
  config.mturk?.qualificationAllowlist?.forEach((reqid) =>
    QualificationRequirements.push({
      Comparator: 'Exists',
      QualificationTypeId: reqid,
      ActionsGuarded: 'DiscoverPreviewAndAccept',
    })
  );

  // Location allow
  if (config.mturk?.restrictLocation === 'US') {
    QualificationRequirements.push({
      QualificationTypeId: '00000000000000000071',
      Comparator: 'In',
      LocaleValues: [
        {
          Country: 'US',
          //Subdivision: 'NY'
        },
      ],
      ActionsGuarded: 'DiscoverPreviewAndAccept',
    });
  }

  // Approval rate cutoff
  if (config.mturk?.restrictApprovalRate) {
    let cutoff;
    if (Number.isInteger(config.mturk.restrictApprovalRate)) {
      cutoff = config.mturk.restrictApprovalRate;
    } else {
      cutoff = 99;
    }
    QualificationRequirements.push({
      QualificationTypeId: '000000000000000000L0', // percentage approved
      Comparator: 'GreaterThanOrEqualTo',
      IntegerValues: [cutoff],
      ActionsGuarded: 'DiscoverPreviewAndAccept',
    });
    // Note: percentage approved is locked to 100% until a worker completes 100 HITs
    // Prompt to block these workers
    let answers = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'blockUnder100',
        message: `Approval rate must be > ${cutoff}%. Workers with < 100 completed HITs have 100% approval rate. Block these workers too?`,
        default: true,
      },
    ]);
    if (answers.blockUnder100) {
      QualificationRequirements.push({
        QualificationTypeId: '00000000000000000040', // number approved
        Comparator: 'GreaterThan',
        IntegerValues: [100],
        ActionsGuarded: 'DiscoverPreviewAndAccept',
      });
    }
  }

  if (QualificationRequirements.length > 0 && options.sandbox) {
    let answers = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'disableQualifications',
        message:
          'Your study has requirements that may block you from viewing it in MTurk Sandbox. Disable these requirements for this draft study?',
        default: true,
      },
    ]);
    if (answers.disableQualifications) {
      return [];
    }
  }

  return QualificationRequirements;
}

function mturkCreateHIT(
  expName,
  htmlQuestion,
  qualificationRequirements,
  config
) {
  // Default label is 'YYYYMMDD_HHMM' so you can only post once per clock-minute
  let batchLabel = dateStringYMDHMS().slice(0, 13);
  const myHIT = {
    Title: config.title,
    Description: config.summaryPara.join(' '),
    Keywords: config.mturk.keywords,
    Reward: config.mturk.reward,
    MaxAssignments: config.totalAvailablePlaces,
    AssignmentDurationInSeconds: dhmToSeconds(config.mturk.allottedTime),
    LifetimeInSeconds: dhmToSeconds(config.mturk.expiration),
    AutoApprovalDelayInSeconds: dhmToSeconds(config.mturk.autoApprove),
    Question: htmlQuestion,
    RequesterAnnotation: expName,
    QualificationRequirements: qualificationRequirements,
    UniqueRequestToken: `${expName}_${batchLabel}`,
  };
  return myHIT;
}

async function mturkPromptPostCopies(totalAvailablePlaces) {
  if (totalAvailablePlaces > 9) {
    let sampleSizes;
    let answers = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'avoidExtraFee',
        message:
          'You are trying to recruit 10 or more participants from MTurk. Would you like to avoid the extra 20% fee by posting multiple copies with 9 or fewer participants in each?',
        default: true,
      },
    ]);
    if (answers.avoidExtraFee) {
      sampleSizes = new Array(Math.floor(totalAvailablePlaces / 9)).fill(9);
      if (totalAvailablePlaces % 9 > 0) {
        sampleSizes.push(totalAvailablePlaces % 9);
      }
    } else {
      sampleSizes = [totalAvailablePlaces];
    }
    return sampleSizes;
  } else {
    return [totalAvailablePlaces];
  }
}

export async function mturkListQualifications(client, query) {
  let req = {
    Query: query,
    MustBeRequestable: false, // required, we want to see all qualification types
    MustBeOwnedByCaller: true, // we only want to see our own qualifications
  };

  const command = new ListQualificationTypesCommand(req);

  try {
    return await client.send(command);
  } catch (error) {
    throw error;
  }
}

export async function mturkGetQualificationByName(client, name) {
  let res;
  try {
    res = await mturkListQualifications(client, name);
  } catch (error) {
    throw error;
  }
  let match = res.QualificationTypes.filter((x) => x.Name === name)[0];
  return match;
}

export let mturkConfig = {
  endpoint: 'https://mturk-requester.us-east-1.amazonaws.com',
  sandboxEndpoint: 'https://mturk-requester-sandbox.us-east-1.amazonaws.com',
  previewURL: 'https://worker.mturk.com/mturk/preview?groupId=',
  sandboxPreviewURL: 'https://workersandbox.mturk.com/mturk/preview?groupId=',
};

/*********
 * Firebase Utilities */

export function firebaseClient() {
  // firebase-tools should be installed globally, temporarily add global root to NODE_PATH and require
  // See https://github.com/firebase/firebase-tools#using-as-a-module
  const require = createRequire(import.meta.url);
  let result = execSync('npm root -g');
  const client = require(join(result.toString().trim(), 'firebase-tools'));
  return client;
}

export async function firebaseChooseProject(
  client,
  promptMessage = 'You have multiple Firebase projects. Which would you like to use?'
) {
  let projectId;
  let projects = await client.projects.list();
  projects = projects.map((x) => x.projectId);
  if (projects.length === 0) {
    console.log(
      `You must create a Firebase project at https://console.firebase.google.com.`
    );
    process.exit(1);
  } else if (projects.length === 1) {
    projectId = projects[0];
  } else if (projects.length > 1) {
    let answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'projectId',
        message: promptMessage,
        choices: projects,
      },
    ]);
    projectId = answers.projectId;
  }
  return projectId;
}

export async function firebaseChooseSite(
  client,
  projectId,
  promptMessage = 'You have multiple Firebase Hosting sites. Which would you like to use?'
) {
  let sites = await client.hosting.sites.list({ project: projectId });
  sites = sites.sites.map((x) => x.name.split('/').slice(-1)[0]);
  let siteName;
  if (sites.length === 1) {
    siteName = sites[0];
    console.log(
      `Project ${projectId} only has one Hosting site: ${siteName}.web.app. Using this site.` +
        'To create additional Hosting sites, use the Firebase web console.'
    );
  } else if (sites.length > 1) {
    let answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'siteName',
        message: promptMessage,
        choices: sites,
      },
    ]);
    siteName = answers.siteName;
  }
  return siteName;
}

export async function firebaseGetData(refString, projectId, shallow = false) {
  let str = '';
  let args = ['database:get', refString, '--project', projectId];
  if (shallow) {
    args.push('--shallow');
  }

  let proc = spawn('firebase', args);
  proc.stdout.on('data', (data) => {
    str += data;
  });

  return new Promise((resolve) =>
    proc.on('close', () => resolve(JSON.parse(str)))
  );
}

/*********
 * Study Management Utilities */

export async function updateStudyHistory(expName, key, value) {
  // Read
  let studyHistoryJSON;
  try {
    studyHistoryJSON = await getStudyHistory(expName);
  } catch (err) {
    throw err;
  }
  if (studyHistoryJSON === undefined) {
    console.log('Initializing new study history.');
    studyHistoryJSON = { HITId: [], siteId: [] };
  }

  // Update
  if (!Object.keys(studyHistoryJSON).includes(key)) {
    console.log(
      `Error: Failed to update study-history.json. Key ${key} does not exist!`
    );
    return -1;
  } else {
    studyHistoryJSON[key].push(value);
  }

  // Write
  let studyHistoryURL = new URL(
    `../experiments/${expName}/study-history.json`,
    import.meta.url
  );
  try {
    await writeFile(studyHistoryURL, JSON.stringify(studyHistoryJSON, null, 2));
  } catch (err) {
    console.log(`Error: Write failed to ${studyHistoryURL.pathname}`);
    throw err;
  }
  console.log(`Study history updated. Most recent ${key} is '${value}'.`);
  return 0;
}

export async function getStudyHistory(expName) {
  let studyHistoryJSON;
  let studyHistoryURL = new URL(
    `../experiments/${expName}/study-history.json`,
    import.meta.url
  );
  // Read
  if (await exists(studyHistoryURL)) {
    try {
      studyHistoryJSON = await readJSON(studyHistoryURL);
    } catch (err) {
      throw err;
    }
  } else {
    console.log(
      `Warning: Study history not found at ${studyHistoryURL.pathname}.`
    );
  }
  return studyHistoryJSON;
}

export async function getLatestDeployURL(expName) {
  let history = await getStudyHistory(expName);
  if (history === undefined) {
    console.log(
      'Error: You have never deployed this study to a Firebase Hosting site.'
    );
    process.exit(1);
  }
  let latestURL = `https://${history.siteId.slice(-1)}.web.app`;
  return latestURL;
}

export async function getStudyConfig(expName) {
  const configURL = new URL(
    `../experiments/${expName}/study-config.js`,
    import.meta.url
  );
  let config;
  try {
    config = await import(configURL);
    config = config.default;
  } catch (error) {
    throw error;
  }
  return config;
}

export async function exists(path) {
  try {
    await access(path);
    return true;
  } catch (err) {
    return false;
  }
}
