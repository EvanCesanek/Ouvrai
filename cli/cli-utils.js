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
import { exec, spawn, spawnSync } from 'child_process';
import { join } from 'path';
import { readJSON } from 'fs-extra/esm';
import { access, readFile, writeFile } from 'fs/promises';
import { minify } from 'html-minifier-terser';
import ora from 'ora';
import { quote } from 'shell-quote';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

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

export function spawnp(cmd, args = [], cwd) {
  return new Promise(function (resolve, reject) {
    let cmdp = spawn(cmd, args, {
      cwd: cwd,
      encoding: 'utf8',
      stdio: 'inherit',
    });
    cmdp.on('error', (err) => reject(err));
    cmdp.on('close', (res) => resolve(res));
  });
}

/*********
 * Python Utilities */
export function spawnSyncPython(
  command,
  args,
  fallback = 'python',
  spawnStdio = 'inherit'
) {
  ora(`Spawning: ${command} ${args.join(' ')}`).info();
  let pythonDir = new URL('../python', import.meta.url);
  let subprocess = spawnSync(command, args, {
    cwd: pythonDir,
    shell: true,
    encoding: 'utf8',
    stdio: spawnStdio,
    windowsVerbatimArguments: true,
  });
  let code = subprocess.status;
  let message = subprocess.stderr;
  let output = subprocess.stdout;
  if ((code === 127 || code === 9009) && fallback) {
    ora(
      `Spawn exited with code ${code}: Command '${command}' not found. This is normal on Windows. Ouvrai will try again with fallback command '${fallback}'.`
    ).info();
    return spawnSyncPython(fallback, args, undefined, spawnStdio);
  } else if (code !== 0) {
    ora(`Spawn exited with code ${code}.`).fail();
    if (spawnStdio === 'pipe') {
      ora(message).info();
    }
    return subprocess;
  } else {
    ora(
      `Python command '${command} ${args.join(' ')}' was successful.`
    ).succeed();
    if (spawnStdio === 'pipe') {
      ora(output).info();
    }
    return subprocess;
  }
}

/*********
 * Prolific Utilities */

export async function prolificGetStudies(
  internal_name,
  states = [
    'ACTIVE',
    'PAUSED',
    'UNPUBLISHED',
    'PUBLISHING',
    'COMPLETED',
    'AWAITING REVIEW',
    'UNKNOWN',
    'SCHEDULED',
  ]
) {
  let stateQuery = states[0] ? `(${states.join('|')})` : '';
  let text = internal_name ? ` with internal name "${internal_name}"` : '';
  let spinner = ora(`Fetching Prolific studies${text}...`).start();
  let results;
  try {
    let res = await axios.get(
      `https://api.prolific.co/api/v1/studies/?state=${stateQuery}`,
      {
        headers: {
          Authorization: `Token ${process.env.PROLIFIC_AUTH_TOKEN}`,
        },
      }
    );
    results = res.data.results;
    if (internal_name) {
      results = results.filter(
        (study) => study.internal_name === internal_name
      );
    }
    if (results.length === 0) {
      spinner.info(`No previous studies found${text}.`);
      return false;
    } else {
      spinner.succeed(`Found ${results.length} previous studies${text}.`);
      return results;
    }
  } catch (err) {
    spinner.fail();
    ora(`${err.message} : ${err.response?.data?.error}`).fail();
    throw err;
  }
}

export async function prolificCreateStudyObject(
  studyName,
  deploySite,
  config,
  existingStudy
) {
  config.description = prolificPrepareDescriptionHTML(config);
  let studyObject = {
    name: config.title,
    internal_name: studyName,
    description: config.description,
    external_study_url:
      deploySite +
      '?PROLIFIC_PID={{%PROLIFIC_PID%}}&STUDY_ID={{%STUDY_ID%}}&SESSION_ID={{%SESSION_ID%}}',
    prolific_id_option: 'url_parameters',
    completion_option: 'url',
    completion_codes: [
      {
        code: 'OUVRAI',
        code_type: 'COMPLETED',
        actions: [{ action: 'MANUALLY_REVIEW' }],
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
  if (!existingStudy && !studyObject.project) {
    studyObject.project = await prolificSelectProject();
  }
  if (Array.isArray(config.prolific.screeners?.ageRange)) {
    studyObject.eligibility_requirements.push({
      _cls: 'web.eligibility.models.AgeRangeEligibilityRequirement',
      query: {
        id: '54ac6ea9fdf99b2204feb893',
      },
      attributes: [
        {
          value: config.prolific.screeners?.ageRange[0],
          name: 'min_age',
        },
        {
          value: config.prolific.screeners?.ageRange[1],
          name: 'max_age',
        },
      ],
    });
  }
  if (Array.isArray(config.prolific.screeners?.approvalRateRange)) {
    studyObject.eligibility_requirements.push({
      _cls: 'web.eligibility.models.ApprovalRateEligibilityRequirement',
      attributes: [
        {
          name: 'minimum_approval_rate',
          value: config.prolific.screeners?.approvalRateRange[0],
        },
        {
          name: 'maximum_approval_rate',
          value: config.prolific.screeners?.approvalRateRange[1],
        },
      ],
    });
  }
  if (config.prolific.screeners?.fluentEnglish) {
    studyObject.eligibility_requirements.push({
      _cls: 'web.eligibility.models.MultiSelectAnswerEligibilityRequirement',
      query: {
        id: '58c6b44ea4dd0a4799361afc',
        question: 'Which of the following languages are you fluent in?',
      },
      attributes: [
        {
          name: 'English',
          value: true,
          index: 19,
        },
      ],
    });
  }
  if (config.prolific.screeners?.excludeDementia) {
    studyObject.eligibility_requirements.push({
      _cls: 'web.eligibility.models.SelectAnswerEligibilityRequirement',
      query: {
        id: '59cb6f8c21454d000194c364',
        question:
          'Have you ever been diagnosed with mild cognitive impairment or dementia?',
      },
      attributes: [
        {
          name: 'No',
          value: true,
          index: 1,
        },
      ],
    });
  }
  if (config.prolific.screeners?.excludeMS) {
    studyObject.eligibility_requirements.push({
      _cls: 'web.eligibility.models.SelectAnswerEligibilityRequirement',
      query: {
        id: '5d825cdfbe876600168b6d16',
        question: 'Have you ever been diagnosed with multiple sclerosis (MS)?',
      },
      attributes: [
        {
          name: 'No',
          value: true,
          index: 1,
        },
      ],
    });
  }
  if (config.prolific.screeners?.excludeMentalHealthImpact) {
    studyObject.eligibility_requirements.push({
      _cls: 'web.eligibility.models.SelectAnswerEligibilityRequirement',
      query: {
        id: '58c951b0a4dd0a08048f3017',
        question:
          'Do you have any diagnosed mental health condition that is uncontrolled (by medication or intervention) and which has a significant impact on your daily life / activities?',
      },
      attributes: [
        {
          name: 'No',
          value: true,
          index: 1,
        },
      ],
    });
  }
  if (config.prolific.screeners?.normalVision) {
    studyObject.eligibility_requirements.push({
      _cls: 'web.eligibility.models.SelectAnswerEligibilityRequirement',
      query: {
        id: '57a0c4d2717b34954e81b919',
        question: 'Do you have normal or corrected-to-normal vision?',
        participant_help_text:
          'For example, you can see colour normally, and if you need glasses, you are wearing them or contact lenses',
      },
      attributes: [
        {
          name: 'Yes',
          value: true,
          index: 0,
        },
      ],
    });
  }
  if (config.prolific.screeners?.ownVR) {
    studyObject.eligibility_requirements.push({
      _cls: 'web.eligibility.models.SelectAnswerEligibilityRequirement',
      query: {
        id: '5eac255ff716eb05e0ed3853',
        question: 'Do you own a VR (Virtual Reality) headset?',
      },
      attributes: [
        {
          name: 'Yes',
          value: true,
          index: 0,
        },
      ],
    });
  }
  // TODO: blocklist and allowlist (no support for studies from diff projects or unpublished/active studies)
  // let spinner = ora(
  //   'Fetching previous studies for blocklist and allowlist...'
  // ).start();
  // let results;
  // try {
  //   let res = await axios.get(
  //     `https://api.prolific.co/api/v1/projects/${studyObject.project}/studies/`,
  //     {
  //       headers: {
  //         Authorization: `Token ${process.env.PROLIFIC_AUTH_TOKEN}`,
  //       },
  //     }
  //   );
  //   results = res.data.results;
  //   if (results.length === 0) {
  //     spinner.warn('No previous studies found in selected project.');
  //   } else {
  //     spinner.succeed(
  //       `Found ${results.length} previous studies in this project.`
  //     );
  //   }
  // } catch (err) {
  //   spinner.fail();
  //   ora(`${err.message} : ${err.response?.data?.error}`).fail();
  //   throw err;
  // }
  // if (
  //   config.studyBlocklist &&
  //   Array.isArray(config.studyBlocklist) &&
  //   config.studyBlocklist.length > 0
  // ) {
  //   let blocklist = results.filter((study) =>
  //     config.studyBlocklist.includes(study.internal_name)
  //   );
  //   let blockstudies = blocklist.map((study) => ({
  //     id: study.id,
  //     value: true,
  //     completion_codes: [],
  //   }));
  //   console.log(blockstudies);
  //   studyObject.eligibility_requirements.push({
  //     _cls: 'web.eligibility.models.PreviousStudiesEligibilityRequirement',
  //     attributes: blockstudies,
  //   });
  //   ora(
  //     `Added previous studies [${blocklist
  //       .map((s) => s.internal_name)
  //       .join(', ')}] to blocklist.`
  //   ).info();
  // } else {
  //   ora(`No previous study blocklist initialized.`).info();
  // }
  // if (
  //   config.studyAllowlist &&
  //   Array.isArray(config.studyAllowlist) &&
  //   config.studyAllowlist.length > 0
  // ) {
  //   let allowlist = results.filter((study) =>
  //     config.studyAllowlist.includes(study.internal_name)
  //   );
  //   let allowstudies = allowlist.map((study) => ({
  //     id: study.id,
  //     value: true,
  //     completion_codes: [],
  //   }));
  //   studyObject.eligibility_requirements.push({
  //     _cls: 'web.eligibility.models.PreviousStudiesAllowlistEligibilityRequirement',
  //     attributes: allowstudies,
  //   });
  //   ora(
  //     `Added previous studies [${allowlist
  //       .map((s) => s.internal_name)
  //       .join(', ')}] to allowlist.`
  //   ).info();
  // } else {
  //   ora(`No previous study allowlist initialized.`).info();
  // }
  return studyObject;
}

export async function prolificUpdateStudy(studyObject, id) {
  let spinner = ora(`Updating Prolific study ${id}`).start();
  try {
    let res = await axios.patch(
      `https://api.prolific.co/api/v1/studies/${id}/`,
      studyObject,
      {
        headers: {
          Authorization: `Token ${process.env.PROLIFIC_AUTH_TOKEN}`,
        },
      }
    );
    spinner.succeed();
    return res.data;
  } catch (err) {
    spinner.fail();
    ora(`${err.message} : ${err.response?.data?.error}`).fail();
    throw err;
  }
}

export async function prolificCreateDraftStudy(studyObject) {
  let spinner = ora('Creating Prolific draft study').start();
  let id;
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
    spinner.succeed();
    id = res.data.id;
  } catch (err) {
    spinner.fail();
    ora(`${err.message} : ${err.response?.data?.error}`).fail();
    throw err;
  }

  spinner = ora('Patching draft study (workaround for Prolific API bug)');
  try {
    let res = await axios.patch(
      `https://api.prolific.co/api/v1/studies/${id}/`,
      {
        completion_code: 'OUVRAI',
        completion_code_action: 'MANUALLY_REVIEW',
      },
      {
        headers: {
          Authorization: `Token ${process.env.PROLIFIC_AUTH_TOKEN}`,
        },
      }
    );
    spinner.succeed();
    return res.data;
  } catch (err) {
    spinner.fail();
    ora(`${err.message} : ${err.response?.data?.error}`).fail();
    throw err;
  }
}

export async function prolificListWorkspaces() {
  let spinner = ora('Retreiving workspaces from Prolific').start();
  try {
    let res = await axios.get('https://api.prolific.co/api/v1/workspaces/', {
      headers: {
        Authorization: `Token ${process.env.PROLIFIC_AUTH_TOKEN}`,
      },
    });
    spinner.succeed();
    return res.data.results;
  } catch (err) {
    spinner.fail();
    throw err;
  }
}

export async function prolificListProjects(workspaceId) {
  if (!workspaceId) {
    throw new Error('You must supply a workspaceId');
  }
  let spinner = ora(
    `Retrieving projects from Prolific workspace ${workspaceId}`
  ).start();
  try {
    let res = await axios.get(
      `https://api.prolific.co/api/v1/workspaces/${workspaceId}/projects/`,
      {
        headers: {
          Authorization: `Token ${process.env.PROLIFIC_AUTH_TOKEN}`,
        },
      }
    );
    spinner.succeed();
    return res.data.results;
  } catch (err) {
    spinner.fail();
    throw err;
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
      throw new Error(
        `filterStates must be array of strings in (${states.join(', ')})`
      );
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
    let spinner = ora('Retrieving your studies from Prolific').start();
    try {
      let res = await axios.get('https://api.prolific.co/api/v1/studies/', {
        params: {
          state: stateStringArray,
        },
        headers: {
          Authorization: `Token ${process.env.PROLIFIC_AUTH_TOKEN}`,
        },
      });
      spinner.succeed();
      return res.data.results;
    } catch (err) {
      spinner.fail();
      throw err;
    }
  } else {
    let projectId = await prolificSelectProject();

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
      throw err;
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
    ora('Your study has NOT been posted to Prolific').warn();
    process.exit(1); // Hard exit
  }
  try {
    let spinner = ora(`Posting study ${studyId} to Prolific`).start();
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
    spinner.succeed();
    return res;
  } catch (err) {
    spinner.fail();
    ora('Your study has NOT been posted to Prolific').warn();
    throw err;
  }
}

function prolificPrepareDescriptionHTML(config) {
  let description = '';
  // Requirements
  // If requirements list items are supplied
  if (
    Array.isArray(config.requirementsList) &&
    config.requirementsList.length > 0
  ) {
    // Add the header
    description += '<h2>Requirements</h2>';
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
    description += '<h2>Summary</h2>';
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
  studyName,
  deploySite,
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
        message: `You are about to post a real study on Amazon Mechanical Turk, which will cost money! Are you sure you want to do this?`,
        default: false,
      },
    ]);
    if (!answers.confirm) {
      ora('Your study has NOT been posted to Amazon Mechanical Turk.').warn();
      process.exit(1); // Hard exit
    }
  }

  const htmlQuestion = await mturkPrepareHTML(
    studyName,
    deploySite,
    config,
    firebaseConfig,
    options
  );

  const qualificationRequirements = await mturkPrepareQualifications(
    client,
    studyName,
    config,
    options
  );

  if (options.compensation) {
    config.totalAvailablePlaces = config.workersToCompensate.length;
  }
  const createHITCommandInput = mturkCreateHIT(
    studyName,
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
    let createHITCommandOutput;
    let spinner = ora(
      `Creating HIT on Amazon Mechanical Turk ${
        options.sandbox ? 'SANDBOX' : ''
      }`
    ).start();
    try {
      createHITCommandOutput = await client.send(createHITCommand);
      spinner.succeed(
        `${chalk.bold(
          'Successfully created HIT',
          createHITCommandOutput.HIT.HITId,
          '. Preview it at:\n    ',
          previewURL + createHITCommandOutput.HIT.HITGroupId
        )}`
      );
    } catch (err) {
      spinner.fail();
      ora('Your study has NOT been posted on Amazon Mechanical Turk').warn();
      throw err;
    }
    try {
      await updateStudyHistory(studyName, {
        HITId: createHITCommandOutput.HIT.HITId,
      });
    } catch (err) {
      throw err;
    }
  }
}

async function mturkPrepareHTML(
  studyName,
  deploySite,
  config,
  firebaseConfig,
  options
) {
  let HTMLQuestion;
  if (options.compensation) {
    const mturkLayoutURL = new URL(
      '../config/layout/mturk-layout-compensation.html',
      import.meta.url
    );
    let spinner = ora(
      `Reading compensation HIT layout template ${fileURLToPath(
        mturkLayoutURL
      )}`
    ).start();
    try {
      HTMLQuestion = await readFile(mturkLayoutURL, 'utf8');
      spinner.succeed();
    } catch (err) {
      spinner.fail();
      throw err;
    }
  } else {
    const mturkLayoutURL = new URL(
      '../config/layout/mturk-layout.html',
      import.meta.url
    );
    const mturkLayoutPath = fileURLToPath(mturkLayoutURL);
    // 1. Overwrite JavaScript variables
    let timestampComment = '// ' + new Date();
    let replaceOptions = {
      files: mturkLayoutPath,
      from: [/^.*expName = .*$/m, /^.*taskURL = .*$/m, /^.*databaseURL = .*$/m],
      to: [
        `        const expName = '${studyName}'; ${timestampComment}`,
        `        const taskURL = '${deploySite}'; ${timestampComment}`,
        `        const databaseURL = '${firebaseConfig.databaseURL}'; ${timestampComment}`,
      ],
    };

    let spinner = ora(
      `Replacing critical variables in HIT layout template ${mturkLayoutPath}`
    ).start();
    try {
      await replace(replaceOptions);
      spinner.succeed();
    } catch (err) {
      spinner.fail();
      throw err;
    }

    // 2. Modify the DOM
    let dom;
    spinner = ora('Reading HIT layout template into JSDOM').start();
    try {
      dom = await jsdom.JSDOM.fromFile(mturkLayoutPath);
      spinner.succeed();
    } catch (err) {
      spinner.fail();
      throw err;
    }
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
  let spinner = ora('Minifying updated HTML layout file').start();
  try {
    HTMLQuestion = await minify(HTMLQuestion, {
      collapseWhitespace: true,
      removeComments: true,
      minifyJS: true,
    });
    spinner.succeed();
  } catch (err) {
    spinner.fail();
    throw err;
  }

  // 3. Prepend/append the required XML for an HTMLQuestion object (see MTurk API docs)
  let beginXmlTags =
    '<HTMLQuestion xmlns="http://mechanicalturk.amazonaws.com/AWSMechanicalTurkDataSchemas/2011-11-11/HTMLQuestion.xsd"> <HTMLContent><![CDATA[';
  let endXmlTags =
    ']]> </HTMLContent> <FrameHeight>0</FrameHeight> </HTMLQuestion>';
  HTMLQuestion = beginXmlTags + HTMLQuestion + endXmlTags;

  return HTMLQuestion;
}

async function mturkPrepareQualifications(client, studyName, config, options) {
  let QualificationRequirements = [];

  if (options.compensation || studyName === 'compensation') {
    let studyConfigURL = new URL(
      '../experiments/compensation/study-config.js',
      import.meta.url
    );
    let studyConfigPath = fileURLToPath(studyConfigURL);
    if (
      !config.workersToCompensate ||
      config.workersToCompensate.length === 0
    ) {
      ora(`Specify workersToCompensate in ${studyConfigPath}`).fail();
      process.exit(1);
    }
    const req = new CreateQualificationTypeCommand({
      Name: `Compensation ${dateStringYMDHMS()}`,
      Description: `Qualification for a compensation HIT for the following worker(s): ${config.workersToCompensate}`,
      Keywords: `compensation, ${config.workersToCompensate.join(', ')}`,
      QualificationTypeStatus: 'Active',
    });
    let qid;
    let spinner = ora(`Creating qualification for Compensation HIT`).start();
    try {
      let res = await client.send(req);
      qid = res.QualificationType.QualificationTypeId;
      spinner.succeed();
    } catch (err) {
      spinner.fail();
      throw err;
    }

    // Assign to the workers
    for (let wkr of config.workersToCompensate) {
      const req = new AssociateQualificationWithWorkerCommand({
        QualificationTypeId: qid,
        WorkerId: wkr,
        SendNotification: true, // let them know
        IntegerValue: 1,
      });
      let spinner = ora(`Assigning qualification ${qid} to ${wkr}`).start();
      try {
        await client.send(req);
        spinner.succeed();
      } catch (err) {
        spinner.fail();
        throw err;
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

  let studyConsentQID = await mturkGetQualificationByName(client, studyName);
  if (!studyConsentQID) {
    ora('No qualification exists for this study.').info();
    const req = new CreateQualificationTypeCommand({
      Name: studyName,
      Description: `Assigned to workers who consent to participate in study '${studyName}'`,
      Keywords: ['ouvrai', 'consent', ...(config.mturk?.keywords || '')].join(
        ', '
      ),
      QualificationTypeStatus: 'Active',
    });
    let spinner = ora(`Creating qualification for '${studyName}'`).start();
    try {
      let res = await client.send(req);
      studyConsentQID = res.QualificationType.QualificationTypeId;
      spinner.succeed();
    } catch (err) {
      spinner.fail();
      throw err;
    }
  }

  QualificationRequirements.push({
    Comparator: 'DoesNotExist',
    QualificationTypeId: studyConsentQID,
    ActionsGuarded: 'DiscoverPreviewAndAccept',
  });

  // TODO: implement studyBlocklist and studyAllowlist
  // if (
  //   (!config.mturk?.qualificationBlocklist ||
  //     config.mturk?.qualificationBlocklist?.length === 0) &&
  //   (!config.mturk?.qualificationAllowlist ||
  //     config.mturk?.qualificationAllowlist?.length === 0)
  // ) {
  //   ora(
  //     'Tip: To block participants who completed specific past studies, use the studyBlocklist parameter of study-config.js. ' +
  //       'To allow only those who have completed specific past studies, use the studyAllowlist parameter.'
  //   ).info();
  // }

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
  studyName,
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
    RequesterAnnotation: studyName,
    QualificationRequirements: qualificationRequirements,
    UniqueRequestToken: `${studyName}_${batchLabel}`,
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
  let text = query ? `with query string "${query}"` : '';
  let spinner = ora(
    `Retriving qualifications from Amazon Mechanical Turk ${text}`
  ).start();
  try {
    let res = await client.send(command);
    spinner.succeed();
    return res;
  } catch (err) {
    spinner.fail();
    throw err;
  }
}

export async function mturkGetQualificationByName(client, name) {
  let res;
  try {
    res = await mturkListQualifications(client, name);
  } catch (err) {
    throw err;
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

export async function firebaseClient() {
  // firebase-tools should be installed globally, temporarily add global root to NODE_PATH and require
  // See https://github.com/firebase/firebase-tools#using-as-a-module
  let spinner = ora(
    'Creating Firebase client from global firebase-tools'
  ).start();
  let root = await new Promise((resolve, reject) => {
    exec('npm root -g', (error, stdout, stderr) => {
      if (error) {
        spinner.fail(stderr);
        throw error;
      } else {
        resolve(stdout);
      }
    });
  });
  const require = createRequire(import.meta.url);
  const client = require(join(root.toString().trim(), 'firebase-tools'));
  spinner.succeed();
  return client;
}

export async function firebaseChooseProject(
  client,
  promptMessage = 'You have multiple Firebase projects. Which would you like to use?'
) {
  let projects;
  let projectId;
  let spinner = ora('Retrieving list of projects from Firebase').start();
  try {
    projects = await client.projects.list();
    spinner.succeed();
  } catch (err) {
    spinner.fail();
    throw err;
  }
  projects = projects.map((x) => x.projectId);
  if (projects.length === 0) {
    ora(
      `You must create a Firebase project at https://console.firebase.google.com`
    ).fail();
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
  promptMessage = 'You have multiple Firebase Hosting sites. Which would you like to use?',
  defaultSite
) {
  let sites;
  let spinner = ora(
    `Retrieving Hosting sites for project '${projectId}' from Firebase`
  ).start();
  try {
    sites = await client.hosting.sites.list({ project: projectId });
    spinner.succeed();
  } catch (err) {
    spinner.fail();
    throw err;
  }
  sites = sites.sites.map((x) => x.name.split('/').slice(-1)[0]);
  let siteName;
  if (sites.length === 1) {
    siteName = sites[0];
    ora(`Using the default Hosting site for this project: https://${siteName}.web.app \
    \n\tTo choose from additional Hosting sites, create more sites in the Firebase console.`).info();
  } else if (sites.length > 1) {
    let answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'siteName',
        message: promptMessage,
        choices: sites,
        default: defaultSite,
      },
    ]);
    siteName = answers.siteName;
  }
  return siteName;
}

export async function firebaseGetData(
  refString,
  projectId,
  shallow = false,
  orderBy,
  startAt
) {
  if (refString.slice(0, 1) !== '/') {
    throw new Error('refString path must begin with /');
  }
  let str = '';
  let args = [refString, '--project', projectId];
  if (shallow) {
    args.push('--shallow');
  }
  if (orderBy) {
    args.push('--order-by', orderBy);
  }
  if (startAt) {
    args.push('--start-at', startAt);
  }
  args = [quote(args)];

  // let proc = spawn('firebase database:get', args, { shell: true });
  // proc.stdout.on('data', (data) => {
  //   str += data;
  // });

  // return new Promise((resolve) =>
  //   proc.on('close', () => resolve(JSON.parse(str)))
  // );

  return new Promise((resolve, reject) => {
    exec('firebase database:get ' + args, (error, stdout, stderr) => {
      if (error) {
        console.log(stderr);
        throw error;
      } else {
        resolve(JSON.parse(stdout));
      }
    });
  });
}

/*********
 * Study Management Utilities */

/**
 *
 * @param {string} studyName
 * @param {object} studyInfo
 * @returns
 */
export async function updateStudyHistory(studyName, studyInfo) {
  // Read
  let studyHistoryJSON;
  try {
    studyHistoryJSON = await getStudyHistory(studyName);
  } catch (err) {
    throw err;
  }
  if (studyHistoryJSON === undefined) {
    ora('Initializing new study history.').info();
    studyHistoryJSON = {};
  }

  for (let [key, value] of Object.entries(studyInfo)) {
    // Update
    if (
      !Object.keys(studyHistoryJSON).includes(key) ||
      !Array.isArray(studyHistoryJSON[key])
    ) {
      ora(`Initializing new history array for study parameter '${key}'`).info();
      studyHistoryJSON[key] = [];
    }
    studyHistoryJSON[key].push(value);
  }
  // Write
  let studyHistoryURL = new URL(
    `../experiments/${studyName}/study-history.json`,
    import.meta.url
  );
  let spinner = ora(`Writing to ${fileURLToPath(studyHistoryURL)}`).start();
  try {
    await writeFile(studyHistoryURL, JSON.stringify(studyHistoryJSON, null, 2));
    spinner.succeed();
  } catch (err) {
    spinner.fail();
    throw err;
  }
}

export async function getStudyHistory(studyName) {
  let studyHistoryJSON;
  let studyHistoryURL = new URL(
    `../experiments/${studyName}/study-history.json`,
    import.meta.url
  );
  let studyHistoryPath = fileURLToPath(studyHistoryURL);
  let spinner = ora(`Reading study history from ${studyHistoryPath}`).start();
  // Read
  if (await exists(studyHistoryURL)) {
    try {
      studyHistoryJSON = await readJSON(studyHistoryURL);
      spinner.succeed();
    } catch (err) {
      spinner.fail();
      throw err;
    }
  } else {
    spinner.warn(`Study history not found at ${studyHistoryPath}`);
  }
  return studyHistoryJSON;
}

export async function getLatestDeploySite(studyName) {
  let history = await getStudyHistory(studyName);
  if (history === undefined) {
    ora('Failed to retrieve deploy site from study history').warn();
    return;
  } else {
    let latestURL = `https://${history.siteId.slice(-1)}.web.app`;
    return latestURL;
  }
}

export async function getLatestDeployProject(studyName) {
  let history = await getStudyHistory(studyName);
  if (history === undefined) {
    ora('Failed to retrieve project ID from study history').warn();
    return;
  }
  let latestProject = history.projectId?.slice(-1)[0];
  return latestProject;
}

export async function getStudyConfig(studyName) {
  const configURL = new URL(
    `../experiments/${studyName}/study-config.js`,
    import.meta.url
  );
  const configPath = fileURLToPath(configURL);
  let spinner = ora(`Reading study configuration from ${configURL}`).start();
  try {
    let config = await import(configURL);
    config = config.default;
    spinner.succeed();
    return config;
  } catch (err) {
    throw err;
  }
}

export async function exists(path) {
  try {
    await access(path);
    return true;
  } catch (err) {
    return false;
  }
}
