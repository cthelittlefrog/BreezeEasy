const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function game() {
    const elements = new Map(), timers = new Map(), frames = new Map();
    let now = 0, id = 0;
    function element(name) {
        if (!elements.has(name)) {
            const classes = new Set(), properties = {};
            elements.set(name, {
                hidden: true, checked: false, textContent: '', handlers: {}, children: [],
                style: { setProperty(key, value) { properties[key] = value; }, properties },
                classList: { add(key) { classes.add(key); }, remove(key) { classes.delete(key); }, contains(key) { return classes.has(key); } },
                addEventListener(key, fn) { this.handlers[key] = fn; },
                appendChild(node) { this.children.push(node); }, remove() {}, focus() {},
                querySelectorAll() { return []; },
                getBoundingClientRect() {
                    return name === 'dragon-world' ? { left: 0, top: 0, width: 390, height: 844 } :
                        name === 'dragon-snout' ? { left: 85, top: 580, width: 220, height: 220 } :
                        { left: 110, top: 160, width: 170, height: 170 };
                }
            });
        }
        return elements.get(name);
    }
    const dots = Array.from({ length: 5 }, (_, i) => element(`dot-${i}`));
    const card = element('balloon-card'); card.dataset = { activity: 'balloon' };
    const context = vm.createContext({
        console, calibrationSession: null,
        document: { hidden: false, getElementById: element, createElement: () => element(`mote-${++id}`),
            querySelectorAll: selector => selector === '.meter-dot' ? dots : selector === '.activity-card' ? [card] : [],
            addEventListener() {} },
        requestAnimationFrame(callback) { const key = ++id; frames.set(key, callback); return key; }, cancelAnimationFrame(key) { frames.delete(key); },
        setTimeout(callback, delay) { const key = ++id; timers.set(key, { callback, due: now + delay }); return key; },
        clearTimeout(key) { timers.delete(key); }, activeBlowDetector: { reset() {} },
        setInterval() { return ++id; }, clearInterval() {},
        isPoofSpeaking: () => false, cancelPoofSpeech() {}, cancelCalibration() {}, addEventListener() {},
        speechSynthesis: { speaking: false, pending: false, cancel() {} }
    });
    context.window = context;
    for (const file of ['parent-guidance.js', 'app.js']) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', file), 'utf8'), context);
    }
    const run = code => vm.runInContext(code, context);
    run('speakActivityInstruction = () => {}; speakMessage = () => {}');
    const tick = time => {
        now = time;
        const pending = [...frames.values()]; frames.clear();
        pending.forEach(callback => callback(now));
    };
    return { element, context, run, dots, card, timers, frames, tick,
        advance(ms) {
            const end = now + ms;
            while (true) {
                const next = [...timers.entries()].filter(([, t]) => t.due <= end).sort((a, b) => a[1].due - b[1].due)[0];
                if (!next) break;
                now = next[1].due; timers.delete(next[0]); next[1].callback();
            }
            while (now < end) tick(Math.min(now + 20, end));
        }
    };
}

test('balloon menu starts partly inflated and each blow grows it without an idle timeout', () => {
    const g = game(); g.card.handlers.click(); g.tick(0);
    assert.equal(g.run('currentActivity'), 'balloon');
    assert.equal(g.element('balloon-world').style.properties['--balloon-scale'], 0.55);
    g.run('handleBlow(40)');
    assert.equal(g.run('blowCount'), 1);
    assert.ok(g.element('balloon-world').style.properties['--balloon-scale'] > 0.55);
    assert.ok(g.element('balloon-world').style.properties['--balloon-scale'] < 1);
    g.advance(15000);
    assert.equal(g.run('currentActivity'), 'balloon');
    assert.equal(g.element('balloon-world').classList.contains('is-released'), false);
});

test('full inflation settles before release; flight finishes before celebration and menu return', () => {
    const g = game(); g.card.handlers.click(); g.tick(0);
    for (let i = 0; i < 9; i++) g.run('handleBlow(50)');
    assert.equal(g.run('blowCount'), 5);
    assert.equal(g.element('balloon-world').style.properties['--balloon-scale'], 1);
    g.advance(749);
    assert.equal(g.run('currentActivity'), 'balloon-finishing');
    g.advance(1);
    assert.equal(g.run('currentActivity'), 'balloon-flying');
    assert.equal(g.element('balloon-world').classList.contains('is-released'), true);
    g.advance(4799);
    assert.equal(g.run('currentActivity'), 'balloon-flying');
    g.advance(1);
    assert.equal(g.run('currentActivity'), 'balloon-celebrating');
    assert.equal(g.element('balloon-world').classList.contains('is-finished'), true);
    g.advance(2999);
    assert.equal(g.run('currentActivity'), 'balloon-celebrating');
    g.advance(1);
    assert.equal(g.run('currentActivity'), null);
    assert.equal(g.element('menu-screen').classList.contains('active-screen'), true);
});

test('leaving or replaying cancels old balloon frames and resets inflation', () => {
    const g = game(); g.run('startBalloonActivity()'); g.tick(0);
    for (let i = 0; i < 5; i++) g.run('handleBlow(40)');
    g.advance(800);
    const oldFrame = g.frames.get(g.run('balloonAnimationId'));
    g.element('back-button').handlers.click();
    g.run('startBalloonActivity()');
    oldFrame(50000); g.tick(50000); g.advance(10000);
    assert.equal(g.run('currentActivity'), 'balloon');
    assert.equal(g.run('blowCount'), 0);
    assert.equal(g.element('balloon-world').style.properties['--balloon-scale'], 0.55);
});

test('parent settings pause both flight animation and stage timing', () => {
    const g = game(); g.run('startBalloonActivity()'); g.tick(0);
    for (let i = 0; i < 5; i++) g.run('handleBlow(40)');
    g.advance(750); g.advance(2000);
    const elapsed = g.run('balloonStageElapsed');
    const y = g.element('balloon-world').style.properties['--balloon-flight-y'];
    g.element('settings-modal').style.display = 'flex';
    g.run('syncBalloonPause()'); g.advance(15000);
    assert.equal(g.run('balloonStageElapsed'), elapsed);
    assert.equal(g.element('balloon-world').style.properties['--balloon-flight-y'], y);
    assert.equal(g.run('currentActivity'), 'balloon-flying');
    g.element('settings-modal').style.display = 'none';
    g.advance(2700);
    assert.equal(g.run('currentActivity'), 'balloon-flying');
    g.advance(200);
    assert.equal(g.run('currentActivity'), 'balloon-celebrating');
});

test('an older racecar return cannot close the balloon while it is being inflated', () => {
    const g = game();
    g.run('currentActivity = "racecar"; racecarPhase = "celebrating"; showRacecarCelebration(); startBalloonActivity()');
    g.tick(0); g.advance(5000);
    assert.equal(g.run('currentActivity'), 'balloon');
});

test('smooth balloon flight preserves the approved waypoints and never reverses height or size', () => {
    const g = game();
    for (const [time, x, y, scale] of [[0, 0, 0, 1], [1056, -0.25, -0.18, 0.9], [2784, 1, -0.6, 0.46], [4800, 0.35, -1.2, 0.08]]) {
        const sample = g.run(`sampleBalloonFlight(${time})`);
        assert.ok(Math.abs(sample.x - x) < 1e-9);
        assert.ok(Math.abs(sample.y - y) < 1e-9);
        assert.ok(Math.abs(sample.scale - scale) < 1e-9);
    }
    let before = g.run('sampleBalloonFlight(0)');
    for (let time = 16; time <= 4800; time += 16) {
        const next = g.run(`sampleBalloonFlight(${time})`);
        assert.ok(next.y < before.y);
        assert.ok(next.scale < before.scale);
        assert.ok(next.scale >= 0.08 - 1e-9);
        before = next;
    }
});

test('balloon flight has continuous velocity through its former stop points', () => {
    const g = game();
    for (const time of [1056, 2784]) {
        const before = g.run(`sampleBalloonFlight(${time - 0.1})`);
        const at = g.run(`sampleBalloonFlight(${time})`);
        const after = g.run(`sampleBalloonFlight(${time + 0.1})`);
        for (const key of ['x', 'y', 'scale']) {
            const inVelocity = (at[key] - before[key]) / 0.1;
            const outVelocity = (after[key] - at[key]) / 0.1;
            assert.ok(Math.abs(inVelocity - outVelocity) < 1e-6);
        }
        assert.ok(Math.abs((after.y - before.y) / 0.2) > 0.0001);
    }
});
