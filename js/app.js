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
let requiredBlows = 5;
let celebrationSparkleTimer;

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
   HANDLE BLOW
   Called by microphone.js and Test Blow button
   ===================================================== */

function handleBlow(blowStrength = 45) {
    if (currentActivity !== "bubbles") return;

    blowCount++;

    updateMeter();
    createBubbleBurst(blowStrength);
    createWindEffect();
    animateBubbleWand();

    const message = getRandomMessage(bubbleMessages);
    speakMessage(message);

    if (blowCount >= requiredBlows) {
        currentActivity = "celebrating";
        setTimeout(showActivityCelebration, 2000);
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
            startBubbleActivity();                                          // Starts bubbles only for now
        }
    });
});

/* =====================================================
   BACK BUTTON
   ===================================================== */

backButton.addEventListener("click", () => {
    currentActivity = null;                                                 // Stops activity
    resetMeter();                                                           // Clears progress
    showScreen(menuScreen);                                                 // Returns to menu
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