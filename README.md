# Ouvrai

> Streamlined study development with [Vite](https://vitejs.dev)  
> Free cloud database and web hosting with [Firebase](https://firebase.google.com)  
> Crowdsourced recruitment with [Prolific](https://www.prolific.co) or [MTurk](https://www.mturk.com)

# Getting started

## Prerequisites

1. Install [git](https://git-scm.com), [Java](https://www.oracle.com/java/technologies/downloads), and a [Node.js version manager](#nodejs).
2. Create a Google [Firebase](https://console.firebase.google.com/) account and a new project.
3. Create a [Prolific Researcher](https://app.prolific.co/register/researcher) account and/or [AWS and MTurk Requester](https://docs.aws.amazon.com/AWSMechTurk/latest/AWSMechanicalTurkGettingStartedGuide/SetUp.html) accounts.

## Installation and one-time setup

```
git clone https://www.github.com/evancesanek/ouvrai
cd ouvrai
npm i -g firebase-tools # install firebase globally
firebase login # log in to your firebase account
npm i -g # install ouvrai globally
npm i # install ouvrai and dependencies locally
ouvrai setup # one-time setup, follow the prompts
```

## Development

```
ouvrai new-experiment studyname # new experiment from minimal template
ouvrai dev studyname # start development server
```

- Open [localhost:5173](localhost:5173) in your browser to try out the experiment.
- Open [localhost:4001](localhost:4001) to inspect the Firebase emulators.
- Edit the experiment file (_`ouvrai/experiments/studyname/index.js`_) in your favorite editor.
  - Changes are immediately reflected at [localhost:5173](localhost:5173).

### Create production build

```
ouvrai build studyname # tree-shaking, bundling, minifying
ouvrai deploy studyname # deploy production build to firebase hosting
```

## Recruiting participants

We recommend using Prolific for crowdsourced recruitment. Before posting, review study settings in _`ouvrai/experiments/studyname/study-config.js`_. Before publishing, Review draft studies and set additional configuration options (e.g., screeners) on the Prolific web interface. The Prolific web interface is also great for monitoring and managing published studies.

```
ouvrai draft-study studyname -p # create unpublished draft study on Prolific
ouvrai post-study studyname -p # publish the draft study on Prolific
```

If you prefer to use MTurk:

```
ouvrai draft-study studyname -m # post draft study on MTurk Sandbox
ouvrai post-study studyname -m # post study publicly on MTurk
```

## Monitor and manage studies

You can also monitor in-progress studies using the Ouvrai dashboard: `ouvrai launch-dashboard`. Open [localhost:5174](localhost:5174) in your web browser.

# Troubleshooting

## git

- You can check that you have git installed by running `git --version`. If not, get it from https://git-scm.com.

## Node.js

- Install [nvm](https://github.com/nvm-sh/nvm) (Linux and Mac, use `curl`) or [nvm-windows](https://github.com/coreybutler/nvm-windows) (Windows, use provided installer).
- Restart shell and install Node.js: `nvm install node`

## Firebase

Sign up and create a new project [here](https://console.firebase.google.com/). Try to choose a unique project name so Firebase doesn't add random characters to the ID.

- To deploy different experiments at the same time, you need to create additional Hosting sites. From the web interface:
  - Build → Hosting → Scroll to bottom → Add another site → choose site name.
  - Firebase allows up to 36 different Hosting sites to be created within a project.
- Advanced users may want to use the Firebase Admin SDK in server-side code. This requires you to download your project credentials.
  - Gear icon → Project settings → Service accounts → Create service account → Generate new private key
  - Rename and move the downloaded file to:
    - Linux/Mac: _`~/.firebase/credentials.json`_
    - Windows: _`C:\Users\%USERNAME%\.firebase\credentials.json`_

## Prolific

- Create a new Prolific researcher account [here](https://app.prolific.co/register/researcher).
- Workspaces → Settings → Go to API token page → Create API token
- Copy the generated token (just a long string of characters) into a plain text file at:
- Linux/Mac: _`~/.prolific/credentials.txt`_
- Windows: _`C:\Users\%USERNAME%\.prolific\credentials.txt`_
- **Note**: CLI integration with the Prolific API is in development. See **weblab** functions that start with **`p-`** (e.g, `p-get-submissions`). The Prolific API is incomplete and must still be used for some operations.

## AWS & MTurk

- Create an AWS account and an MTurk account, link the accounts, and obtain your security credentials. Detailed instructions [here](https://docs.aws.amazon.com/AWSMechTurk/latest/AWSMechanicalTurkGettingStartedGuide/SetUp.html).
- Insert your credentials into a plain text file named _`credentials`_ (no extension). Move this file to:
  - Linux/Mac: _`~/.aws/credentials`_
  - Windows: _`C:\Users\%USERNAME%\.aws\credentials`_
- The contents should look like this:
  ```
  [default]
  aws_access_key_id = AKIAIOSFODNN7EXAMPLE
  aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
  ```

## Autocompletion

Tab-autocomplete is available for ouvrai command line interface on Mac and Linux. To enable, run `ouvrai install-completion`.

- If you use zsh (default shell for MacOS), add `autoload -Uz compinit && compinit` to _`~/.zshrc`_ to get tab-completions working.
- If you use bash on a Mac, add `source ~/.bashrc` to _`~/.bash_profile`_ if it is not already there. More info [here](https://scriptingosx.com/2017/04/about-bash_profile-and-bashrc-on-macos/).

## Firebase Emulator Suite

During development, you typically do not want to write data to your actual database, which would lead to unnecessary clutter. Therefore we use the [Firebase Emulator Suite](https://firebase.google.com/docs/emulator-suite) during development.

- If you encounter an error like `Error: Could not start Database Emulator, port taken`, you may need to shut down other processes on port 9000 with `lsof -nti :9000 | xargs kill -9` or modify the Database Emulator port in _`experiments/studyname/firebase.json`_.
- When testing experiments during development, you can open `localhost:4001/database` in your browser and inspect the data that is written to the emulated database during a test run.
- When you're finished, shut down the development server and the Emulator Suite with control+c (Mac), or by closing the terminals.

# Tutorials

Click to expand:

<details>
  <summary>
    <b>Post a Compensation HIT on MTurk</b>
  </summary>
  On MTurk, a Compensation HIT can be used to pay workers who worked on your study but could not submit the original HIT for some reason (e.g., bug or timeout). Here we explain how to create, submit, approve, and delete a Compensation HIT in the <a target="_blank" rel="noopener noreferrer" href="https://requester.mturk.com/developer/sandbox">MTurk Sandbox</a>. 
  <ol>
    <li> Sign in to <a href="https://workersandbox.mturk.com">workersandbox.mturk.com</a>. Copy your worker ID by clicking on it in the top-left.  </li>
    <li> Open <i><code>ouvrai/experiments/compensation/mturk-config.mjs</code></i> in your preferred editor. Find the <code>workersToCompensate</code> field, which should contain an array of worker IDs. Paste in your worker ID to replace the existing ID and save this file.  </li>
    <li> Run <code>ouvrai draft-study -m compensation</code>. Remember <code>draft-study -m</code> will post to the MTurk Sandbox, whereas <code> post-study -m</code> will post publicly to real MTurk workers.
    <li> The console output will include a link to your HIT (it may take a few moments to work as the HIT is created). Open this link, accept the HIT, and click the Submit button.</li>
    <li> Run <code>ouvrai launch-dashboard</code> to launch the dashboard app at <a href="localhost:5174">localhost:5174</a>. From here, click the MTurk Sandbox tab, and you will see all of your existing MTurk Sandbox HITs. At the top of the HITs section, you should see the Compensation HIT you just created. In the Assignments section below, you can view and approve or reject any submissions that have been received for this HIT, and you can also send bonus payments. When you are 100% done with a HIT, you can delete it from the HITs section. If there are still available assignments, you will have to Expire the HIT first, wait for any pending assignments to be submitted or returned, and then you can delete it.</li>
    <li>Warning: When you delete a HIT, you lose any demographic information submitted by the participant, and you can no longer pay them a bonus. HITs that have been inactive for 120 days are automatically deleted by MTurk.</li>
  </ol>
</details>
<br/>

### More tutorials coming soon...

# Experiments

Each experiment is a stand-alone JavaScript web app located in its own subdirectory under _`ouvrai/experiments/`_, and with its own _`package.json`_ separate from the main **Ouvrai** package. Running `ouvrai new-experiment studyname` will initialize a new study in this location, with all of the necessary config files.

**Ouvrai** was developed for research on human sensorimotor control, so the template experiments are designed to support interactivity with the mouse/trackpad or VR devices.

- **Ouvrai** depends on [three.js](www.threejs.org) for hardware-accelerated graphics and VR support. The three.js [docs](https://threejs.org/docs/), [examples](https://threejs.org/examples/#webgl_animation_keyframes), and [manual](https://threejs.org/manual/#en/fundamentals) are great resources if you want to learn more about how to use three.js to build great experiments.

## Consent

**Always replace the placeholder `studyname/src/static/consent.pdf` with your own consent form!**

- For VR studies, include a **.jpg image** of the consent form, due to current limitations on displaying pdf files in some VR web browsers.

## Structure

- _`ouvrai/lib/components/`_ contains the **Ouvrai** component library. These components are imported in _`src/index.js`_ to help manage the various processes of a well-functioning experiment. The `Experiment` component is the most important. You must create an instance of the Experiment component with `const exp = new Experiment({...})` as the first step in all experiments. The constructor takes a single argument, which is an object where many configuration options and experiment settings should be specified. See the template experiments for examples.
- The _`src/`_ folder contains all the source code and other assets needed for an experiment.

  - `src/index.js` is the main experiment code that you would edit for a new experiment.
  - `src/static/` is a static assets folder. Any files you add here will be available for reference by filename in your experiment code.

## Configuration

You should get familiar with the various fields in the `study-config.js` file, which is required for each experiment. These fields control how a study appears to participants on Prolific or MTurk (Title, Requirements, Summary, Instructions) and how it behaves (Reward, Total Available Places, Completion Time, Allowlist/Blocklist, etc).
