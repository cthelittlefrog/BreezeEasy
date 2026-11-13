/* =====================================================
   POOF BLINK AND TAIL ANIMATION
   ===================================================== */

const poofLeftEye = document.getElementById("poof-left-eye");
const poofRightEye = document.getElementById("poof-right-eye");
const poofTail = document.getElementById("poof-tail");

const animatedLeftEyes =
    document.querySelectorAll(".animated-left-eye");

const animatedRightEyes =
    document.querySelectorAll(".animated-right-eye");

const animatedTails =
    document.querySelectorAll(".animated-tail");

const leftEyeFrames = [
    "images/poof/poof-left-eye-open.webp",
    "images/poof/poof-left-eye-half.webp",
    "images/poof/poof-left-eye-closed.webp",
    "images/poof/poof-left-eye-half.webp",
    "images/poof/poof-left-eye-open.webp"
];

const rightEyeFrames = [
    "images/poof/poof-right-eye-open.webp",
    "images/poof/poof-right-eye-half.webp",
    "images/poof/poof-right-eye-closed.webp",
    "images/poof/poof-right-eye-half.webp",
    "images/poof/poof-right-eye-open.webp"
];

const tailFrames = [
    "images/poof/poof-tail-1.webp",
    "images/poof/poof-tail-2.webp",
    "images/poof/poof-tail-3.webp",
    "images/poof/poof-tail-2.webp"
];

let tailIndex = 0;

setInterval(() => {

    if (poofTail) {
        poofTail.src = tailFrames[tailIndex];
    }

    animatedTails.forEach(tail => {
        tail.src = tailFrames[tailIndex];
    });

    tailIndex = (tailIndex + 1) % tailFrames.length;

}, 350);

function blinkPoofEyes() {
    if (!poofLeftEye || !poofRightEye) return;                       // Stops errors if eyes are missing

    let eyeIndex = 0;

    const blinkInterval = setInterval(() => {
        if (poofLeftEye) {
            poofLeftEye.src = leftEyeFrames[eyeIndex];
        }

        if (poofRightEye) {
            poofRightEye.src = rightEyeFrames[eyeIndex];
        }

        animatedLeftEyes.forEach(eye => {
            eye.src = leftEyeFrames[eyeIndex];
        });

        animatedRightEyes.forEach(eye => {
            eye.src = rightEyeFrames[eyeIndex];
        });               // Swaps right eye frame

        eyeIndex++;

        if (eyeIndex >= leftEyeFrames.length) {
            clearInterval(blinkInterval);                            // Stops after one blink
        }
    }, 80);
}

setInterval(blinkPoofEyes, 4000);