const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/blow-detection.js'), 'utf8'), context);
const { buildBlowProfile, validBlowProfile, createBlowDetector, adjustedBlowSettings } = context;
const samples = (volume, ratio, count = 180) => Array.from({ length: count }, (_, i) => ({ volume, ratio, time: i * 1000 / 60 }));
const settings = { volume: 10, ratio: 0.2, duration: 220, release: 180, cooldown: 900 };

function feed(detector, from, to, volume, ratio = 0.4, hz = 60) {
    let triggers = 0;
    for (let now = from; now < to; now += 1000 / hz) {
        if (detector.process({ volume, ratio }, now, settings)) triggers++;
    }
    return triggers;
}

test('learns quiet, gentle blowing with a low high-frequency ratio', () => {
    const profile = buildBlowProfile(samples(2, 0.05), samples(12, 0.08));
    assert.equal(validBlowProfile(profile), true);
    assert.ok(profile.volume > 2 && profile.volume < 12);
    assert.ok(profile.ratio < 0.08);
});
test('rejects silence, insufficient data, and isolated claps', () => {
    assert.throws(() => buildBlowProfile(samples(5, 0.1), samples(5, 0.1)));
    assert.throws(() => buildBlowProfile([], []));
    const claps = samples(5, 0.1);
    claps.forEach((sample, i) => { if (i % 10 === 0) sample.volume = 100; });
    assert.throws(() => buildBlowProfile(samples(5, 0.1), claps));
});
test('rejects invalid/corrupted stored profiles', () => {
    for (const value of [null, {}, { version: 2 }, { version: 1, noise: 10, volume: 5, ratio: 1, sensitivity: 50 }]) {
        assert.equal(validBlowProfile(value), false);
    }
});
test('higher sensitivity makes gentle blows easier', () => {
    const profile = buildBlowProfile(samples(2, 0.1), samples(15, 0.3));
    const low = adjustedBlowSettings({ ...profile, sensitivity: 0 });
    const high = adjustedBlowSettings({ ...profile, sensitivity: 100 });
    assert.ok(high.volume < low.volume);
    assert.ok(high.ratio < low.ratio);
    assert.ok(high.volume > profile.noise);
});
test('one long blow triggers once until released', () => {
    const detector = createBlowDetector();
    assert.equal(feed(detector, 0, 4000, 20), 1);
    assert.equal(feed(detector, 4000, 4500, 0), 0);
    assert.equal(feed(detector, 4500, 5500, 20), 1);
});
test('rejects short spikes and wrong spectrum', () => {
    assert.equal(feed(createBlowDetector(), 0, 100, 100), 0);
    assert.equal(feed(createBlowDetector(), 0, 3000, 20, 0.01), 0);
});
test('uses elapsed time at 30, 60, and 120 Hz', () => {
    for (const hz of [30, 60, 120]) {
        assert.equal(feed(createBlowDetector(), 0, 500, 20, 0.4, hz), 1);
    }
});
test('a stalled frame cannot count as sustained blowing', () => {
    const detector = createBlowDetector();
    assert.equal(detector.process({ volume: 20, ratio: 0.4 }, 0, settings), false);
    assert.equal(detector.process({ volume: 20, ratio: 0.4 }, 3000, settings), false);
});
test('spectral flicker without quiet cannot rearm a continuous breath', () => {
    const detector = createBlowDetector();
    assert.equal(feed(detector, 0, 1000, 20), 1);
    feed(detector, 1000, 1500, 20, 0.01);
    assert.equal(feed(detector, 1500, 2500, 20), 0);
});
test('reset permits a fresh activity', () => {
    const detector = createBlowDetector();
    assert.equal(feed(detector, 0, 500, 20), 1);
    detector.reset();
    assert.equal(feed(detector, 1000, 1500, 20), 1);
});
test('spoken feedback cannot rearm the same long breath', () => {
    const detector = createBlowDetector();
    assert.equal(feed(detector, 0, 500, 20), 1);
    detector.pause();
    assert.equal(feed(detector, 2000, 3500, 20), 0);
    feed(detector, 3500, 4000, 0);
    assert.equal(feed(detector, 4000, 4500, 20), 1);
});


test('diagnostics distinguish a weak sample from a sustained louder sample', () => {
    const weak = context.summarizeCalibration(samples(2, 0.1), samples(4, 0.1));
    assert.equal(weak.requiredLoudness, 5);
    assert.equal(weak.blowing.median, 4);
    assert.equal(weak.samplesAboveCutoff, 0);
    assert.equal(weak.failedChecks.length, 2);
    const strong = context.summarizeCalibration(samples(2, 0.1), samples(12, 0.1));
    assert.equal(strong.failedChecks.length, 0);
    assert.ok(strong.longestBlowMs > 250);
});

test('diagnostics expose low sample cadence and tolerate missing samples', () => {
    const sparse = samples(12, 0.1, 40).map((sample, i) => ({ ...sample, time: i * 150 }));
    const report = context.summarizeCalibration(samples(2, 0.1), sparse);
    assert.equal(report.blowing.medianFrameGapMs, 150);
    assert.equal(report.longestBlowMs, 0);
    assert.equal(context.summarizeCalibration([], []).quiet.samples, 0);
});
