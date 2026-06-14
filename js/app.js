/* =====================================================
   SCREEN ELEMENTS
   ===================================================== */

const menuScreen = document.getElementById("menu-screen");                 // Main menu screen
const activityScreen = document.getElementById("activity-screen");         // Activity screen
const celebrationScreen = document.getElementById("celebration-screen");   // Celebration screen

/* =====================================================
   ACTIVITY ELEMENTS
   ===================================================== */

const activityCards = document.querySelectorAll(".activity-card");         // Menu activity buttons
const activityArea = document.getElementById("activity-area");             // Dynamic activity area
const backButton = document.getElementById("back-button");                 // Back button
const testBlowButton = document.getElementById("test-blow");               // Temporary test button

/* =====================================================
   BLOW METER ELEMENTS
   ===================================================== */

const meterDots = document.querySelectorAll(".meter-dot");                 // Blow meter dots

/* =====================================================
   SETTINGS ELEMENTS
   ===================================================== */

const settingsTrigger = document.getElementById("settings-trigger");       // Cloud settings button
const settingsModal = document.getElementById("settings-modal");           // Settings modal
const closeSettingsButton = document.getElementById("close-settings");     // Close settings button
const voiceToggle = document.getElementById("voice-toggle");               // Voice checkbox

/* =====================================================
   CELEBRATION ELEMENTS
   ===================================================== */

const celebrationMessage = document.getElementById("celebration-message"); // Celebration text

/* =====================================================
   ACTIVITY STATE
   ===================================================== */

let currentActivity = null;                                                // Tracks current activity
let blowCount = 0;                                                         // Tracks completed blows
let requiredBlows = 5;                                                     // Tracks needed blows
let celebrationSparkleTimer;                                               // Tracks sparkle loop

let racecarProgress = 0;                                                    // Small car movement during race
let racecarVelocity = 0;                                                    // Current car speed
let raceRoadOffset = 0;                                                     // Road scrolling amount
let raceRoadSpeed = 0;                                                      // Road scrolling speed
let racecarPhase = "idle";                                                  // idle, racing, finishing
let racecarAnimationId = null;                                               // Tracks animation loop
let racecarTireFrame = 0;                                                    // Tracks tire frame
let raceFinishReady = false;                                                // Tracks when car is ready to cross finish
let raceFinishProgress = 0;                                                // Tracks race progress for meter
let raceFinishStartOffset = 0;                                              // Saves road position when finish appears

/* =====================================================
   MESSAGE POOLS
   ===================================================== */

const bubbleMessages = [
    "Blow bubbles!",
    "More bubbles!",
    "Wow!",
    "Keep blowing!",
    "Look at them go!"
];

const racecarMessages = [
    "Go car go!",
    "Vroom!",
    "Keep blowing!",
    "Almost there!",
    "Fast car!"
];

const racecarCelebrationMessages = [
    "You won the race!",
    "Great driving!",
    "Poof is proud of you!",
    "Amazing race!"
];

const celebrationMessages = [
    "You did it!",
    "Amazing bubbles!",
    "Poof is proud of you!",
    "Great job!",
    "Bubble magic!"
];

/* =====================================================
   HELPER FUNCTIONS
   ===================================================== */

function getRandomMessage(messageArray) {
    return messageArray[Math.floor(Math.random() * messageArray.length)];   // Returns a random message
}

function speakMessage(message) {
    if (!voiceToggle || !voiceToggle.checked) return;                       // Stops voice if setting is off
    if (!window.speechSynthesis) return;                                    // Stops if browser does not support speech

    speechSynthesis.cancel();                                               // Prevents messages from stacking

    const speech = new SpeechSynthesisUtterance(message);                   // Creates spoken message

    speech.rate = 0.9;                                                      // Toddler-friendly pace
    speech.pitch = 1.4;                                                     // Softer playful voice
    speech.volume = 0.8;                                                    // Comfortable volume

    speechSynthesis.speak(speech);                                          // Speaks message
}

function showScreen(screenToShow) {
    menuScreen.classList.remove("active-screen");                          // Hides menu
    activityScreen.classList.remove("active-screen");                      // Hides activity
    celebrationScreen.classList.remove("active-screen");                   // Hides celebration

    screenToShow.classList.add("active-screen");                           // Shows selected screen
}

function resetMeter() {
    blowCount = 0;                                                          // Resets blow count

    meterDots.forEach(dot => {
        dot.classList.remove("active");                                    // Clears active dots
    });
}

function updateMeter() {
    meterDots.forEach(dot => {
        dot.classList.remove("active");                                    // Clears meter first
    });

    for (let i = 0; i < blowCount; i++) {
        const index = meterDots.length - 1 - i;                             // Fills from bottom upward

        if (meterDots[index]) {
            meterDots[index].classList.add("active");                      // Activates dot
        }
    }
}

/* =====================================================
   START BUBBLES ACTIVITY
   ===================================================== */

function startBubbleActivity() {
    currentActivity = "bubbles";                                            // Starts bubbles activity
    blowCount = 0;                                                          // Resets progress
    requiredBlows = 5;                                                      // Resets goal

    resetMeter();                                                           // Clears meter
    showScreen(activityScreen);                                             // Opens activity screen

    const activityPoof = document.getElementById("activity-poof");          // Gets activity Poof

    if (activityPoof) {
        activityPoof.classList.remove("poof-center-celebration");           // Resets Poof from celebration
    }

    loadBubbleActivity();                                                   // Loads fresh bubble world
    speakMessage("Blow bubbles!");                                          // Audio instruction
}

/* =====================================================
   START RACECAR ACTIVITY
   ===================================================== */

function startRacecarActivity() {
    currentActivity = "racecar";                                           // Starts racecar activity
    blowCount = 0;                                                         // Resets progress
    requiredBlows = 5;                                                     // Sets race goal

    racecarProgress = 0;
    racecarVelocity = 0;
    raceRoadOffset = 0;
    raceRoadSpeed = 0;
    racecarTireFrame = 0;                                                  // Resets tire animation
    racecarPhase = "racing";
    raceFinishReady = false;                                                    // Resets finish readiness
    raceFinishProgress = 0;                                                     // Resets race meter progress

    if (racecarAnimationId) {
        cancelAnimationFrame(racecarAnimationId);                          // Stops old car animation loop
        racecarAnimationId = null;                                         // Clears animation tracker
    }

    resetMeter();                                                          // Clears meter
    showScreen(activityScreen);                                            // Opens activity screen

    const activityPoof = document.getElementById("activity-poof");         // Gets activity Poof

    if (activityPoof) {
        activityPoof.classList.remove("poof-center-celebration");          // Resets Poof from celebration
    }

    loadRacecarActivity();                                                 // Loads fresh racecar world
    speakMessage("Blow the racecar!");                                     // Audio instruction
    startRacecarMotion();                                                      // Starts gentle road movement
}

/* =====================================================
   LOAD BUBBLE ACTIVITY
   ===================================================== */

function loadBubbleActivity() {
    activityArea.innerHTML = `
        <div id="bubble-world">

            <div class="bubble-cloud bubble-cloud-left"></div>
            <div class="bubble-cloud bubble-cloud-right"></div>

            <div id="bubble-container"></div>

            <div id="bubble-wand">
                <div class="wand-ring"></div>
                <div class="wand-stick"></div>
            </div>

        </div>
    `;
}

/* =====================================================
   LOAD RACECAR ACTIVITY
   ===================================================== */

function loadRacecarActivity() {
    activityArea.innerHTML = `
        <div id="racecar-world">

            <div id="racecar-road">
                <div id="racecar-finish-line"></div>
            
                <div class="road-line road-line-one"></div>
                <div class="road-line road-line-two"></div>
                <div class="road-line road-line-three"></div>
                <div class="road-line road-line-four"></div>
            </div>

            <div id="racecar">
                <div class="racecar-tire tire-front-left"></div>
                <div class="racecar-tire tire-front-right"></div>

                <div id="racecar-body">
                    <div id="racecar-window"></div>
                </div>

                <div class="racecar-tire tire-back-left"></div>
                <div class="racecar-tire tire-back-right"></div>
            </div>

        </div>
    `;
}

/* =====================================================
   CREATE REALISTIC BUBBLES
   ===================================================== */

function createBubbleBurst(blowStrength = 45) {
    const container = document.getElementById("bubble-container");          // Bubble holding area

    if (!container) return;                                                 // Stops if bubbles are not loaded

    const strength = Math.min(Math.max(blowStrength / 55, 0.8), 2.2);       // Converts mic volume into motion strength
    const bubbleTotal = 5;                                                  // Number of bubbles per blow

    for (let i = 0; i < bubbleTotal; i++) {

        setTimeout(() => {                                                  // Staggers bubbles so they form one at a time
            const bubble = document.createElement("div");                   // Creates bubble
            const size = 55 + Math.random() * 95;                           // Large toddler-friendly bubbles
            const startOffset = -12 + Math.random() * 8;                   // Keeps bubbles centered at wand
            const direction = i - (bubbleTotal - 1) / 2;                    // Creates balanced left/right fan
            const drift = (direction * 0.65 + (-0.4 + Math.random() * 0.8)) * strength; // Balanced side push
            const lift = (1.3 + Math.random() * 1.2) * strength;            // Upward speed based on blow strength
            const wobble = 0.25 + Math.random() * 0.45;                     // Very gentle natural wobble

            bubble.classList.add("bubble");                                // Adds bubble styling

            bubble.style.width = `${size}px`;                               // Sets bubble width
            bubble.style.height = `${size}px`;                              // Sets bubble height
            bubble.style.left = `calc(50% + ${startOffset}px)`;             // Starts close to wand center
            bubble.style.bottom = `calc(var(--wand-stick-h) + 45px)`;       // Starts at wand ring

            container.appendChild(bubble);                                  // Adds bubble to screen

            animateRealBubble(bubble, drift, lift, wobble, strength);       // Starts realistic movement
        }, i * 140);                                                        // Delay between bubbles
    }
}

/* =====================================================
   REALISTIC BUBBLE MOTION
   ===================================================== */

function animateRealBubble(bubble, drift, lift, wobble, strength = 1) {
    let x = 0;                                                              // Current sideways position
    let y = 0;                                                              // Current upward position
    let age = 0;                                                            // Animation frame count

    const life = 180 + Math.random() * 90;                                  // How long bubble lives
    const popAtEnd = Math.random() > 0.45;                                  // Some bubbles pop

    function moveBubble() {
        age++;                                                              // Ages the bubble

        x += drift + Math.sin(age * 0.045) * wobble;                        // Natural side movement
        y += lift + Math.sin(age * 0.025) * 0.25;                           // Natural upward movement

        bubble.style.transform =
            `translate(${x}px, ${-y}px) scale(${1 + age / life * 0.12})`;    // Moves and slightly grows

        if (age >= life) {
            if (popAtEnd) {
                popBubble(bubble);                                          // Pops bubble
            } else {
                bubble.remove();                                            // Removes bubble quietly
            }

            return;
        }

        requestAnimationFrame(moveBubble);                                  // Continues animation
    }

    moveBubble();
}

/* =====================================================
   POP BUBBLE
   ===================================================== */

function popBubble(bubble) {
    bubble.classList.add("bubble-popping");                                // Adds pop styling

    setTimeout(() => {
        bubble.remove();                                                    // Removes after pop
    }, 220);
}

/* =====================================================
   WAND REACTION
   ===================================================== */

function animateBubbleWand() {
    const wand = document.getElementById("bubble-wand");                    // Gets wand

    if (!wand) return;                                                      // Stops if wand is missing

    wand.classList.remove("wand-blow");                                    // Resets animation
    void wand.offsetWidth;                                                  // Forces animation restart
    wand.classList.add("wand-blow");                                       // Plays animation
}

/* =====================================================
   RACECAR MOVEMENT
   ===================================================== */

function handleRacecarBlow(blowStrength = 45) {
    if (racecarPhase !== "racing" && racecarPhase !== "finishing") return; // Allows race and finish

    const pushStrength = Math.min(Math.max(blowStrength / 45, 0.8), 2.2);  // Converts blow strength

    if (racecarPhase === "racing") {
        raceFinishProgress += 1 * pushStrength;                            // Progress depends on blow strength

        blowCount = Math.min(
            Math.floor((raceFinishProgress / 5) * requiredBlows),
            requiredBlows
        );                                                                 // Meter fills based on race progress

        updateMeter();                                                     // Updates meter

        moveRacecar(blowStrength);                                         // Moves road and nudges car

        if (raceFinishProgress >= 5 && !raceFinishReady) {
            raceFinishReady = true;                                        // Finish is ready
            racecarPhase = "finishing";                                    // Changes to final phase
            blowCount = requiredBlows;                                     // Keeps meter full at finish
            updateMeter();                                                 // Shows full meter
            showRacecarFinishLine();                                       // Shows finish line
        }
    }

    if (racecarPhase === "finishing") {
        racecarVelocity += 1.35 * pushStrength;                            // Final blow carries car across
        raceRoadSpeed += 3.2 * pushStrength;                               // Keeps road moving during finish
        startRacecarMotion();                                              // Continues movement
    }

    createRacecarWindEffect();                                             // Adds wind puff

    const message = getRandomMessage(racecarMessages);                     // Gets racecar message
    speakMessage(message);                                                 // Speaks message
}

function moveRacecar(blowStrength = 45) {
    const racecar = document.getElementById("racecar");                    // Gets racecar

    if (!racecar) return;                                                  // Stops if missing

    const pushStrength = Math.min(Math.max(blowStrength / 45, 0.8), 1.8);  // Converts blow strength

    racecarVelocity += 0.18 * pushStrength;                                // Small car nudge
    raceRoadSpeed += 3.4 * pushStrength;                                   // Main racing illusion

    racecar.classList.remove("racecar-bounce");                           // Resets bounce
    void racecar.offsetWidth;                                              // Restarts animation
    racecar.classList.add("racecar-bounce");                              // Plays bounce

    startRacecarMotion();                                                  // Starts motion loop
}

function startRacecarMotion() {
    if (racecarAnimationId) return;                                        // Prevents duplicate loops

    function animateCar() {
        const racecar = document.getElementById("racecar");                // Gets car
        const road = document.getElementById("racecar-road");              // Gets road

        if (!racecar || !road) {
            racecarAnimationId = null;                                     // Clears loop if missing
            return;
        }

        const idleRoadSpeed = racecarPhase === "idle" ? 0 : 0.25;                  // Keeps road gently moving

        raceRoadOffset += Math.max(raceRoadSpeed, idleRoadSpeed);                  // Scrolls road even without blowing
        raceRoadSpeed *= 0.94;                                                     // Road slows naturally
        racecarVelocity *= 0.92;                                           // Car nudge slows
        racecarProgress += racecarVelocity;                                // Moves car slightly

        if (racecarPhase === "racing") {
            racecarProgress = Math.min(racecarProgress, 7);                         // Keeps car mostly in place
        }

        if (racecarPhase === "finishing") {
            racecarProgress += racecarVelocity * 1.15;                              // Final blow carries car across finish
            racecarProgress = Math.min(racecarProgress, 82);                        // Stops after full car crosses
        }

        moveRoadLines();                                                           // Moves and recycles road lines

        racecar.style.transform =
            `translateX(-50%) translateY(-${racecarProgress}vh)`;          // Nudges car upward

        if (racecarPhase === "finishing" && racecarProgress >= 48) {
            racecarPhase = "celebrating";                                          // Stops more blow input
            racecarVelocity = 0;                                                    // Stops car
            racecarAnimationId = null;                                              // Clears animation loop
            showRacecarCelebration();                                               // Starts celebration
            return;
        }

        if (racecarPhase === "racing" || racecarPhase === "finishing" || raceRoadSpeed > 0.08 || racecarVelocity > 0.01) {
            animateRacecarTires();                                         // Spins tires while moving
            racecarAnimationId = requestAnimationFrame(animateCar);        // Keeps animation going
        } else {
            raceRoadSpeed = 0;                                             // Fully stops road
            racecarVelocity = 0;                                           // Fully stops car
            racecarAnimationId = null;                                     // Clears tracker
        }
    }

    racecarAnimationId = requestAnimationFrame(animateCar);                // Starts animation
}

function moveRoadLines() {
    const roadLines = document.querySelectorAll(".road-line");             // Gets road stripes

    roadLines.forEach((line, index) => {
        const baseTop = -10 + index * 30;                                  // Spaces lines evenly
        const loopedOffset = raceRoadOffset % 120;                         // Loops road movement

        line.style.top = `${baseTop + loopedOffset}%`;                     // Moves line downward

        if (baseTop + loopedOffset > 105) {
            line.style.top = `${baseTop + loopedOffset - 120}%`;           // Sends line back to top
        }
    });

    const finishLine = document.getElementById("racecar-finish-line");          // Gets finish line

    if (finishLine && raceFinishReady) {
        const finishTop = -60 + (raceRoadOffset - raceFinishStartOffset);
        finishLine.style.top = `${finishTop}%`;                                 // Updates finish position
    }
}

function showRacecarFinishLine() {
    const finishLine = document.getElementById("racecar-finish-line");      // Gets finish line

    if (!finishLine) return;                                                // Stops if missing

    raceFinishStartOffset = raceRoadOffset;                                 // Captures road position once
    finishLine.classList.add("finish-line-active");                        // Activates moving finish line
}

function animateRacecarTires() {
    const tires = document.querySelectorAll(".racecar-tire");              // Gets all tires

    racecarTireFrame = (racecarTireFrame + 1) % 3;                         // Cycles 0, 1, 2

    tires.forEach(tire => {
        tire.classList.remove("tire-frame-1", "tire-frame-2", "tire-frame-3"); // Clears frames
        tire.classList.add(`tire-frame-${racecarTireFrame + 1}`);          // Adds current frame
    });
}

function createRacecarWindEffect() {
    const racecarWorld = document.getElementById("racecar-world");         // Gets racecar world

    if (!racecarWorld) return;                                             // Stops if missing

    const wind = document.createElement("div");                            // Creates wind puff

    wind.classList.add("racecar-wind");                                    // Adds wind styling
    wind.textContent = "💨";                                                // Temporary wind visual

    racecarWorld.appendChild(wind);                                        // Adds to screen

    setTimeout(() => {
        wind.remove();                                                     // Removes wind puff
    }, 900);
}

/* =====================================================
   WIND EFFECT
   ===================================================== */

function createWindEffect() {
    const wind = document.createElement("div");                             // Creates wind puff

    wind.classList.add("wind-effect");                                      // Adds wind styling
    wind.textContent = "🌬️";                                                // Temporary visual wind

    activityArea.appendChild(wind);                                         // Adds to activity area

    setTimeout(() => {
        wind.remove();                                                      // Removes wind puff
    }, 1200);
}

/* =====================================================
   HANDLE BUBBLE BLOW
   ===================================================== */

function handleBubbleBlow(blowStrength = 45) {
    blowCount++;                                                           // Counts one completed blow

    updateMeter();                                                         // Updates meter
    createBubbleBurst(blowStrength);                                       // Creates bubbles
    createWindEffect();                                                    // Creates wind
    animateBubbleWand();                                                   // Animates wand

    const message = getRandomMessage(bubbleMessages);                      // Gets random bubble message
    speakMessage(message);                                                 // Speaks message

    if (blowCount >= requiredBlows) {
        currentActivity = "celebrating";                                   // Prevents extra blows
        setTimeout(showActivityCelebration, 2000);                         // Starts celebration
    }
}

/* =====================================================
   HANDLE BLOW
   Called by microphone.js and Test Blow button
   ===================================================== */

function handleBlow(blowStrength = 45) {
    if (currentActivity === "bubbles") {
        handleBubbleBlow(blowStrength);                                    // Sends blow to bubbles
        return;
    }

    if (currentActivity === "racecar") {
        handleRacecarBlow(blowStrength);                                   // Sends blow to racecar
        return;
    }
}

/* =====================================================
   SHOW ACTIVITY CELEBRATION
   ===================================================== */

function showActivityCelebration() {
    const activityPoof = document.getElementById("activity-poof");          // Gets activity Poof

    if (activityPoof) {
        activityPoof.classList.add("poof-center-celebration");              // Moves Poof to center
    }

    startCelebrationSparkles();                                             // Starts sparkles

    const message = getRandomMessage(celebrationMessages);                  // Gets celebration message
    speakMessage(message);                                                  // Audio only

    setTimeout(() => {
        if (activityPoof) {
            activityPoof.classList.remove("poof-center-celebration");       // Resets Poof
        }

        stopCelebrationSparkles();                                          // Stops sparkles
        currentActivity = null;                                             // Fully resets activity state
        resetMeter();                                                       // Clears meter
        showScreen(menuScreen);                                             // Returns to menu
    }, 3000);
}

/* =====================================================
   SHOW RACECAR CELEBRATION
   ===================================================== */

function showRacecarCelebration() {
    const activityPoof = document.getElementById("activity-poof");         // Gets activity Poof

    if (activityPoof) {
        activityPoof.classList.add("poof-center-celebration");             // Moves Poof to center
    }

    startCelebrationSparkles();                                            // Starts sparkles

    const message = getRandomMessage(racecarCelebrationMessages);          // Gets racecar celebration message
    speakMessage(message);                                                 // Audio only

    setTimeout(() => {

        if (activityPoof) {
            activityPoof.classList.remove("poof-center-celebration");
        }

        stopCelebrationSparkles();

        currentActivity = null;

        racecarProgress = 0;
        racecarVelocity = 0;
        raceRoadOffset = 0;
        raceRoadSpeed = 0;
        racecarPhase = "idle";
        raceFinishReady = false;                                                    // Resets finish state
        raceFinishProgress = 0;                                                     // Resets race progress

        resetMeter();

        showScreen(menuScreen);

    }, 3000);
}

/* =====================================================
   CELEBRATION SPARKLES
   ===================================================== */
function startCelebrationSparkles() {
    stopCelebrationSparkles();                                              // Prevents duplicate sparkle timers

    createCelebrationSparkles();                                            // Starts immediately

    celebrationSparkleTimer = setInterval(() => {
        createCelebrationSparkles();                                        // Keeps sparkles going
    }, 450);
}

function stopCelebrationSparkles() {
    if (celebrationSparkleTimer) {
        clearInterval(celebrationSparkleTimer);                             // Stops sparkle loop
        celebrationSparkleTimer = null;                                     // Clears timer
    }
}

function createCelebrationSparkles() {
    const bubbleWorld = document.getElementById("bubble-world");            // Keeps sparkles in bubble screen

    if (!bubbleWorld) return;

    for (let i = 0; i < 12; i++) {
        const sparkle = document.createElement("div");

        sparkle.classList.add("celebration-sparkle");

        sparkle.style.left = `${35 + Math.random() * 30}%`;
        sparkle.style.top = `${28 + Math.random() * 34}%`;
        sparkle.style.animationDelay = `${Math.random() * 0.15}s`;
        sparkle.style.setProperty("--sparkle-x", `${-120 + Math.random() * 240}px`);
        sparkle.style.setProperty("--sparkle-y", `${-120 + Math.random() * 240}px`);

        bubbleWorld.appendChild(sparkle);

        setTimeout(() => {
            sparkle.remove();
        }, 1800);
    }
}


/* =====================================================
   ACTIVITY CARD EVENTS
   ===================================================== */

activityCards.forEach(card => {
    card.addEventListener("click", () => {
        const activityName = card.dataset.activity;                         // Gets selected activity

        if (activityName === "bubbles") {
            startBubbleActivity();                                                 // Starts bubbles
        }

        if (activityName === "racecar") {
            startRacecarActivity();                                                // Starts racecar
        }
    });
});

/* =====================================================
   BACK BUTTON
   ===================================================== */

backButton.addEventListener("click", () => {
    currentActivity = null;

    racecarProgress = 0;
    racecarVelocity = 0;
    raceRoadOffset = 0;
    raceRoadSpeed = 0;
    racecarPhase = "idle";
    raceFinishReady = false;                                                    // Resets finish state
    raceFinishProgress = 0;                                                     // Resets race progress

    if (racecarAnimationId) {
        cancelAnimationFrame(racecarAnimationId);
        racecarAnimationId = null;
    }

    resetMeter();

    showScreen(menuScreen);
});

/* =====================================================
   TEST BLOW BUTTON
   ===================================================== */

testBlowButton.addEventListener("click", () => {
    handleBlow(50);                                                         // Simulates medium blow
});

/* =====================================================
   SETTINGS LONG PRESS
   ===================================================== */

let settingsTimer;

settingsTrigger.addEventListener("mousedown", () => {
    settingsTimer = setTimeout(() => {
        settingsModal.style.display = "flex";                              // Opens settings after hold
    }, 3000);
});

settingsTrigger.addEventListener("mouseup", () => {
    clearTimeout(settingsTimer);                                            // Cancels hold
});

settingsTrigger.addEventListener("mouseleave", () => {
    clearTimeout(settingsTimer);                                            // Cancels hold
});

settingsTrigger.addEventListener("touchstart", () => {
    settingsTimer = setTimeout(() => {
        settingsModal.style.display = "flex";                              // Opens settings on touch hold
    }, 3000);
});

settingsTrigger.addEventListener("touchend", () => {
    clearTimeout(settingsTimer);                                            // Cancels touch hold
});

/* =====================================================
   CLOSE SETTINGS
   ===================================================== */

closeSettingsButton.addEventListener("click", () => {
    settingsModal.style.display = "none";                                   // Closes modal
});

/* =====================================================
   START MICROPHONE AFTER USER INTERACTION
   ===================================================== */

window.addEventListener(
    "click",
    () => {
        if (typeof startMicrophone === "function") {
            startMicrophone();                                              // Starts microphone after first click
        }
    },
    { once: true }
);
