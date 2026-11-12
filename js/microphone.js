/* One microphone and one monitoring loop, shared by calibration and play. */
let audioContext;
let analyser;
let microphone;
let microphoneStream;
let microphoneStartPromise;
let microphoneAnimationId;
let microphoneStatus = "Tap an activity or Enable microphone to begin.";
let activeBlowDetector = createBlowDetector();

async function startMicrophone() {
    if (microphoneStartPromise) return microphoneStartPromise;
    microphoneStartPromise = connectMicrophone();
    try {
        return await microphoneStartPromise;
    } finally {
        microphoneStartPromise = null;
    }
}

async function connectMicrophone() {
    try {
        if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error("Microphone needs HTTPS or localhost in a supported browser.");
        }
        if (!audioContext || audioContext.state === "closed") {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            audioContext.addEventListener?.("statechange", () => {
                if (audioContext.state !== "running") {
                    cancelCalibration();
                    microphoneStatus = "Microphone paused. Tap an activity or Enable microphone to resume.";
                    updateMicrophoneStatus();
                }
            });
        }
        await audioContext.resume();
        if (!microphoneStream?.getAudioTracks().some(track => track.readyState === "live")) {
            microphone?.disconnect();
            microphoneStream?.getTracks().forEach(track => track.stop());
            microphoneStream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false }
            });
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.2;
            microphone = audioContext.createMediaStreamSource(microphoneStream);
            microphone.connect(analyser);
            microphoneStream.getAudioTracks()[0].addEventListener("ended", () => {
                microphoneStatus = "Microphone disconnected. Tap Enable microphone to retry.";
                cancelCalibration();
                updateMicrophoneStatus();
            });
        }
        microphoneStatus = "Microphone ready.";
        activeBlowDetector.reset();
        if (!microphoneAnimationId) monitorMicrophone();
        updateMicrophoneStatus();
        return true;
    } catch (error) {
        microphoneStatus = error.name === "NotAllowedError"
            ? "Microphone permission blocked. Allow it in your browser's site settings, then tap Enable microphone."
            : error.name === "NotFoundError"
                ? "No microphone found. Connect one and try again."
                : error.name === "NotReadableError"
                    ? "Microphone unavailable. Close other apps using it, then try again."
                    : error.message;
        updateMicrophoneStatus();
        return false;
    }
}

function updateMicrophoneStatus() {
    const status = document.getElementById("microphone-status");
    if (status) status.textContent = microphoneStatus;
}

function monitorMicrophone() {
    const data = new Uint8Array(analyser.frequencyBinCount);
    function detect(now) {
        microphoneAnimationId = requestAnimationFrame(detect);
        if (document.hidden || audioContext.state !== "running" ||
            !microphoneStream.getAudioTracks().some(track => track.readyState === "live")) {
            activeBlowDetector.reset();
            return;
        }
        analyser.getByteFrequencyData(data);
        let low = 0;
        let high = 0;
        for (let i = 0; i < data.length; i++) {
            if (i < data.length * 0.30) low += data[i];
            else high += data[i];
        }
        const sample = { volume: (low + high) / data.length, ratio: high / Math.max(low, 1) };
        updateCalibration(sample, now);
        const inSettings = document.getElementById("settings-modal").style.display === "flex";
        const speaking = window.speechSynthesis?.speaking || window.speechSynthesis?.pending;
        const playing = Boolean(currentActivity) && !inSettings;
        if (speaking) {
            // Keep the release latch: speech after a reward must not rearm a long breath.
            activeBlowDetector.pause();
            return;
        }
        if (calibrationSession || (!playing && !inSettings)) {
            activeBlowDetector.reset();
            return;
        }
        if (activeBlowDetector.process(sample, now, getBlowSettings())) {
            if (inSettings) showTestBlow();
            else handleBlow(sample.volume);
        }
    }
    microphoneAnimationId = requestAnimationFrame(detect);
}

document.addEventListener("visibilitychange", () => {
    activeBlowDetector.reset();
    if (document.hidden) cancelCalibration();
});
