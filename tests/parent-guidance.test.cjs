const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createBlowingReminder } = require('../js/parent-guidance.js');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

test('reminder appears once after five seconds, clears on a blow, and can recur', () => {
    let shown = 0, hidden = 0;
    const reminder = createBlowingReminder({ show() { shown++; }, hide() { hidden++; } });
    for (let now = 0; now <= 4900; now += 100) reminder.update(now, true);
    assert.equal(shown, 0);
    reminder.update(5000, true); reminder.update(5100, true);
    assert.equal(shown, 1);
    reminder.reset(); assert.equal(hidden, 1);
    for (let now = 5200; now <= 10200; now += 100) reminder.update(now, true);
    assert.equal(shown, 2);
});

test('inactive time and a suspended frame loop do not count toward the reminder', () => {
    let shown = 0;
    const reminder = createBlowingReminder({ show() { shown++; }, hide() {} });
    reminder.update(0, true); reminder.update(500, true);
    reminder.update(1000, false); reminder.update(10000, true);
    for (let now = 10100; now <= 14900; now += 100) reminder.update(now, true);
    assert.equal(shown, 0);
    reminder.update(20000, true); assert.equal(shown, 0);
    for (let now = 20100; now <= 25000; now += 100) reminder.update(now, true);
    assert.equal(shown, 1);
});

function app() {
    const elements = new Map(), timers = new Map(), frames = new Map();
    let id = 0;
    const element = name => {
        if (!elements.has(name)) {
            const classes = new Set();
            elements.set(name, {
                hidden: name === 'blowing-help', style: {}, handlers: {}, checked: false,
                classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c) },
                addEventListener(event, handler) { this.handlers[event] = handler; }, focus() {},
                querySelectorAll() { return []; }
            });
        }
        return elements.get(name);
    };
    const context = vm.createContext({
        console, calibrationSession: null,
        document: { hidden: false, activeElement: element('settings-trigger'), getElementById: element,
            querySelectorAll: () => [], addEventListener() {} },
        requestAnimationFrame(callback) { const key = ++id; frames.set(key, callback); return key; },
        setTimeout(callback) { const key = ++id; timers.set(key, callback); return key; },
        clearTimeout(key) { timers.delete(key); }, cancelAnimationFrame() {},
        activeBlowDetector: { reset() {} }, cancelCalibration() {},
        speechSynthesis: { speaking: false, pending: false, cancel() {} }, addEventListener() {}
    });
    context.window = context;
    for (const file of ['parent-guidance.js', 'app.js']) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', file), 'utf8'), context);
    }
    return {
        element, context, timers,
        run: code => vm.runInContext(code, context),
        tick(now) { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(now)); },
        wait(start, end) { for (let now = start; now <= end; now += 100) this.tick(now); }
    };
}

test('app reminder excludes menu, speech, parent settings, calibration, and celebration', () => {
    const instance = app();
    instance.wait(0, 6000);
    assert.equal(instance.element('blowing-help').hidden, true);
    instance.run('currentActivity = "bubbles"; activityScreen.classList.add("active-screen")');
    instance.context.speechSynthesis.speaking = true;
    instance.wait(6100, 12200);
    assert.equal(instance.element('blowing-help').hidden, true);
    instance.context.speechSynthesis.speaking = false;
    instance.element('settings-modal').style.display = 'flex';
    instance.wait(12300, 18400);
    assert.equal(instance.element('blowing-help').hidden, true);
    instance.element('settings-modal').style.display = 'none';
    instance.context.calibrationSession = {};
    instance.wait(18500, 24600);
    assert.equal(instance.element('blowing-help').hidden, true);
    instance.context.calibrationSession = null;
    instance.wait(24700, 29600);
    assert.equal(instance.element('blowing-help').hidden, true);
    instance.tick(29700);
    assert.equal(instance.element('blowing-help').hidden, false);
    instance.run('currentActivity = "celebrating"'); instance.tick(29800);
    assert.equal(instance.element('blowing-help').hidden, true);
});

test('real game blow entry clears the help immediately and settings also clears it', () => {
    const instance = app();
    instance.run('currentActivity = "bubbles"; activityScreen.classList.add("active-screen"); handleBubbleBlow = () => {}');
    instance.wait(0, 5000);
    assert.equal(instance.element('blowing-help').hidden, false);
    instance.run('handleBlow(50)');
    assert.equal(instance.element('blowing-help').hidden, true);
    instance.wait(5100, 10100);
    assert.equal(instance.element('blowing-help').hidden, false);
    instance.run('openSettings()');
    assert.equal(instance.element('blowing-help').hidden, true);
});

test('hold cancels on release and opens settings after a completed hold', () => {
    const instance = app(); const button = instance.element('settings-trigger');
    button.handlers.pointerdown({ button: 0, isPrimary: true });
    assert.equal(button.classList.contains('is-holding'), true);
    button.handlers.pointerup(); assert.equal(instance.timers.size, 0);
    assert.equal(button.classList.contains('is-holding'), false);
    button.handlers.pointerdown({ button: 0, isPrimary: true });
    [...instance.timers.values()][0]();
    assert.equal(instance.element('settings-modal').style.display, 'flex');
    assert.equal(button.classList.contains('is-holding'), false);
});
