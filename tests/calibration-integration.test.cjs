const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function app({ saved, blockedStorage = false, denied = false } = {}) {
    const elements = new Map();
    const storage = new Map(saved ? [['breezeEasy.blowProfile.v1', saved]] : []);
    let frame;
    let requests = 0;
    const element = id => {
        if (!elements.has(id)) elements.set(id, {
            textContent: '', value: 0, style: {}, handlers: {}, open: false,
            showModal() { this.open = true; }, close() { this.open = false; }, focus() {},
            addEventListener(event, handler) { this.handlers[event] = handler; }
        });
        return elements.get(id);
    };
    element('settings-modal').style.display = 'flex';
    const track = { getSettings() { return { echoCancellation: true, noiseSuppression: false, autoGainControl: false, sampleRate: 48000, deviceId: 'private-device', groupId: 'private-group' }; }, readyState: 'live', stop() {}, addEventListener(event, handler) { this[event] = handler; } };
    const context = vm.createContext({
        console, Uint8Array, setTimeout: () => 1, clearTimeout() {},
        document: { hidden: false, getElementById: element, addEventListener() {} },
        navigator: { mediaDevices: { getUserMedia: async () => {
            requests++;
            if (context.denied) throw Object.assign(new Error('denied'), { name: 'NotAllowedError' });
            return { getAudioTracks: () => [track], getTracks: () => [track] };
        } } },
        requestAnimationFrame: callback => { frame = callback; return 1; },
        localStorage: {
            getItem: key => { if (blockedStorage) throw new Error('blocked'); return storage.get(key) ?? null; },
            setItem: (key, value) => { if (blockedStorage) throw new Error('blocked'); storage.set(key, value); }
        },
        currentActivity: 'bubbles', denied, level: 'quiet', rewards: 0,
        handleBlow: () => { context.rewards++; }
    });
    context.window = context;
    context.speechSynthesis = { speaking: false, pending: false, cancel() {} };
    context.AudioContext = class {
        state = 'running';
        async resume() { this.state = 'running'; }
        createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
        createAnalyser() { return { frequencyBinCount: 128, getByteFrequencyData(data) {
            for (let i = 0; i < 128; i++) data[i] = context.level === 'quiet' ? 1 : (i < 39 ? 30 : 3);
        } }; }
    };
    for (const file of ['blow-detection.js', 'microphone.js', 'calibration.js']) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', file), 'utf8'), context);
    }
    let now = 0;
    return {
        context, element, storage, track, requests: () => requests,
        click: id => element(id).handlers.click(),
        tick(duration) { for (const end = now + duration; now < end; now += 1000 / 60) frame(now); },
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
test('disconnected microphone cancels setup and provides retry guidance', async () => {
    const instance = app();
    await instance.click('calibrate-blowing');
    instance.track.readyState = 'ended'; instance.track.ended();
    assert.equal(instance.run('calibrationSession'), null);
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
