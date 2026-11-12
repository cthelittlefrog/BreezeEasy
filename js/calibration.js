/* Calibration stays on this browser/device. No recording or network upload. */
const BLOW_STORAGE_KEY = "breezeEasy.blowProfile.v1";
let blowProfile = { ...BLOW_DEFAULTS };
let calibrationSession = null;
let calibrationRequest = 0;
let testBlowCount = 0;
let testBlowTimer;

const calibrationButton = document.getElementById("calibrate-blowing");
const calibrationCancel = document.getElementById("cancel-calibration");
const calibrationStatus = document.getElementById("calibration-status");
const calibrationProgress = document.getElementById("calibration-progress");
const calibrationDialog = document.getElementById("calibration-dialog");
const calibrationTitle = document.getElementById("calibration-step-title");
const calibrationHint = document.getElementById("calibration-step-hint");
const calibrationAction = document.getElementById("calibration-action");
const calibrationCountdown = document.getElementById("calibration-countdown");
const sensitivitySlider = document.getElementById("blow-sensitivity");
const sensitivityValue = document.getElementById("sensitivity-value");

try {
    const saved = JSON.parse(localStorage.getItem(BLOW_STORAGE_KEY));
    if (validBlowProfile(saved)) {
        blowProfile = saved;
        calibrationStatus.textContent = "Blowing calibrated.";
    }
} catch {
    // Missing, blocked, or damaged storage must never prevent play.
}
refreshSensitivity();

function getBlowSettings() {
    return adjustedBlowSettings(blowProfile);
}

function refreshSensitivity() {
    sensitivitySlider.value = blowProfile.sensitivity;
    sensitivityValue.textContent = `${blowProfile.sensitivity}%`;
}

function saveBlowProfile() {
    try {
        localStorage.setItem(BLOW_STORAGE_KEY, JSON.stringify({ ...blowProfile, version: 1 }));
        return true;
    } catch {
        return false;
    }
}

function setCalibrationBusy(busy) {
    sensitivitySlider.disabled = busy;
    document.getElementById("reset-calibration").disabled = busy;
    calibrationButton.disabled = busy;
}

function showCalibrationStep(phase, title, hint = "") {
    calibrationTitle.textContent = title;
    calibrationHint.textContent = hint;
    document.getElementById("calibration-spinner").hidden = phase !== "quiet";
    document.getElementById("calibration-complete").hidden = phase !== "finished";
    calibrationCountdown.hidden = phase !== "countdown";
    calibrationProgress.hidden = phase !== "blow";
    calibrationAction.hidden = !["ready", "finished", "error"].includes(phase);
    calibrationAction.textContent = phase === "ready" ? "Ready to Blow?" : phase === "finished" ? "Done" : "Try Again";
    calibrationCancel.hidden = phase === "finished";
    if (!calibrationAction.hidden) calibrationAction.focus();
    else calibrationTitle.focus();
}

function cancelCalibration() {
    calibrationRequest++;
    if (calibrationSession && !["finished", "error"].includes(calibrationSession.phase)) {
        calibrationStatus.textContent = "Calibration canceled. Previous settings kept.";
    }
    calibrationSession = null;
    calibrationProgress.value = 0;
    setCalibrationBusy(false);
    activeBlowDetector.reset();
    if (calibrationDialog.open) {
        calibrationDialog.close();
        calibrationButton.focus();
    }
}

function showCalibrationDiagnostics(outcome) {
    if (!calibrationSession) return;
    const report = {
        diagnosticVersion: "phone-calibration-2", outcome,
        microphone: getMicrophoneDiagnostics(),
        measurements: summarizeCalibration(calibrationSession.quiet, calibrationSession.blows)
    };
    document.getElementById("calibration-diagnostics-text").textContent = JSON.stringify(report, null, 2);
    document.getElementById("calibration-diagnostics").hidden = false;
}

function calibrationError(message) {
    if (!calibrationSession) return;
    showCalibrationDiagnostics(message);
    calibrationSession.phase = "error";
    calibrationStatus.textContent = "Previous settings kept.";
    showCalibrationStep("error", "Let's Try Again", message);
    activeBlowDetector.reset();
}

async function beginCalibration() {
    clearTimeout(testBlowTimer);
    document.getElementById("calibration-diagnostics").hidden = true;
    document.getElementById("calibration-diagnostics").open = false;
    document.getElementById("calibration-copy-status").textContent = "";
    const request = ++calibrationRequest;
    window.speechSynthesis?.cancel();
    calibrationSession = { phase: "starting", quiet: [], blows: [], started: null, lastSample: null };
    setCalibrationBusy(true);
    if (!calibrationDialog.open) calibrationDialog.showModal();
    showCalibrationStep("quiet", "Quiet Please");
    calibrationProgress.value = 0;
    const ready = await startMicrophone({ restart: true });
    if (request !== calibrationRequest) return;
    if (!ready) {
        calibrationError(microphoneStatus);
        return;
    }
    calibrationSession.phase = "quiet";
}

calibrationButton.addEventListener("click", beginCalibration);
calibrationAction.addEventListener("click", () => {
    if (calibrationSession?.phase === "finished") {
        cancelCalibration();
    } else if (calibrationSession?.phase === "error") {
        return beginCalibration();
    } else if (calibrationSession?.phase === "ready") {
        calibrationSession.phase = "countdown";
        calibrationSession.started = null;
        calibrationSession.lastSample = null;
        calibrationCountdown.textContent = "3";
        showCalibrationStep("countdown", "Start Blowing in…");
    }
});
calibrationDialog.addEventListener("cancel", event => {
    event.preventDefault();
    cancelCalibration();
});

function updateCalibration(sample, now) {
    document.getElementById("microphone-level").value = sample.volume;
    const session = calibrationSession;
    if (!session || !["quiet", "countdown", "blow"].includes(session.phase)) return;
    if (session.lastSample !== null && now - session.lastSample > 500) {
        calibrationError("Microphone interrupted. Try again.");
        return;
    }
    session.lastSample = now;
    session.started ??= now;
    const elapsed = now - session.started;
    if (session.phase === "countdown") {
        if (elapsed < 3000) {
            const count = String(3 - Math.floor(elapsed / 1000));
            if (calibrationCountdown.textContent !== count) {
                calibrationCountdown.textContent = count;
            }
        } else {
            session.phase = "blow";
            session.started = now;
            calibrationProgress.value = 0;
            showCalibrationStep("blow", "Blow Now", "Blow gently, pause, and repeat.");
        }
        return;
    }
    const duration = session.phase === "quiet" ? 3000 : 6000;
    if (session.phase === "blow") calibrationProgress.value = Math.min(100, elapsed / duration * 100);
    session[session.phase === "quiet" ? "quiet" : "blows"].push({ ...sample, time: now });
    if (elapsed < duration) return;
    if (session.phase === "quiet") {
        session.phase = "ready";
        showCalibrationStep("ready", "Room Calibrated");
        return;
    }
    try {
        const nextProfile = buildBlowProfile(session.quiet, session.blows);
        if (!validBlowProfile(nextProfile)) throw new Error("No usable blowing sample. Try again.");
        blowProfile = nextProfile;
        refreshSensitivity();
        const saved = saveBlowProfile();
        showCalibrationDiagnostics("Calibration succeeded");
        session.phase = "finished";
        calibrationProgress.value = 100;
        activeBlowDetector.reset();
        calibrationStatus.textContent = saved ? "Blowing calibrated." : "Calibrated for this session only.";
        showCalibrationStep("finished", "Finished. Blowing Calibrated", saved ? "" : "Your browser could not save it. Recalibrate next visit.");
    } catch (error) {
        calibrationError(error.message);
    }
}

function showTestBlow() {
    testBlowCount++;
    document.getElementById("blow-test-status").textContent = `Blow detected! Test count: ${testBlowCount}.`;
    clearTimeout(testBlowTimer);
    testBlowTimer = setTimeout(() => {
        document.getElementById("blow-test-status").textContent = `Ready for another blow. Test count: ${testBlowCount}.`;
    }, 1000);
}

calibrationCancel.addEventListener("click", cancelCalibration);
document.getElementById("enable-microphone").addEventListener("click", () => startMicrophone({ restart: true }));
sensitivitySlider.addEventListener("input", () => {
    blowProfile.sensitivity = Number(sensitivitySlider.value);
    refreshSensitivity();
    activeBlowDetector.reset();
});
sensitivitySlider.addEventListener("change", () => {
    calibrationStatus.textContent = saveBlowProfile()
        ? "Sensitivity saved."
        : "Sensitivity changed for this session; browser storage is unavailable.";
});
document.getElementById("reset-calibration").addEventListener("click", () => {
    blowProfile = { ...BLOW_DEFAULTS };
    refreshSensitivity();
    activeBlowDetector.reset();
    calibrationStatus.textContent = saveBlowProfile()
        ? "Default settings restored."
        : "Default settings restored for this session; browser storage is unavailable.";
});

document.getElementById("copy-calibration-diagnostics").addEventListener("click", async () => {
    const report = document.getElementById("calibration-diagnostics-text").textContent;
    const status = document.getElementById("calibration-copy-status");
    try {
        await navigator.clipboard.writeText(report);
        status.textContent = "Copied.";
    } catch {
        status.textContent = "Select and copy the details above, or take a screenshot.";
    }
});
