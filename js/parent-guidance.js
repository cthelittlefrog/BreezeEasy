/* Five seconds of active, uninterrupted play without a detected blow. */
function createBlowingReminder({ show, hide, delay = 5000 }) {
    let started = null;
    let lastTick = null;
    let visible = false;
    function reset() {
        started = null;
        lastTick = null;
        if (visible) hide();
        visible = false;
    }
    return {
        reset,
        update(now, eligible) {
            if (!eligible) { reset(); return; }
            // A suspended animation loop must not count time away from the app.
            if (lastTick !== null && now - lastTick > 1000) reset();
            lastTick = now;
            started ??= now;
            if (!visible && now - started >= delay) {
                visible = true;
                show();
            }
        }
    };
}

if (typeof module !== "undefined" && module.exports) module.exports = { createBlowingReminder };
