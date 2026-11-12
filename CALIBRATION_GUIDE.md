# BreezeEasy: test flexible blowing calibration

This change was prepared against main at 74db741007bf22be58b80dcb964297aaaab35ec7.
It uses JavaScript signal measurements, without an AI service, API key, recording, or audio upload.

## What changes

- Parent Settings has a Calibrate Blowing button. A separate dialog guides the user through Quiet Please (three seconds), Ready to Blow?, a 3–2–1 countdown, a six-second blowing progress bar, and Finished. Blowing Calibrated. Done closes the dialog.
- The person who will play should provide the blowing sample at their usual phone distance. An adult's breath may not match a child's.
- Both loudness and the high/low frequency ratio are learned. Sensitivity, a live level meter, microphone retry, and a test counter are inside the collapsed Advanced section.
- Settings are saved in localStorage for this browser and website address. A new phone, browser, or website address needs its own setup. Private browsing or cleared website data may remove saved settings.
- Successful setup replaces the previous profile. Failed/canceled setup keeps it. Restore default blowing settings removes the custom thresholds by saving defaults.
- Detection requires about 220 milliseconds of matching sound and a quiet release between blows. Timing uses elapsed milliseconds instead of frame counts.
- Microphone permission failures can be retried. Browser audio processing is requested with noise suppression and automatic gain control off, but browsers/devices may handle constraints differently.
- The app ignores microphone triggers while its spoken feedback is playing.
- This is an adjustable sound detector, not a reliable speech-versus-breath classifier. Test talking, fans, and other real sounds on the actual phone.

## 1. Open your existing project on your Mac

1. Open VS Code.
2. Choose File > Open Folder and select your existing BreezeEasy folder. Open the folder that contains index.html, css, js, and images.
3. Choose Terminal > New Terminal. Run each command below in that terminal, pressing Return after each one.

```bash
pwd
git status
git remote -v
```

Confirm that the remote points to cthelittlefrog/BreezeEasy and that the working tree is clean.
If there are existing changes, preserve/review them before proceeding. Do not discard them or apply this patch over unrelated edits.

If you do not have a local checkout, use VS Code's Command Palette > Git: Clone, paste https://github.com/cthelittlefrog/BreezeEasy.git, choose a parent folder, and open the cloned project. Then open its terminal and run the checks above.

## 2. Create the branch on YOUR Mac

A branch was prepared in the assistant's separate checkout. These commands create the corresponding branch in your own checkout; nothing has been pushed for you.

```bash
git switch main
git pull --ff-only
git switch -c feature/blow-calibration
git branch --show-current
```

The last command should print feature/blow-calibration. The VS Code lower-left branch indicator should show the same name.
If Git says this branch already exists, use git switch feature/blow-calibration, then inspect git status before continuing.
If pulling reports a conflict or divergence, resolve that before applying the patch; do not force-reset your checkout.

## 3. Apply the prepared code

Download BreezeEasy-blow-calibration.patch from the chat and keep its exact filename in Downloads.
This patch adds/replaces complete file changes, including the correct HTML script order; you do not need to paste fragments into old code.

First check whether it applies:

```bash
git apply --check ~/Downloads/BreezeEasy-blow-calibration.patch
```

Success normally prints nothing. If it reports an error, do not continue to the next command: your local files may differ from the reviewed version, or the download may have a different name. Keep the error for troubleshooting.

Then apply:

```bash
git apply ~/Downloads/BreezeEasy-blow-calibration.patch
git status --short
git diff --stat
```

Expected modified files: css/style.css, index.html, js/app.js, js/microphone.js.
Expected new files: js/blow-detection.js, js/calibration.js, tests/blow-detection.test.cjs, tests/calibration-integration.test.cjs, CALIBRATION_GUIDE.md.
New files may appear as an untracked directory in git status and will not appear in git diff until added. That is normal.

Use VS Code's Source Control icon to inspect each file. Clicking a changed file shows its before/after comparison.
The separate changed-files ZIP is a fallback reference. Do not replace your entire js folder with the ZIP's js folder: the ZIP contains changed files only and omits unchanged activity/character scripts.

## 4. Check locally

You do not need npm install or an API key. If Node is installed, run:

```bash
node --test tests/*.test.cjs
git diff --check
```

Expected: 22 passing tests and no whitespace errors. These tests use synthetic microphone samples and mocked browser APIs. They do not replace a real phone test.

To run the app on your Mac:

1. If VS Code already has Live Server, right-click index.html and choose Open with Live Server. Otherwise install the Live Server extension by Ritwick Dey from the Extensions panel, then repeat.
2. Allow microphone access when prompted. If macOS asks separately for browser microphone permission, allow that too.
3. Hold the cloud button for three seconds to open Parent Settings. Keyboard alternative: Tab to the cloud and press Enter.
4. Tap Calibrate Blowing. Allow microphone access if asked. Stay quiet while Quiet Please and the spinner are shown.
5. Have the person who will play get into position. Tap Ready to Blow?, wait for 3–2–1, then blow gently with pauses while the bar fills.
6. Wait for Finished. Blowing Calibrated, then tap Done. Open Advanced and blow to check the test counter without advancing a game.
7. In Advanced, move sensitivity right if gentle blows are missed, or left if other sounds trigger it. The live microphone level shows all sound, not just detected blowing.
8. Close Settings and play Bubbles, then Racecar. Return to the menu and open Bubbles again.

Do not double-click index.html in Finder to run it as a file:// page. Use a local server.

## 5. Test on your actual phone before committing

The new phone is the reason for this change, so this is the important acceptance check.
A plain http://192.168... Live Server address on your phone generally cannot use the microphone: it needs a secure context. Localhost on the Mac is an exception, not a phone-accessible address.

One simple route is a separate temporary Netlify Drop site. This publishes a copy of the app at a new public URL without changing your current BreezeEasy site or committing code. If you already have an HTTPS preview workflow, use that instead.

From the BreezeEasy terminal, make a clean upload folder containing only the website files:

```bash
mkdir -p ../BreezeEasy-phone-test
cp -R index.html css js images ../BreezeEasy-phone-test/
open ../BreezeEasy-phone-test
```

1. In your Mac browser, open https://app.netlify.com/drop.
2. Drop the BreezeEasy-phone-test folder into its upload area. Use a new standalone test site, rather than replacing an existing site.
3. Wait for the published HTTPS link. Send/open that link on your phone in its normal browser and allow microphone access.
4. Calibrate on the phone using the steps above. The Mac's calibration is intentionally separate.
5. Test the checklist below. If you edit code, repeat the copy command and upload the updated folder to the same test site's deploy area so you can test the changes.

Phone acceptance checklist:

- Gentle blows register while normal silence does not.
- A single long breath produces one detection; another breath after a pause produces another.
- Talking, a clap, and typical room noise do not cause unacceptable false triggers. If they do, reduce sensitivity or recalibrate in a quieter room. Sound-only detection cannot guarantee rejection of every non-breath sound.
- Settings tests never fill the activity meter.
- Complete Bubbles, let it return to the menu, and play Bubbles a second time.
- Back out of Bubbles and start it again. Also check Racecar.
- Turn Voice on and ensure spoken prompts do not advance the game themselves.
- Refresh the same phone URL and confirm Settings says Blowing calibrated. Test before changing anything.
- Cancel halfway through setup and confirm the previous settings still work.
- Lock/unlock the phone or change apps, return, and tap an activity or Retry Microphone in Advanced if capture needs resuming.
- Parent Settings scrolls so you can reach the slider and Close button on the phone.

The development Test Blow button simulates success; it does not test the microphone. Use actual blowing for these checks.
When you later use the original production URL, calibrate there too: storage belongs to the website address.

## 6. Commit the tested branch

After you are satisfied with real-device behavior, run:

```bash
git add index.html css/style.css js/app.js js/microphone.js js/blow-detection.js js/calibration.js tests/blow-detection.test.cjs tests/calibration-integration.test.cjs CALIBRATION_GUIDE.md
git diff --cached --stat
git diff --cached --check
git commit -m "Add adjustable device-specific blowing calibration"
git push -u origin feature/blow-calibration
```

The explicit file list avoids accidentally staging unrelated files.
Commit records a checkpoint on your local branch. Push uploads that branch to GitHub. Neither command merges into main.

If Git requests your identity, configure your own name and your GitHub-verified email (or GitHub-provided noreply address), then rerun the commit:

```bash
git config user.name "Your Name"
git config user.email "YOUR_VERIFIED_OR_NOREPLY_EMAIL"
```

If push asks you to authenticate, follow VS Code/GitHub's sign-in flow. Do not put a token in your source files or paste it into chat.

On GitHub, open the BreezeEasy repository and choose Compare & pull request for feature/blow-calibration. Confirm base: main and compare: feature/blow-calibration. A suitable title is Add adjustable blowing calibration. In the description, note which phone/browser you tested, whether gentle blows work, and whether Bubbles can be replayed.

Create the pull request when ready. Review its Files changed tab before merging. If your live host deploys from main, merging may publish the change; keep the branch separate until the phone test is satisfactory.

## Implementation map

| File | Purpose |
| --- | --- |
| js/blow-detection.js | Calibration math, saved-profile validation, sensitivity adjustment, timed detection and release latch |
| js/microphone.js | Shared microphone startup, retry/resume, frequency sampling, dispatch to test/game |
| js/calibration.js | Guided dialog with countdown, validation feedback, local save/load, sensitivity and test counter |
| js/app.js | Parent Settings open/close, pointer/keyboard access, microphone retry on activity taps |
| index.html | Setup controls and script load order |
| css/style.css | Scrollable settings, touch targets, focus styling |
| tests/*.test.cjs | 22 dependency-free Node checks for detector and calibration integration |

Validation performed in the assistant's checkout: 22 automated checks passed; JavaScript syntax checks and git diff --check passed. Graphical browser testing is blocked by the environment, so browser layout and physical microphone behavior have not been verified here. The guided dialog update adds countdown, cancellation, and permission-retry checks. No commit, push, merge, or deployment was made on your behalf.

References:
- Microphone secure contexts: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
- Netlify manual deployment: https://docs.netlify.com/deploy/create-deploys/
