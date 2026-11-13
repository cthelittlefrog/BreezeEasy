const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function game() {
    const elements = new Map(), timers = new Map();
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
    const card = element('dragon-card'); card.dataset = { activity: 'dragon' };
    const context = vm.createContext({
        console, calibrationSession: null,
        document: { hidden: false, getElementById: element, createElement: () => element(`mote-${++id}`),
            querySelectorAll: selector => selector === '.meter-dot' ? dots : selector === '.activity-card' ? [card] : [],
            addEventListener() {} },
        requestAnimationFrame() { return ++id; }, cancelAnimationFrame() {},
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
    return { element, context, run, dots, card, timers,
        advance(ms) {
            const end = now + ms;
            while (true) {
                const next = [...timers.entries()].filter(([, t]) => t.due <= end).sort((a, b) => a[1].due - b[1].due)[0];
                if (!next) break;
                now = next[1].due; timers.delete(next[0]); next[1].callback();
            }
            now = end;
        }
    };
}

test('dragon card and real blow entry light the crystal after five arrivals, then return to menu', () => {
    const g = game(); g.card.handlers.click();
    assert.equal(g.run('currentActivity'), 'dragon');
    for (let i = 0; i < 5; i++) {
        g.run('handleBlow(40)');
        assert.equal(g.run('blowCount'), i);
        g.advance(850);
        assert.equal(g.run('blowCount'), i + 1);
        assert.equal(g.element('dragon-world').style.properties['--charge'], (i + 1) / 5);
    }
    assert.equal(g.run('currentActivity'), 'dragon-celebrating');
    assert.equal(g.element('dragon-crystal').classList.contains('is-lit'), true);
    assert.equal(g.element('dragon-world').classList.contains('is-lit'), true);
    assert.equal(g.element('dragon-lit-message').hidden, false);
    assert.equal(g.dots.filter(d => d.classList.contains('active')).length, 5);
    g.run('handleBlow(40)'); g.advance(3999);
    assert.equal(g.run('currentActivity'), 'dragon-celebrating');
    assert.equal(g.element('dragon-world').classList.contains('is-lit'), true);
    g.advance(1);
    assert.equal(g.run('currentActivity'), null);
    assert.equal(g.run('blowCount'), 0);
    assert.equal(g.element('menu-screen').classList.contains('active-screen'), true);
});

test('leaving mid-breath cancels pending rewards, and replay starts empty', () => {
    const g = game(); g.run('startDragonActivity(); handleBlow(40)');
    const oldCallbacks = [...g.timers.values()].map(t => t.callback);
    g.element('back-button').handlers.click();
    g.run('startDragonActivity()');
    oldCallbacks.forEach(fn => fn()); // Simulate an already queued stale callback.
    g.advance(2000);
    assert.equal(g.run('blowCount'), 0);
    assert.equal(g.run('currentActivity'), 'dragon');
    assert.equal(g.run('dragonAcceptedBlows'), 0);
});

test('fast extra inputs cannot overfill the five-blow target', () => {
    const g = game(); g.run('startDragonActivity()');
    for (let i = 0; i < 12; i++) g.run('handleBlow(50)');
    assert.equal(g.run('dragonAcceptedBlows'), 5);
    assert.equal(g.run('currentActivity'), 'dragon-finishing');
    g.advance(850);
    assert.equal(g.run('blowCount'), 5);
});

test('parent settings pause delayed rewards and leaving during celebration cancels return', () => {
    const g = game(); g.run('startDragonActivity(); handleBlow(40)');
    g.element('settings-modal').style.display = 'flex'; g.advance(2000);
    assert.equal(g.run('blowCount'), 0);
    g.element('settings-modal').style.display = 'none'; g.advance(200);
    assert.equal(g.run('blowCount'), 1);
    for (let i = 0; i < 4; i++) g.run('handleBlow(40)');
    g.advance(850);
    assert.equal(g.run('currentActivity'), 'dragon-celebrating');
    g.element('back-button').handlers.click(); g.run('startDragonActivity()'); g.advance(4000);
    assert.equal(g.run('currentActivity'), 'dragon');
    assert.equal(g.run('blowCount'), 0);
    assert.equal(g.element('dragon-world').classList.contains('is-lit'), false);
});

test('breath targets the gem face above the pedestal rather than traveling through it', () => {
    const g = game(); g.run('startDragonActivity(); handleBlow(40)');
    const motes = g.element('dragon-breath-trail').children;
    assert.ok(motes.some(mote => mote.className.includes('sparkle')));
    const faceY = (160 + 170 * 0.38) / 844 * 100;
    for (const mote of motes) {
        assert.equal(parseFloat(mote.style.properties['--to-y']), faceY);
        const destinationX = parseFloat(mote.style.properties['--to-x']) / 100 * 390;
        assert.ok(destinationX >= 110 + 170 * 0.42);
        assert.ok(destinationX <= 110 + 170 * 0.58);
        assert.ok(parseFloat(mote.style.properties['--from-y']) > faceY);
    }
});

test('an old bubbles celebration cannot return a new dragon activity to the menu', () => {
    const g = game();
    g.run('currentActivity = "celebrating"; showActivityCelebration(); startDragonActivity()');
    g.advance(4000);
    assert.equal(g.run('currentActivity'), 'dragon');
    assert.equal(g.element('activity-screen').classList.contains('active-screen'), true);
});

test('an old racecar celebration cannot return a new dragon activity to the menu', () => {
    const g = game();
    g.run('currentActivity = "racecar"; racecarPhase = "celebrating"; showRacecarCelebration(); startDragonActivity()');
    g.advance(4000);
    assert.equal(g.run('currentActivity'), 'dragon');
});

test('a delayed bubbles celebration cannot start after switching to dragon', () => {
    const g = game(); g.run('startDragonActivity(); showActivityCelebration()');
    g.advance(5000);
    assert.equal(g.run('currentActivity'), 'dragon');
    assert.equal(g.element('activity-poof').classList.contains('poof-center-celebration'), false);
});

test('bubbles and racecar still return automatically after their own celebrations', () => {
    for (const setup of [
        'currentActivity = "celebrating"; showActivityCelebration()',
        'currentActivity = "racecar"; racecarPhase = "celebrating"; showRacecarCelebration()'
    ]) {
        const g = game(); g.run(setup);
        g.advance(2999);
        assert.notEqual(g.run('currentActivity'), null);
        g.advance(1);
        assert.equal(g.run('currentActivity'), null);
        assert.equal(g.element('menu-screen').classList.contains('active-screen'), true);
    }
});
