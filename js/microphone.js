/* One microphone and one monitoring loop, shared by calibration and play. */
let audioContext;
let analyser;
let microphone;
let microphoneStream;
let microphoneStartPromise;
let microphoneAnimationId;
let microphoneGeneration = 0;
let microphoneLastFailure = null;
let microphoneStatus = "Tap an activity or Enable microphone to begin.";
let lastMicrophoneSample = null;
let activeBlowDetector = createBlowDetector();

let poofSpeechActive = false;
let poofSpeechRecovering = false;
let poofSpeechRequest = 0;
let poofSpeechTimer;

function isPoofSpeaking() { return poofSpeechActive; }

function isAppleTouchDevice() {
    return /iPhone|iPad|iPod/i.test(navigator.userAgent || "") ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function cancelPoofSpeech() {
    poofSpeechRequest++;
    poofSpeechActive = false;
    poofSpeechRecovering = false;
    clearTimeout(poofSpeechTimer);
    window.speechSynthesis?.cancel();
}

function pauseForPoofSpeech(timeout = 8000) {
    cancelPoofSpeech();
    poofSpeechActive = true;
    const request = poofSpeechRequest;
    const finish = () => {
        if (request !== poofSpeechRequest) return;
        cancelPoofSpeech();
        // Speech can interrupt the phone's input audio session. Resume it after
        // speech ends, errors, or times out; never let browser queue flags lock play.
        if (microphoneStream && !document.hidden && !calibrationSession) {
            const recovery = poofSpeechRequest;
            poofSpeechRecovering = true;
            // On iOS, TTS can leave a live input track permanently silent.
            // A fresh capture restores input; keep the one-breath latch intact.
            startMicrophone({ restart: isAppleTouchDevice(), preserveLatch: true }).finally(() => {
                if (recovery !== poofSpeechRequest) return;
                poofSpeechRecovering = false;
                updateMicrophoneStatus();
            });
        }
    };
    poofSpeechTimer = setTimeout(finish, Math.max(1500, Math.min(8000, timeout)));
    return finish;
}

async function startMicrophone({ restart = false, preserveLatch = false } = {}) {
    if (microphoneStartPromise) return microphoneStartPromise;
    microphoneStatus = "Getting microphone ready…";
    const pending = connectMicrophone(restart, preserveLatch);
    microphoneStartPromise = pending;
    updateMicrophoneStatus();
    try {
        return await pending;
    } finally {
        if (microphoneStartPromise === pending) {
            microphoneStartPromise = null;
            updateMicrophoneStatus();
        }
    }
}

async function microphoneStep(promise, timeout, message) {
    let timer;
    try {
        return await Promise.race([
            promise,
            new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), timeout); })
        ]);
    } finally {
        clearTimeout(timer);
    }
}

function reportMicrophoneInterruption(message) {
    microphoneStatus = message;
    if (isPoofSpeaking() || poofSpeechRecovering) activeBlowDetector.pause();
    else activeBlowDetector.reset();
    if (calibrationSession && !["finished", "error"].includes(calibrationSession.phase)) {
        calibrationError(message);
    }
    updateMicrophoneStatus();
}

function releaseMicrophone() {
    // Invalidate listeners BEFORE stopping old tracks or closing the old context.
    microphoneGeneration++;
    microphoneStartPromise = null;
    if (microphoneAnimationId) cancelAnimationFrame(microphoneAnimationId);
    microphoneAnimationId = null;
    microphone?.disconnect();
    microphoneStream?.getTracks().forEach(track => track.stop());
    const previousContext = audioContext;
    audioContext = null;
    analyser = null;
    microphone = null;
    microphoneStream = null;
    lastMicrophoneSample = null;
    if (previousContext && previousContext.state !== "closed") {
        previousContext.close().catch(() => {});
    }
    activeBlowDetector.pause();
}

async function connectMicrophone(restart, preserveLatch) {
    let generation = microphoneGeneration;
    let step = "starting";
    try {
        if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error("Microphone needs HTTPS or localhost in a supported browser.");
        }
        const healthyTrack = microphoneStream?.getAudioTracks().some(track =>
            track.readyState === "live" && track.enabled !== false && !track.muted);
        const rebuild = restart || !healthyTrack || !audioContext || audioContext.state === "closed" ||
            audioContext.state === "interrupted" ||
            (isAppleTouchDevice() && audioContext.state !== "running");
        if (rebuild) releaseMicrophone();
        generation = microphoneGeneration;
        const current = () => generation === microphoneGeneration;
        const checkCurrent = () => { if (!current()) throw new Error("Microphone request canceled."); };
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const context = audioContext;
            context.addEventListener?.("statechange", () => {
                if (!current() || microphoneStartPromise) return;
                if (context.state !== "running") {
                    reportMicrophoneInterruption("Microphone paused. Tap Calibrate Blowing or Retry Microphone to reconnect.");
                }
            });
        }
        const context = audioContext;
        step = "initial audio resume";
        await microphoneStep(context.resume(), 3000, "Audio did not resume. Tap Try Again to reconnect.");
        checkCurrent();
        if (!microphoneStream) {
            step = "microphone permission/capture";
            const capture = navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false }
            }).then(stream => {
                // A timed-out or canceled request can resolve much later. Dispose
                // that stream instead of overwriting a newer capture.
                if (!current()) stream.getTracks().forEach(track => track.stop());
                return stream;
            });
            const stream = await microphoneStep(capture, 15000, "Microphone did not start. Allow access, then tap Try Again.");
            checkCurrent();
            microphoneStream = stream;
            analyser = context.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.2;
            microphone = context.createMediaStreamSource(stream);
            microphone.connect(analyser);
            const track = stream.getAudioTracks()[0];
            if (!track) throw new Error("No microphone audio track was returned. Try again.");
            track.addEventListener("ended", () => {
                if (!current()) return;
                reportMicrophoneInterruption("Microphone disconnected. Tap Calibrate Blowing or Retry Microphone to reconnect.");
            });
            track.addEventListener("mute", () => {
                if (!current()) return;
                reportMicrophoneInterruption("Microphone interrupted. Tap Try Again to reconnect.");
            });
        }
        step = "audio resume after capture";
        await microphoneStep(context.resume(), 3000, "Audio did not resume after microphone startup. Tap Try Again.");
        checkCurrent();
        if (context.state !== "running") throw new Error("Microphone audio is paused. Tap Try Again to reconnect.");
        const activeTrack = microphoneStream.getAudioTracks()[0];
        if (activeTrack.muted || activeTrack.enabled === false) throw new Error("Microphone is muted. Tap Try Again to reconnect.");
        microphoneStatus = "Microphone ready.";
        if (rebuild && !preserveLatch && typeof automaticRoomNoise !== "undefined") automaticRoomNoise.reset();
        if (rebuild && !preserveLatch) activeBlowDetector.reset();
        else activeBlowDetector.pause(); // Preserve the one-breath latch after speech.
        if (!microphoneAnimationId) monitorMicrophone();
        updateMicrophoneStatus();
        return true;
    } catch (error) {
        if (generation !== microphoneGeneration) return false;
        microphoneStatus = error.name === "NotAllowedError"
            ? "Microphone permission blocked. Allow it in your browser's site settings, then retry."
            : error.name === "NotFoundError"
                ? "No microphone found. Connect one and try again."
                : error.name === "NotReadableError"
                    ? "Microphone unavailable. Close other apps using it, then try again."
                    : error.message;
        microphoneLastFailure = { step, message: microphoneStatus };
        releaseMicrophone();
        updateMicrophoneStatus();
        return false;
    }
}

function updateMicrophoneStatus() {
    const status = document.getElementById("microphone-status");
    if (status) status.textContent = microphoneStatus;
    const retry = document.getElementById("activity-microphone-retry");
    if (retry) {
        const playing = typeof currentActivity !== "undefined" && ["bubbles", "racecar", "dragon", "balloon"].includes(currentActivity);
        const inSettings = document.getElementById("settings-modal")?.style.display === "flex" || Boolean(calibrationSession);
        const ready = audioContext?.state === "running" && microphoneStream?.getAudioTracks().some(track =>
            track.readyState === "live" && track.enabled !== false && !track.muted);
        retry.hidden = !playing || inSettings || (Boolean(ready) && !poofSpeechRecovering) || poofSpeechActive;
        retry.disabled = Boolean(microphoneStartPromise) || poofSpeechRecovering;
        retry.textContent = microphoneStartPromise || poofSpeechRecovering ? "Getting ready…" : "Enable blowing";
    }
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
            if (isPoofSpeaking() || poofSpeechRecovering) activeBlowDetector.pause();
            else activeBlowDetector.reset();
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
        lastMicrophoneSample = { ...sample, time: now };
        updateCalibration(sample, now);
        const inSettings = document.getElementById("settings-modal").style.display === "flex";
        const speaking = isPoofSpeaking();
        const playing = Boolean(currentActivity) && !inSettings;
        if (speaking || poofSpeechRecovering) {
            // Quiet input during the introduction can establish the room floor.
            // Never learn the spoken prompt itself or a recovering input stream.
            if (speaking && !poofSpeechRecovering && !calibrationSession && sample.volume < getBlowSettings().volume) {
                updateAutomaticRoomNoise(sample);
            }
            // Keep the release latch: speech after a reward must not rearm a long breath.
            activeBlowDetector.pause();
            return;
        }
        if (calibrationSession || (!playing && !inSettings)) {
            activeBlowDetector.reset();
            return;
        }
        updateAutomaticRoomNoise(sample);
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
    else updateMicrophoneStatus();
});

document.getElementById("activity-microphone-retry")?.addEventListener("click", () => {
    cancelPoofSpeech();
    return startMicrophone({ restart: true });
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
        lastFailure: microphoneLastFailure,
        startingMode: hasBlowCalibration ? "calibrated" : "automatic",
        detectionSettings: getBlowSettings(),
        recentInput: lastMicrophoneSample ? {
            volume: Number(lastMicrophoneSample.volume.toFixed(3)),
            frequencyRatio: Number(lastMicrophoneSample.ratio.toFixed(5)),
            waveformRms: lastMicrophoneSample.waveformRms,
            sampleAgeMs: Math.max(0, Math.round(performance.now() - lastMicrophoneSample.time))
        } : null,
        poofSpeechActive,
        poofSpeechRecovering,
        browserSpeechSpeaking: Boolean(window.speechSynthesis?.speaking),
        browserSpeechPending: Boolean(window.speechSynthesis?.pending),
        trackState: track?.readyState ?? "not started",
        trackMuted: track?.muted ?? "not reported",
        trackEnabled: track?.enabled ?? "not reported",
        fftMinDecibels: analyser?.minDecibels ?? "not reported",
        fftMaxDecibels: analyser?.maxDecibels ?? "not reported",
        contextState: audioContext?.state ?? "not started",
        contextSampleRate: audioContext?.sampleRate ?? "not reported"
    };
}
