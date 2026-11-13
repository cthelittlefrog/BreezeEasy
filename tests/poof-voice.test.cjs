const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function app(voices = []) {
    const elements = new Map(), spoken = [];
    let finishes = 0;
    function element(id) {
        if (!elements.has(id)) elements.set(id, {
            checked: true, style: {}, handlers: {},
            classList: { add() {}, remove() {}, contains() { return false; } },
            addEventListener(event, callback) { this.handlers[event] = callback; }
        });
        return elements.get(id);
    }
    const context = vm.createContext({
        console, calibrationSession: null,
        document: { getElementById: element, querySelectorAll() { return []; }, addEventListener() {} },
        requestAnimationFrame() { return 1; }, cancelAnimationFrame() {}, setTimeout() { return 1; }, clearTimeout() {},
        activeBlowDetector: { reset() {} }, cancelPoofSpeech() {}, isPoofSpeaking() { return false; }, addEventListener() {},
        pauseForPoofSpeech() { return () => { finishes++; }; },
        speechSynthesis: { getVoices: () => voices, speak: speech => spoken.push(speech) },
        SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } }
    });
    context.window = context;
    for (const file of ['parent-guidance.js', 'app.js']) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', file), 'utf8'), context);
    }
    return { element, spoken, voices, get finishes() { return finishes; }, run: code => vm.runInContext(code, context) };
}

test('Poof selects a friendly available English voice and preserves speech handoff callbacks', () => {
    const samantha = { name: 'Samantha', lang: 'en-US', localService: true };
    const g = app([{ name: 'System Default', lang: 'es-GT', default: true }, samantha]);
    g.run('speakMessage("Hello!")');
    assert.equal(g.spoken[0].voice, samantha);
    assert.equal(g.spoken[0].lang, 'en-US');
    assert.equal(g.spoken[0].pitch, 1.65);
    g.spoken[0].onend(); assert.equal(g.finishes, 1);
});

test('speech works before voices load and uses a newly available English voice next time', () => {
    const g = app(); g.run('speakMessage("Hello!")');
    assert.equal(g.spoken[0].lang, 'en-US');
    const english = { name: 'Google US English', lang: 'en-US' };
    g.voices.push({ name: 'Spanish Default', lang: 'es-ES', default: true }, english);
    g.run('speakMessage("Ready to blow?")');
    assert.equal(g.spoken[1].voice, english);
});

test('Hear Poof previews the new voice and respects the Voice toggle', () => {
    const g = app(); g.element('preview-poof-voice').handlers.click();
    assert.match(g.spoken[0].text, /I'm Poof/);
    g.element('voice-toggle').checked = false;
    g.element('voice-toggle').handlers.change();
    assert.equal(g.element('preview-poof-voice').disabled, true);
    g.run('speakMessage("Hello!")');
    assert.equal(g.spoken.length, 1);
});
