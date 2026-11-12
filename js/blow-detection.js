/* Pure calibration/detection functions, also exercised by Node tests. */
const BLOW_DEFAULTS = Object.freeze({ noise: 5, volume: 35, ratio: 0.45, sensitivity: 50 });

function percentile(values, fraction) {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor((sorted.length - 1) * fraction)] ?? 0;
}

function validBlowProfile(value) {
    return value?.version === 1 &&
        [value.noise, value.volume, value.ratio, value.sensitivity].every(Number.isFinite) &&
        value.noise >= 0 && value.volume > value.noise && value.volume <= 255 &&
        value.ratio >= 0 && value.ratio <= 1000 &&
        value.sensitivity >= 0 && value.sensitivity <= 100;
}

function buildBlowProfile(quiet, blows) {
    if (quiet.length < 30 || blows.length < 30) {
        throw new Error("Not enough microphone data. Keep this screen open and try again.");
    }
    const noise = percentile(quiet.map(sample => sample.volume), 0.95);
    const loud = blows.filter(sample => sample.volume > noise + 3);
    let runStart = null;
    let lastTime = null;
    let longest = 0;
    for (const sample of blows) {
        if (sample.volume <= noise + 3 || (lastTime !== null && sample.time - lastTime > 120)) {
            runStart = null;
        }
        if (sample.volume > noise + 3) {
            runStart ??= sample.time;
            longest = Math.max(longest, sample.time - runStart);
        }
        lastTime = sample.time;
    }
    if (loud.length < 15 || longest < 250) {
        throw new Error("We couldn't distinguish your blowing. Try again, or open Calibration Details.");
    }
    const typical = percentile(loud.map(sample => sample.volume), 0.5);
    return {
        version: 1,
        noise,
        volume: noise + Math.max(2, (typical - noise) * 0.45),
        // Some phones remove high frequencies: learn this gate too.
        ratio: Math.min(1000, Math.max(0, percentile(loud.map(sample => sample.ratio), 0.2) * 0.6)),
        sensitivity: 50
    };
}

function adjustedBlowSettings(profile) {
    const factor = 1.5 - profile.sensitivity / 100;
    return {
        volume: Math.max(profile.noise + 1, profile.noise + (profile.volume - profile.noise) * factor),
        ratio: profile.ratio * factor,
        duration: 220,
        release: 180,
        cooldown: 900
    };
}

function createBlowDetector() {
    let start = null;
    let released = null;
    let armed = true;
    let lastTrigger = -Infinity;
    let lastFrame = null;
    return {
        pause() {
            start = null;
            released = null;
            lastFrame = null;
        },
        reset() {
            start = null;
            released = null;
            armed = true;
            lastTrigger = -Infinity;
            lastFrame = null;
        },
        process(sample, now, settings) {
            // A stalled tab cannot turn two samples into a sustained blow.
            if (lastFrame !== null && now - lastFrame > 120) start = null;
            lastFrame = now;
            const matches = sample.volume > settings.volume && sample.ratio >= settings.ratio;
            if (!matches) {
                start = null;
                if (sample.volume < settings.volume * 0.85) {
                    released ??= now;
                    if (now - released >= settings.release) armed = true;
                } else released = null;
                return false;
            }
            released = null;
            if (!armed || now - lastTrigger < settings.cooldown) {
                start = null;
                return false;
            }
            start ??= now;
            if (now - start < settings.duration) return false;
            armed = false;
            lastTrigger = now;
            start = null;
            return true;
        }
    };
}

/* Numeric troubleshooting only: no audio, device identifiers, or recordings. */
function summarizeCalibration(quiet, blows) {
    const room95 = percentile(quiet.map(sample => sample.volume), 0.95);
    const cutoff = room95 + 3;
    const above = blows.filter(sample => sample.volume > cutoff);
    let start = null, last = null, longest = 0;
    for (const sample of blows) {
        if (sample.volume <= cutoff || (last !== null && sample.time - last > 120)) start = null;
        if (sample.volume > cutoff) {
            start ??= sample.time;
            longest = Math.max(longest, sample.time - start);
        }
        last = sample.time;
    }
    const round = value => Math.round(value * 100) / 100;
    const summarize = samples => ({
        samples: samples.length,
        median: round(percentile(samples.map(sample => sample.volume), 0.5)),
        p95: round(percentile(samples.map(sample => sample.volume), 0.95)),
        peak: round(percentile(samples.map(sample => sample.volume), 1)),
        medianFrequencyRatio: round(percentile(samples.map(sample => sample.ratio), 0.5)),
        medianFrameGapMs: samples.length < 2 ? null : round(percentile(samples.slice(1).map((sample, index) => sample.time - samples[index].time), 0.5))
    });
    return {
        quiet: summarize(quiet), blowing: summarize(blows),
        requiredLoudness: round(cutoff), samplesAboveCutoff: above.length,
        longestBlowMs: round(longest),
        failedChecks: [
            ...(quiet.length < 30 || blows.length < 30 ? ["Too few samples (need 30 per step)"] : []),
            ...(above.length < 15 ? ["Too few louder samples (need 15)"] : []),
            ...(longest < 250 ? ["No sustained louder sample (need 250 ms)"] : [])
        ]
    };
}
