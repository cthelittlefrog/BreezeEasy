/* One microphone and one monitoring loop, shared by calibration and play. */
let audioContext;
let analyser;
let microphone;
let microphoneStream;
let microphoneStartPromise;
let microphoneAnimationId;
let microphoneGeneration = 0;
let microphoneStatus = "Tap an activity or Enable microphone to begin.";
let activeBlowDetector = createBlowDetector();

async function startMicrophone({ restart = false } = {}) {
    if (microphoneStartPromise) return microphoneStartPromise;
    microphoneStartPromise = connectMicrophone(restart);
    try {
        return await microphoneStartPromise;
    } finally {
        microphoneStartPromise = null;
    }
}

function reportMicrophoneInterruption(message) {
    microphoneStatus = message;
    activeBlowDetector.reset();
    if (calibrationSession && !["finished", "error"].includes(calibrationSession.phase)) {
        calibrationError(message);
    }
    updateMicrophoneStatus();
}

function releaseMicrophone() {
    // Invalidate listeners BEFORE stopping old tracks or closing the old context.
    microphoneGeneration++;
    if (microphoneAnimationId) cancelAnimationFrame(microphoneAnimationId);
    microphoneAnimationId = null;
    microphone?.disconnect();
    microphoneStream?.getTracks().forEach(track => track.stop());
    const previousContext = audioContext;
    audioContext = null;
    analyser = null;
    microphone = null;
    microphoneStream = null;
    if (previousContext && previousContext.state !== "closed") {
        previousContext.close().catch(() => {});
    }
    activeBlowDetector.reset();
}

async function connectMicrophone(restart) {
    try {
        if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error("Microphone needs HTTPS or localhost in a supported browser.");
        }
        const healthyTrack = microphoneStream?.getAudioTracks().some(track =>
            track.readyState === "live" && track.enabled !== false && !track.muted);
        if (restart || !healthyTrack || !audioContext || audioContext.state === "closed") releaseMicrophone();
        const generation = microphoneGeneration;
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const context = audioContext;
            context.addEventListener?.("statechange", () => {
                if (generation !== microphoneGeneration || microphoneStartPromise) return;
                if (context.state !== "running") {
                    reportMicrophoneInterruption("Microphone paused. Tap Calibrate Blowing or Retry Microphone to reconnect.");
                }
            });
        }
        // Resume from the user gesture, and again AFTER capture starts: input
        // startup can change the phone's audio session/context state.
        await audioContext.resume();
        if (!microphoneStream) {
            microphoneStream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false }
            });
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.2;
            microphone = audioContext.createMediaStreamSource(microphoneStream);
            microphone.connect(analyser);
            const track = microphoneStream.getAudioTracks()[0];
            if (!track) throw new Error("No microphone audio track was returned. Try again.");
            track.addEventListener("ended", () => {
                if (generation !== microphoneGeneration) return;
                reportMicrophoneInterruption("Microphone disconnected. Tap Calibrate Blowing or Retry Microphone to reconnect.");
            });
            track.addEventListener("mute", () => {
                if (generation !== microphoneGeneration) return;
                reportMicrophoneInterruption("Microphone interrupted. Tap Try Again to reconnect.");
            });
        }
        await audioContext.resume();
        if (audioContext.state !== "running") throw new Error("Microphone audio is paused. Tap Try Again to reconnect.");
        const activeTrack = microphoneStream.getAudioTracks()[0];
        if (activeTrack.muted || activeTrack.enabled === false) throw new Error("Microphone is muted. Tap Try Again to reconnect.");
        microphoneStatus = "Microphone ready.";
        activeBlowDetector.reset();
        if (!microphoneAnimationId) monitorMicrophone();
        updateMicrophoneStatus();
        return true;
    } catch (error) {
        microphoneStatus = error.name === "NotAllowedError"
            ? "Microphone permission blocked. Allow it in your browser's site settings, then retry."
            : error.name === "NotFoundError"
                ? "No microphone found. Connect one and try again."
                : error.name === "NotReadableError"
                    ? "Microphone unavailable. Close other apps using it, then try again."
                    : error.message;
        releaseMicrophone();
        updateMicrophoneStatus();
        return false;
    }
}

function updateMicrophoneStatus() {
    const status = document.getElementById("microphone-status");
    if (status) status.textContent = microphoneStatus;
}

function monitorMicrophone() {
    const generation = microphoneGeneration;
    const data = new Uint8Array(analyser.frequencyBinCount);
    const waveform = new Float32Array(analyser.fftSize);
    function detect(now) {
        if (generation !== microphoneGeneration) return;
        microphoneAnimationId = requestAnimationFrame(detect);
        if (document.hidden || audioContext.state !== "running" ||
            !microphoneStream.getAudioTracks().some(track => track.readyState === "live" && track.enabled !== false && !track.muted)) {
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
        let waveformRms = null;
        if (typeof analyser.getFloatTimeDomainData === "function") {
            analyser.getFloatTimeDomainData(waveform);
            waveformRms = Math.sqrt(waveform.reduce((sum, value) => sum + value * value, 0) / waveform.length);
        }
        const sample = { volume: (low + high) / data.length, ratio: high / Math.max(low, 1), waveformRms };
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

function getMicrophoneDiagnostics() {
    const track = microphoneStream?.getAudioTracks()[0];
    const actual = track?.getSettings?.() ?? {};
    // Whitelist audio-processing fields; omit microphone names and device IDs.
    const fields = ["echoCancellation", "noiseSuppression", "autoGainControl", "sampleRate", "channelCount"];
    return {
        requested: { echoCancellation: true, noiseSuppression: false, autoGainControl: false },
        reported: Object.fromEntries(fields.map(key => [key, actual[key] ?? "not reported"])),
        captureGeneration: microphoneGeneration,
        trackState: track?.readyState ?? "not started",
        trackMuted: track?.muted ?? "not reported",
        trackEnabled: track?.enabled ?? "not reported",
        fftMinDecibels: analyser?.minDecibels ?? "not reported",
        fftMaxDecibels: analyser?.maxDecibels ?? "not reported",
        contextState: audioContext?.state ?? "not started",
        contextSampleRate: audioContext?.sampleRate ?? "not reported"
    };
}
