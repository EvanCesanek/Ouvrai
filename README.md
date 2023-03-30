# Ouvrai

> Streamlined study development with [Vite](https://vitejs.dev)  
> Free cloud database and web hosting with [Firebase](https://firebase.google.com)  
> Crowdsourced recruitment with [Prolific](https://www.prolific.co) or [MTurk](https://www.mturk.com)

# Getting started

## Prerequisites

1. Install [git](https://git-scm.com), [Java](https://www.oracle.com/java/technologies/downloads), and a [Node.js version manager with Node.js 18](#node-version-manager-nvm-and-nodejs-node).<br/>Make sure `node -v` displays `v18.15.0` (minor version may vary).
2. Create a [Google Firebase](https://console.firebase.google.com/) account and a new project.<br>Choose a descriptive name for your project and Ouvrai will handle the rest of the setup.
3. To recruit participants, you'll need a [Prolific Researcher](https://app.prolific.co/register/researcher) account and/or [AWS and MTurk Requester](https://docs.aws.amazon.com/AWSMechTurk/latest/AWSMechanicalTurkGettingStartedGuide/SetUp.html) accounts.

## Installation and one-time setup

Open a new shell (Terminal) and run the following commands:

```
# Install Firebase CLI and log in (ignore warnings about deprecated package versions)
npm i -g firebase-tools
firebase login --reauth

# Download and install Ouvrai CLI + package
# This will create the /ouvrai directory under your current directory
git clone https://www.github.com/evancesanek/ouvrai
cd ouvrai
npm i -g
npm i

# One-time setup, press Enter at all prompts to accept defaults
ouvrai setup
```

## Creating and developing a study

```
# <studyname> will be the name of your study; you choose this
# <templatename> must be a subdirectory of /ouvrai/templates (e.g., cursor)

ouvrai new <studyname> <templatename> # Create new experiment from template

ouvrai dev <studyname> # Start development servers (Vite & Firebase Emulator Suite)

# To end session, press control+c (Windows users close the Java window as well)
```

- This should automatically open [localhost:5173](http://localhost:5173) in your web browser, where you can test your experiment. It may take a moment for the page to load as the Firebase emulators start up, especially the very first time. You may get a warning message asking you to refresh the browser window.
- To inspect the Firebase emulators during testing, go to <a href="http://localhost:4001" target="_blank">localhost:4001</a>. In the Authentication Emulator, you can see the Firebase UIDs, created each time you complete the consent form. In the Realtime Database Emulator, you can explore the data your study is saving. All other emulators should be off.
- At any time you can download the data from your current run by pressing **shift+s**.
- Design your experiment!
  - Edit the experiment file (_`ouvrai/experiments/<studyname>/src/index.js`_) in [Visual Studio Code](https://code.visualstudio.com/) (or your favorite IDE).
  - Saved changes are immediately reflected at [localhost:5173](http://localhost:5173).
- See the [develop for VR](#develop-for-vr) section for information on how to develop VR experiments.

### Create production build

```
ouvrai build <studyname> # Build for production: tree-shaking, bundling, minifying
ouvrai deploy <studyname> # Deploy production build to Firebase Hosting
```

### Analysis

- In dev mode, you can press **shift+s** to download the data from your current study run. This will save a JSON file to your Downloads folder.
- After you run a full pilot of your study on your Hosting site, or if you collect real participant data, you can download data with `ouvrai download <studyname>`. This will save a JSON file to _`ouvrai/experiments/<studyname>/analysis`_.
- Run `ouvrai wrangle <studyname> -f <format>` (where `<format>` can be 'pkl', 'csv', or 'xls') to wrangle the JSON file into a set of tidy data tables. See [Data analysis](#data-analysis) for more details.

## Recruiting participants

We recommend using Prolific for crowdsourced recruitment. Before posting, review study settings in _`ouvrai/experiments/studyname/study-config.js`_. Before publishing, review draft studies and set additional configuration options (e.g., screeners) on the Prolific web interface.

```
ouvrai draft <studyname> -p # Create unpublished draft study on Prolific
ouvrai post <studyname> -p # Publish the draft study on Prolific
```

If you prefer to use MTurk:

```
ouvrai draft studyname -m # Post draft study on MTurk Sandbox
ouvrai post studyname -m # Post study publicly on MTurk
```

## Monitor and manage studies

### **Note: Ouvrai Dashboard is still under development.**

You can monitor and manage your studies by opening the Ouvrai
Dashboard with `ouvrai launch`. This should open [localhost:5174](http://localhost:5174) in your web browser. This is the best way to manage MTurk studies. For Prolific users, we recommend relying primarily on the Prolific web interface.

# Troubleshooting

## git

- You can check that you have git installed by running `git --version`. If not, get it from https://git-scm.com.

## Java

- The Firebase Emulators depend on Java JDK version 11+. Check your installation with `java --version` and get the latest from https://www.oracle.com/java/technologies/downloads.

## Node Version Manager (nvm) and Node.js (node)

- Windows: Install [nvm-windows](https://github.com/coreybutler/nvm-windows) using the provided installer.
- Linux and Mac: Install [nvm](https://github.com/nvm-sh/nvm) with `curl`
  ```
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.3/install.sh | bash
  ```
  This installation process should not take very long. If it does (with lots of c++ compiling), kill the process (control+c) and try again.
- Open a new terminal and install Node.js 18 (LTS/Hydrogen) with:
  ```
  nvm install 18
  nvm use 18
  ```

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

Create a new Prolific researcher account [here](https://app.prolific.co/register/researcher).

Ouvrai uses the Prolific API to communicate with Prolific, so you will need to store your API Token locally to use these features.

- Workspaces → Settings → Go to API token page → Create API token
- Copy the generated token (long string of characters) into a plain text file at:
  - Linux/Mac: _`~/.prolific/credentials.txt`_
  - Windows: _`C:\Users\%USERNAME%\.prolific\credentials.txt`_

**Note**: The Prolific web interface must be used for some operations that are unavailable in Ouvrai, such as choosing specific screeners and adding funds to your account.

## AWS & MTurk

Create an AWS account and an MTurk Requester account, link the accounts, and obtain your security credentials. Detailed instructions [here](https://docs.aws.amazon.com/AWSMechTurk/latest/AWSMechanicalTurkGettingStartedGuide/SetUp.html).

- Insert your credentials into a plain text file named _`credentials`_ (no extension). Move this file to:
  - Linux/Mac: _`~/.aws/credentials`_
  - Windows: _`C:\Users\%USERNAME%\.aws\credentials`_
- The contents should look like this:
  ```
  [default]
  aws_access_key_id = AKIAIOSFODNN7EXAMPLE
  aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
  ```

You should also create [Requester Sandbox](https://requestersandbox.mturk.com) and [Worker Sandbox](https://workersandbox.mturk.com) accounts, and link the Requester Sandbox account to your AWS account. Detailed instructions [here](https://docs.aws.amazon.com/AWSMechTurk/latest/AWSMechanicalTurkRequester/SetUpMturk.html#set-up-sandbox). In the Sandbox, you can post studies as a Requester and see what they look like to a Worker, before posting them publicly. See `ouvrai draft`.

## Autocompletion

Tab-autocomplete is available for ouvrai command line interface on Mac and Linux. To enable, run `ouvrai install-completion`.

- If you use zsh (default shell for MacOS), add `autoload -Uz compinit && compinit` to _`~/.zshrc`_ to get tab-completions working.
- If you use bash on a Mac, add `source ~/.bashrc` to _`~/.bash_profile`_ if it is not already there. More info [here](https://scriptingosx.com/2017/04/about-bash_profile-and-bashrc-on-macos/).

## Firebase Emulator Suite

During development, you probably do not want to write data to your actual database, which would lead to unnecessary clutter. Therefore we use the [Firebase Emulator Suite](https://firebase.google.com/docs/emulator-suite) during development. The Authentication and Realtime Database Emulators are started automatically by the `ouvrai dev` command.

- If you encounter an error like `Error: Could not start Database Emulator, port taken`, you may need to shut down other processes on port 9000 with `npx kill-port 8000`. By default, the emulators run processes on ports 8000 (Database), 9099 (Auth), and 4001 (Emulator UI). If you normally run other processes on any of these ports, set different unused ports in _`experiments/studyname/firebase.json`_. You should also make these changes in _`config/template/firebase.json`_ so they will be applied to all new experiments.
- When testing experiments during development, you can open `localhost:4001/database` in your browser and inspect the data that is written to the emulated database during a test run.
- When you're finished, shut down the development server and the Emulator Suite with control+c (Mac), or by closing the terminal.

- If you are stuck on the **Warning: Not connected** screen during development and the command line shows the Emulator UI crashing with a fatal error, try deleting the cached Emulator files at: `~/.cache/firebase/emulators/` (~ is home directory).

## Develop for VR

Ouvrai makes it easy to develop VR studies on Meta Quest headsets! Before getting started you must:

1. [Sign up for a Meta Quest Developer account](https://developer.oculus.com/sign-up/)

2. [Create an organization from your dashboard](https://developer.oculus.com/manage/organizations/create/)

### Tethered development

1. Enable developer mode for your Quest using the companion app on your phone.
2. Connect the headset to the development computer via USB-C. Put on the headset and allow the connection.
3. In Google Chrome, go to [chrome://inspect](chrome://inspect). **You must leave this tab open while you develop!**

   If you do not see your device listed under Remote Target, untick then retick the _Discover USB devices_ checkbox. You may also try repeating step 2. You may also check whether USB connections are enabled in the headset at Settings > System > Developer.

   Click the button that says _Port forwarding..._. In the popup, tick the checkbox next to _Enable port forwarding_. Add the following ports:

   | Port | IP address and port |
   | ---- | ------------------- |
   | 5173 | localhost:5173      |
   | 8000 | localhost:8000      |
   | 9099 | localhost:9099      |

4. Create a VR experiment from one of the templates (vr-sr, vr-dual, or vr-gen) and start the development servers:
   ```
   ouvrai new <studyname> <templatename>
   ouvrai dev <studyname>
   ```
5. In the headset, open the browser and navigate to [http://localhost:5173](http://localhost:5173). If the page does not load, make sure that [chrome://inspect]() is still open on the development computer.

   Note: From [chrome://inspect](), click [Inspect]() under the entry for [localhost:5173]() to access the Chrome DevTools, which are helpful for debugging (_e.g._, viewing console logs and error messages)

### Untethered development

If you have tethered development working, you can try ditching the cable!

1. Start with your headset plugged in to your computer via USB-C.
2. Download and sign in to [Meta Quest Developer Hub](https://developer.oculus.com/meta-quest-developer-hub/). Make sure you see your headset in Devices. Reconnect it if you do not.

- **If you are asked about the ADB Path, click Cancel to continue using the version of ADB that is included with Developer Hub.**

3. In the Device options, enable "ADB over Wi-fi". This may cause your Device to become disconnected. Look in your headset for a new connection prompt and accept. Your device should reappear.
4. In the Custom Commands section, click the three dots on the far right. Click 'Import commands'. In the file system prompt, navigate to _`/ouvrai/config`_ and select _`mqdh-port-forwarding.json`_. Click 'Run' next to the newly created command.
5. See steps 4 & 5 above. Just like with tethered development, you can view the Chrome DevTools from [chrome://inspect]().

# Tutorials

Click to expand:

<details>
  <summary>
    <b>Post a Compensation HIT on MTurk</b>
  </summary>
  On MTurk, a Compensation HIT can be used to pay workers who worked on your study but could not submit the original HIT for some reason (e.g., bug or timeout). Here we explain how to create, submit, approve, and delete a Compensation HIT in the <a target="_blank" rel="noopener noreferrer" href="https://requester.mturk.com/developer/sandbox">MTurk Sandbox</a>. 
  <ol>
    <li>Sign in to <a href="https://workersandbox.mturk.com">workersandbox.mturk.com</a>. Copy your worker ID by clicking on it in the top-left.  </li>
    <li>Open <i><code>ouvrai/experiments/compensation/study-config.js</code></i> in VS Code. Find the <code>workersToCompensate</code> field. This field should contain an array of the worker IDs you wish to compensate. To test it, paste your own worker ID into the array and save the file.  </li>
    <li>Run <code>ouvrai draft -m compensation</code>. Remember <code>ouvrai draft -m</code> will post to the MTurk Sandbox, whereas <code>ouvrai post -m</code> will post publicly to real MTurk workers.
    <li>The console output will include a link to your HIT (it may take a moment as the HIT is created). Open this link, accept the HIT, and click the Submit button.</li>
    <li>Run <code>ouvrai launch</code> to launch the dashboard app at <a href="http://localhost:5174">localhost:5174</a>. From here, click the MTurk Sandbox tab and you will see all of your existing MTurk Sandbox HITs. At the top of the HITs section, you should see the Compensation HIT you just created. In the Assignments section below, you can view and approve or reject any submissions that have been received for this HIT, and you can also send bonus payments. When you are 100% done with a HIT, you can delete it from the HITs section. If there are still available assignments, you will have to Expire the HIT first, wait for any pending assignments to be submitted or returned, and then you can delete it.</li>
    <li>Warning: When you delete a HIT, you will lose any demographic information submitted through the MTurk HIT form and you can no longer pay them a bonus. HITs that have been inactive for 120 days are automatically deleted by MTurk.</li>
  </ol>
</details>
<br/>

### More tutorials coming soon...

# Experiments

Each experiment is a stand-alone JavaScript web app located in its own subdirectory under _`ouvrai/experiments/`_, and with its own _`package.json`_ separate from the main Ouvrai package. Running `ouvrai new <studyname> <templatename>` will initialize a new study in this location from one of the template experiment, copying the necessary Firebase configuration files from _`ouvrai/config/template`_.

Ouvrai was developed for research on human sensorimotor control, so the template experiments are designed to support interactivity with the mouse/trackpad or VR devices.

- Ouvrai depends on [three.js](www.threejs.org) for hardware-accelerated graphics and VR support. The three.js [docs](https://threejs.org/docs/), [examples](https://threejs.org/examples/#webgl_animation_keyframes), and [manual](https://threejs.org/manual/#en/fundamentals) are great resources if you want to learn more about how to use three.js to build great experiments.

## Consent

**Replace the placeholder consent forms located at `config/consent/consent.(pdf|jpg)` with your own IRB-approved consent form!**

- For VR studies, you must include a **.jpg image** of the consent form, due to current limitations on displaying pdf files in some VR web browsers. We recommend exporting a lightweight, lower-quality JPG (<250 KB) that is readable but quick to load.

## Structure

- _`ouvrai/lib/components/`_ contains the Ouvrai component library. These components help manage the various processes of a well-functioning experiment. The `Experiment` component is the most important. You must create an instance of the Experiment component with `const exp = new Experiment({...})` as the first step in all experiments. The constructor takes a single argument, which is an object with a wide variety of configuration options. You should also specify any experiment settings that you would like to save with your data (e.g., stimulus visual features, durations, condition codes, etc.). See the template experiments for examples.
- The _`src/`_ folder contains all the source code and other assets needed for an experiment.
  - _`src/index.js`_ is the main experiment code that you would edit for a new experiment.
  - _`src/public/`_ is a static assets folder. Any files in here are available for reference by filename in your experiment code.
  - Assets that are not located in _`src/public/`_ can be [imported as URLs](https://vitejs.dev/guide/assets.html).

## Configuration

Familiarize yourself with the various fields of _`study-config.js`_, which is a required file for each experiment. These fields control how your study appears to participants on Prolific or MTurk (Title, Requirements, Summary, Instructions) and how it behaves (Reward, Total Available Places, Completion Time, Allowlist/Blocklist, etc).

On Prolific, study configuration can be double-checked and, if needed, modified using the web interface after you create a draft study. However, on MTurk, whatever is in _`study-config.js`_ when you call `ouvrai draft -m` or `ouvrai post -m` will be reflected in the HIT and cannot be modified further.
