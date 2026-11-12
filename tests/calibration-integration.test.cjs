const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function app({ saved, blockedStorage = false, denied = false, zeroOnCapture = 0, pauseOnCapture = false, fullApp = false, hangResume = false, hangCapture = false } = {}) {
    const elements = new Map();
    const storage = new Map(saved ? [['breezeEasy.blowProfile.v1', saved]] : []);
    const frames = new Map(), tracks = [], contexts = [], timers = new Map(), lateCaptures = [];
    let requests = 0, frameId = 0, timerId = 0, now = 0;
    const element = id => {
        if (!elements.has(id)) {
            const classes = new Set();
            elements.set(id, {
            classList: { add: key => classes.add(key), remove: key => classes.delete(key), contains: key => classes.has(key) },
            querySelectorAll() { return []; },
            textContent: '', value: 0, style: {}, handlers: {}, open: false,
            showModal() { this.open = true; }, close() { this.open = false; }, focus() {},
            addEventListener(event, handler) { this.handlers[event] = handler; }
        });
        }
        return elements.get(id);
    };
    element('settings-modal').style.display = 'flex';
    const context = vm.createContext({
        console, Uint8Array, Float32Array,
        performance: { now: () => now },
        setTimeout(callback, delay) { timers.set(++timerId, { due: now + delay, callback }); return timerId; },
        clearTimeout: id => timers.delete(id),
        addEventListener() {},
        document: { hidden: false, getElementById: element, addEventListener() {}, querySelectorAll: () => [] },
        navigator: { mediaDevices: { getUserMedia: async () => {
            requests++;
            if (context.denied) throw Object.assign(new Error('denied'), { name: 'NotAllowedError' });
            const track = {
                readyState: 'live', muted: false, enabled: true, zero: requests === zeroOnCapture,
                getSettings() { return { echoCancellation: true, noiseSuppression: false, autoGainControl: false, sampleRate: 48000, deviceId: 'private-device', groupId: 'private-group' }; },
                stop() { this.readyState = 'ended'; }, addEventListener(event, handler) { this[event] = handler; }
            };
            tracks.push(track);
            if (pauseOnCapture) {
                const audio = contexts.at(-1); audio.state = 'suspended'; audio.statechange?.();
            }
            const stream = { getAudioTracks: () => [track], getTracks: () => [track] };
            if (context.hangCapture) return new Promise(resolve => lateCaptures.push(() => resolve(stream)));
            return stream;
        } } },
        requestAnimationFrame: callback => { frames.set(++frameId, callback); return frameId; },
        cancelAnimationFrame: id => frames.delete(id),
        localStorage: {
            getItem: key => { if (blockedStorage) throw new Error('blocked'); return storage.get(key) ?? null; },
            setItem: (key, value) => { if (blockedStorage) throw new Error('blocked'); storage.set(key, value); }
        },
        currentActivity: 'bubbles', denied, hangResume, hangCapture, level: 'quiet', rewards: 0,
        handleBlow: () => { context.rewards++; }
    });
    context.window = context;
    context.speechSynthesis = { speaking: false, pending: false,
        cancel() { this.speaking = false; this.pending = false; },
        speak(speech) { this.speaking = true; context.lastSpeech = speech; }
    };
    context.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    context.AudioContext = class {
        state = 'running'; sampleRate = 48000; resumeCount = 0;
        constructor() { contexts.push(this); }
        async resume() { this.resumeCount++; if (context.hangResume) return new Promise(() => {}); this.state = 'running'; }
        async close() { this.state = 'closed'; this.statechange?.(); }
        addEventListener(event, handler) { this[event] = handler; }
        createMediaStreamSource(stream) { this.track = stream.getAudioTracks()[0]; return { connect() {}, disconnect() {} }; }
        createAnalyser() {
            const audio = this;
            return {
                fftSize: 256, frequencyBinCount: 128, minDecibels: -100, maxDecibels: -30,
                getFloatTimeDomainData(data) { data.fill(audio.track?.zero || context.level === 'zero' ? 0 : context.level === 'quiet' ? 0.001 : 0.1); },
                getByteFrequencyData(data) {
                    for (let i = 0; i < 128; i++) data[i] = audio.track?.zero || context.level === 'zero' || context.level === 'below-floor'
                        ? 0 : context.level === 'quiet' ? 1 : (i < 39 ? 30 : 3);
                }
            };
        }
    };
    for (const file of ['blow-detection.js', 'microphone.js', 'calibration.js']) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', file), 'utf8'), context);
    }
    if (fullApp) {
        for (const file of ['parent-guidance.js', 'app.js']) {
            vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', file), 'utf8'), context);
        }
    }
    function fireTimers() {
        for (const [id, timer] of [...timers]) {
            if (timer.due <= now && timers.has(id)) { timers.delete(id); timer.callback(); }
        }
    }
    return {
        context, element, storage, tracks, contexts, get track() { return tracks.at(-1); }, requests: () => requests,
        pendingFrames: () => frames.size,
        async flush() { for (let i = 0; i < 40; i++) await Promise.resolve(); },
        resolveLateCapture: index => lateCaptures[index](),
        stall(duration) { for (const end = now + duration; now < end; now += 100) fireTimers(); },
        click: id => element(id).handlers.click(),
        tick(duration) {
            for (const end = now + duration; now < end; now += 1000 / 60) {
                fireTimers();
                const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(now));
            }
        },
        run: code => vm.runInContext(code, context)
    };
}

async function calibrate(instance) {
    await instance.click('calibrate-blowing');
    instance.tick(3100);
    assert.equal(instance.element('calibration-action').textContent, 'Ready to Blow?');
    instance.context.level = 'blow';
    await instance.click('calibration-action');
    instance.tick(9200);
}

test('complete calibration saves, test blows do not reward games, and settings reload', async () => {
    const instance = app();
    await calibrate(instance);
    assert.equal(instance.element('calibration-step-title').textContent, 'Finished. Blowing Calibrated');
    assert.equal(instance.element('calibration-dialog').open, true);
    assert.equal(instance.element('calibration-action').textContent, 'Done');
    await instance.click('calibration-action');
    assert.equal(instance.element('calibration-dialog').open, false);
    instance.context.level = 'quiet'; instance.tick(1000);
    instance.context.level = 'blow'; instance.tick(1000);
    assert.match(instance.element('blow-test-status').textContent, /Test count: 1/);
    assert.equal(instance.context.rewards, 0);
    const saved = instance.storage.get('breezeEasy.blowProfile.v1');
    assert.match(app({ saved }).element('calibration-status').textContent, /Blowing calibrated/);
    instance.element('settings-modal').style.display = 'none';
    instance.context.level = 'quiet'; instance.tick(1000);
    instance.context.level = 'blow'; instance.tick(1000);
    assert.equal(instance.context.rewards, 1);
});
test('cancel and failed recalibration preserve the saved profile', async () => {
    const instance = app(); await calibrate(instance);
    await instance.click('calibration-action');
    const saved = instance.storage.get('breezeEasy.blowProfile.v1');
    await instance.click('calibrate-blowing');
    instance.click('cancel-calibration');
    assert.equal(instance.storage.get('breezeEasy.blowProfile.v1'), saved);
    instance.context.level = 'quiet';
    await instance.click('calibrate-blowing'); instance.tick(3100);
    await instance.click('calibration-action'); instance.tick(9200);
    assert.match(instance.element('calibration-status').textContent, /Previous settings/);
    assert.equal(instance.element('calibration-action').textContent, 'Try Again');
    assert.equal(instance.storage.get('breezeEasy.blowProfile.v1'), saved);
});
test('microphone denial can be retried without duplicate capture', async () => {
    const instance = app({ denied: true });
    assert.equal(await instance.context.startMicrophone(), false);
    assert.match(instance.element('microphone-status').textContent, /permission blocked/);
    instance.context.denied = false;
    assert.equal(await instance.context.startMicrophone(), true);
    await Promise.all([instance.context.startMicrophone(), instance.context.startMicrophone()]);
    assert.equal(instance.requests(), 2); // one denied request, one successful request
});
test('cancel during an asynchronous microphone start cannot restart calibration', async () => {
    const instance = app();
    const pending = instance.click('calibrate-blowing');
    instance.click('cancel-calibration');
    await pending;
    assert.equal(instance.run('calibrationSession'), null);
});
test('blocked storage still permits session calibration', async () => {
    const instance = app({ blockedStorage: true });
    await calibrate(instance);
    assert.match(instance.element('calibration-step-hint').textContent, /could not save/);
    assert.ok(instance.run('blowProfile.volume') < 11.3);
});
test('corrupt saved JSON falls back safely', () => {
    const instance = app({ saved: '{oops' });
    assert.equal(instance.run('blowProfile.volume'), 35);
});
test('disconnected microphone shows a retry error without discarding settings', async () => {
    const instance = app();
    await instance.click('calibrate-blowing');
    instance.track.readyState = 'ended'; instance.track.ended();
    assert.equal(instance.run('calibrationSession.phase'), 'error');
    assert.match(instance.element('microphone-status').textContent, /disconnected/);
});


test('guided countdown excludes early blowing and progresses before sampling', async () => {
    const instance = app();
    await instance.click('calibrate-blowing');
    assert.equal(instance.element('calibration-step-title').textContent, 'Quiet Please');
    assert.equal(instance.element('calibration-spinner').hidden, false);
    instance.tick(3100);
    assert.equal(instance.element('calibration-spinner').hidden, true);
    await instance.click('calibration-action');
    instance.context.level = 'blow';
    instance.tick(900);
    assert.equal(instance.element('calibration-countdown').textContent, '3');
    instance.tick(1000);
    assert.equal(instance.element('calibration-countdown').textContent, '2');
    instance.tick(1000);
    assert.equal(instance.element('calibration-countdown').textContent, '1');
    assert.equal(instance.run('calibrationSession.blows.length'), 0);
    instance.context.level = 'quiet';
    instance.tick(300);
    assert.equal(instance.element('calibration-step-title').textContent, 'Blow Now');
    assert.equal(instance.element('calibration-progress').hidden, false);
    instance.tick(3000);
    assert.ok(instance.element('calibration-progress').value > 40);
    assert.ok(instance.element('calibration-progress').value < 60);
    instance.tick(3100);
    assert.equal(instance.element('calibration-action').textContent, 'Try Again');
    assert.equal(instance.storage.size, 0);
});

test('cancel during countdown prevents a delayed save and supports reopening', async () => {
    const instance = app();
    await instance.click('calibrate-blowing'); instance.tick(3100);
    await instance.click('calibration-action'); instance.tick(1000);
    instance.click('cancel-calibration');
    instance.context.level = 'blow'; instance.tick(10000);
    assert.equal(instance.storage.size, 0);
    assert.equal(instance.element('calibration-dialog').open, false);
    instance.context.level = 'quiet';
    await calibrate(instance);
    assert.ok(instance.storage.size > 0);
});

test('permission error stays in dialog and Try Again can complete calibration', async () => {
    const instance = app({ denied: true });
    await instance.click('calibrate-blowing');
    assert.equal(instance.element('calibration-dialog').open, true);
    assert.equal(instance.element('calibration-action').textContent, 'Try Again');
    instance.context.denied = false;
    await instance.click('calibration-action'); instance.tick(3100);
    await instance.click('calibration-action');
    instance.context.level = 'blow'; instance.tick(9200);
    assert.equal(instance.element('calibration-action').textContent, 'Done');
});


test('Escape closes just calibration and preserves the parent settings window', async () => {
    const instance = app();
    await instance.click('calibrate-blowing');
    let prevented = false;
    instance.element('calibration-dialog').handlers.cancel({ preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    assert.equal(instance.element('calibration-dialog').open, false);
    assert.equal(instance.element('settings-modal').style.display, 'flex');
    assert.equal(instance.run('calibrationSession'), null);
});


test('failed calibration exposes numeric diagnostics without device identifiers', async () => {
    const instance = app();
    await instance.click('calibrate-blowing'); instance.tick(3100);
    await instance.click('calibration-action'); instance.tick(9200);
    const text = instance.element('calibration-diagnostics-text').textContent;
    const report = JSON.parse(text);
    assert.equal(instance.element('calibration-diagnostics').hidden, false);
    assert.equal(report.measurements.samplesAboveCutoff, 0);
    assert.ok(report.measurements.failedChecks.length > 0);
    assert.equal(report.microphone.reported.echoCancellation, true);
    assert.equal(report.microphone.reported.sampleRate, 48000);
    assert.ok(!text.includes('private-device'));
    assert.ok(!text.includes('private-group'));
    assert.equal(instance.storage.size, 0);
    await instance.click('calibration-action');
    assert.equal(instance.element('calibration-diagnostics').hidden, true);
});

test('successful calibration also makes a comparison report available', async () => {
    const instance = app();
    await calibrate(instance);
    const report = JSON.parse(instance.element('calibration-diagnostics-text').textContent);
    assert.equal(report.outcome, 'Calibration succeeded');
    assert.equal(report.measurements.failedChecks.length, 0);
});


test('all-zero attempt is identified and Try Again replaces the silent capture', async () => {
    const instance = app({ zeroOnCapture: 1 });
    await calibrate(instance);
    assert.match(instance.element('calibration-step-hint').textContent, /stayed at zero/);
    let report = JSON.parse(instance.element('calibration-diagnostics-text').textContent);
    assert.equal(report.measurements.blowing.maxWaveformRms, 0);
    const oldTrack = instance.track, oldContext = instance.contexts.at(-1);
    const generation = report.microphone.captureGeneration;
    instance.context.level = 'quiet';
    await instance.click('calibration-action');
    assert.notEqual(instance.track, oldTrack);
    assert.equal(oldTrack.readyState, 'ended');
    assert.equal(oldContext.state, 'closed');
    // Late events from the stopped track cannot cancel the replacement.
    oldTrack.ended(); oldTrack.mute(); oldContext.statechange();
    instance.tick(3100);
    assert.equal(instance.element('calibration-action').textContent, 'Ready to Blow?');
    instance.context.level = 'blow';
    await instance.click('calibration-action'); instance.tick(9200);
    assert.equal(instance.element('calibration-action').textContent, 'Done');
    report = JSON.parse(instance.element('calibration-diagnostics-text').textContent);
    assert.ok(report.microphone.captureGeneration > generation);
    assert.ok(report.measurements.blowing.maxWaveformRms > 0);
    assert.equal(instance.pendingFrames(), 1);
});

test('recalibrating a live capture creates a fresh stream, context, and one loop', async () => {
    const instance = app(); await calibrate(instance);
    const saved = instance.storage.get('breezeEasy.blowProfile.v1');
    await instance.click('calibration-action');
    instance.context.level = 'quiet';
    await instance.click('calibrate-blowing');
    assert.equal(instance.requests(), 2);
    assert.equal(instance.tracks[0].readyState, 'ended');
    assert.equal(instance.contexts[0].state, 'closed');
    assert.equal(instance.pendingFrames(), 1);
    instance.click('cancel-calibration');
    assert.equal(instance.storage.get('breezeEasy.blowProfile.v1'), saved);
});

test('capture startup interruption is resumed after getUserMedia', async () => {
    const instance = app({ pauseOnCapture: true });
    await calibrate(instance);
    assert.equal(instance.element('calibration-action').textContent, 'Done');
    assert.ok(instance.contexts.at(-1).resumeCount >= 2);
});

test('a live track becoming muted is diagnosed and can be replaced', async () => {
    const instance = app(); await instance.click('calibrate-blowing');
    const oldTrack = instance.track; oldTrack.muted = true; oldTrack.mute();
    assert.equal(instance.run('calibrationSession.phase'), 'error');
    const report = JSON.parse(instance.element('calibration-diagnostics-text').textContent);
    assert.equal(report.microphone.trackState, 'live');
    assert.equal(report.microphone.trackMuted, true);
    await instance.click('calibration-action');
    assert.notEqual(instance.track, oldTrack);
    assert.equal(instance.track.muted, false);
});

test('diagnostics distinguish FFT zeros from a nonzero waveform', async () => {
    const instance = app(); instance.context.level = 'below-floor';
    await instance.click('calibrate-blowing'); instance.tick(3100);
    await instance.click('calibration-action'); instance.tick(9200);
    const report = JSON.parse(instance.element('calibration-diagnostics-text').textContent);
    assert.equal(report.measurements.blowing.peak, 0);
    assert.ok(report.measurements.blowing.maxWaveformRms > 0);
    assert.equal(instance.storage.size, 0);
});


test('a pending audio resume times out and leaves a working Try Again action', async () => {
    const instance = app({ hangResume: true });
    const pending = instance.click('calibrate-blowing');
    instance.stall(3500); await pending;
    assert.equal(instance.run('calibrationSession.phase'), 'error');
    assert.match(instance.element('calibration-step-hint').textContent, /did not resume/);
    assert.equal(instance.run('microphoneStartPromise'), null);
    instance.context.hangResume = false;
    await instance.click('calibration-action'); instance.tick(3100);
    assert.equal(instance.element('calibration-action').textContent, 'Ready to Blow?');
});

test('a late permission result is stopped and cannot replace a newer microphone', async () => {
    const instance = app({ hangCapture: true });
    const pending = instance.click('calibrate-blowing'); await instance.flush();
    instance.stall(16000); await pending;
    assert.equal(instance.run('calibrationSession.phase'), 'error');
    assert.match(instance.element('calibration-step-hint').textContent, /did not start/);
    instance.context.hangCapture = false;
    await instance.click('calibration-action');
    const currentTrack = instance.track;
    instance.resolveLateCapture(0); await instance.flush();
    assert.equal(instance.tracks[0].readyState, 'ended');
    assert.equal(instance.track, currentTrack);
    assert.equal(currentTrack.readyState, 'live');
    instance.tick(3100);
    assert.equal(instance.element('calibration-action').textContent, 'Ready to Blow?');
});

test('quiet sampling cannot stay stuck when animation callbacks stop arriving', async () => {
    const instance = app(); await instance.click('calibrate-blowing'); instance.tick(300);
    instance.stall(3000);
    assert.equal(instance.run('calibrationSession.phase'), 'error');
    assert.match(instance.element('calibration-step-hint').textContent, /stopped sending samples/);
    assert.equal(instance.pendingFrames(), 0);
    await instance.click('calibration-action'); instance.tick(3100);
    assert.equal(instance.element('calibration-action').textContent, 'Ready to Blow?');
});

test('canceling a pending start permits a new start without waiting for the old one', async () => {
    const instance = app({ hangCapture: true });
    const old = instance.click('calibrate-blowing'); await instance.flush();
    instance.click('cancel-calibration');
    instance.context.hangCapture = false;
    await instance.click('calibrate-blowing');
    instance.resolveLateCapture(0); await old;
    assert.equal(instance.run('calibrationSession.phase'), 'quiet');
    assert.equal(instance.run('microphoneStartPromise'), null);
    assert.equal(instance.tracks[0].readyState, 'ended');
});

test('calibration hands off to bubbles, and listening resumes after the spoken prompt', async () => {
    const instance = app({ fullApp: true }); await calibrate(instance);
    await instance.click('calibration-action');
    instance.element('settings-modal').style.display = 'none';
    instance.element('voice-toggle').checked = true;
    instance.context.level = 'quiet';
    instance.run('handleBubbleBlow = () => { rewards++; }; startBubbleActivity();');
    await instance.flush();
    assert.equal(instance.context.lastSpeech.text, 'Blow bubbles!');
    assert.equal(instance.run('isPoofSpeaking()'), true);
    const audio = instance.contexts.at(-1); audio.state = 'suspended'; audio.statechange();
    instance.context.lastSpeech.onend(); await instance.flush();
    assert.equal(audio.state, 'running');
    assert.equal(instance.run('isPoofSpeaking()'), false);
    instance.tick(1000); instance.context.level = 'blow'; instance.tick(1000);
    assert.equal(instance.context.rewards, 1);
});

test('missing speech callbacks and stuck pending flags cannot suppress play forever', async () => {
    const instance = app({ fullApp: true }); await calibrate(instance);
    await instance.click('calibration-action');
    instance.element('settings-modal').style.display = 'none';
    instance.element('voice-toggle').checked = true;
    instance.context.level = 'quiet';
    instance.run('handleBubbleBlow = () => { rewards++; }; startBubbleActivity();');
    await instance.flush();
    // Simulate a browser leaving its queue flags set even after cancellation.
    instance.context.speechSynthesis.cancel = () => {};
    instance.context.speechSynthesis.pending = true;
    instance.tick(8500); await instance.flush();
    assert.equal(instance.run('isPoofSpeaking()'), false);
    instance.context.level = 'blow'; instance.tick(1000);
    assert.equal(instance.context.rewards, 1);
});

test('speech completion keeps the one-breath latch until a quiet release', async () => {
    const instance = app(); await calibrate(instance);
    await instance.click('calibration-action');
    instance.element('settings-modal').style.display = 'none';
    instance.context.level = 'quiet'; instance.tick(1000);
    instance.context.level = 'blow'; instance.tick(1000);
    assert.equal(instance.context.rewards, 1);
    const finish = instance.run('pauseForPoofSpeech()');
    const audio = instance.contexts.at(-1); audio.state = 'suspended'; audio.statechange();
    instance.tick(1000); finish(); await instance.flush();
    instance.tick(1500);
    assert.equal(instance.context.rewards, 1);
    instance.context.level = 'quiet'; instance.tick(1000);
    instance.context.level = 'blow'; instance.tick(1000);
    assert.equal(instance.context.rewards, 2);
});
