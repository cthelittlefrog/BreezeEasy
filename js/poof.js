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
    "images/poof/poof-left-eye-open.png",
    "images/poof/poof-left-eye-half.png",
    "images/poof/poof-left-eye-closed.png",
    "images/poof/poof-left-eye-half.png",
    "images/poof/poof-left-eye-open.png"
];

const rightEyeFrames = [
    "images/poof/poof-right-eye-open.png",
    "images/poof/poof-right-eye-half.png",
    "images/poof/poof-right-eye-closed.png",
    "images/poof/poof-right-eye-half.png",
    "images/poof/poof-right-eye-open.png"
];

const tailFrames = [
    "images/poof/poof-tail-1.png",
    "images/poof/poof-tail-2.png",
    "images/poof/poof-tail-3.png",
    "images/poof/poof-tail-2.png"
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