/* =====================================================
   MICROPHONE VARIABLES
   ===================================================== */

let audioContext;
let analyser;
let microphone;
let dataArray;

let blowCooldown = false;
let possibleBlowFrames = 0;
let previousVolume = 0;

let blowThreshold = 35;
let requiredBlowFrames = 18;
let maxVolumeJump = 8;
let breathinessThreshold = 0.45;

/* =====================================================
   START MICROPHONE
   ===================================================== */

async function startMicrophone() {

    try {

        const stream =
            await navigator.mediaDevices.getUserMedia({
                audio: true
            });

        audioContext =
            new AudioContext();

        analyser =
            audioContext.createAnalyser();

        microphone =
            audioContext.createMediaStreamSource(
                stream
            );

        microphone.connect(analyser);

        analyser.fftSize = 256;

        const bufferLength =
            analyser.frequencyBinCount;

        dataArray =
            new Uint8Array(bufferLength);

        monitorMicrophone();

    } catch (error) {

        console.error(
            "Microphone access denied.",
            error
        );
    }
}

/* =====================================================
   MONITOR MICROPHONE
   ===================================================== */

function monitorMicrophone() {

    function detect() {

        analyser.getByteFrequencyData(
            dataArray
        );

        let volume = 0;

        for (let i = 0; i < dataArray.length; i++) {

            volume += dataArray[i];
        }

        volume =
            volume / dataArray.length;

        let lowMidEnergy = 0;
        let highEnergy = 0;

        for (let i = 0; i < dataArray.length; i++) {
            if (i < dataArray.length * 0.30) {
                lowMidEnergy += dataArray[i];
            } else {
                highEnergy += dataArray[i];
            }
        }

        const breathinessRatio = highEnergy / Math.max(lowMidEnergy, 1);

        const isBreathy =
            breathinessRatio > breathinessThreshold;

        const volumeJump =
            Math.abs(volume - previousVolume);                              // Detects sudden sharp sounds

        const isTooSudden =
            volumeJump > maxVolumeJump;                                     // Rejects claps and sharp spikes

        const isPossibleBlow =
            volume > blowThreshold &&
            !isTooSudden &&
            isBreathy;

        if (
            isPossibleBlow &&
            currentActivity
        ) {

            possibleBlowFrames++;                                           // Counts sustained blowing frames

        } else {

            possibleBlowFrames = 0;                                         // Resets on silence or sudden sounds
        }

        if (
            possibleBlowFrames >= requiredBlowFrames &&
            !blowCooldown &&
            currentActivity
        ) {

            blowCooldown = true;                                            // Prevents rapid repeat triggers
            possibleBlowFrames = 0;                                         // Resets after successful blow

            handleBlow(volume);                                               // Sends one blow to activity

            setTimeout(() => {

                blowCooldown = false;                                      // Allows next blow after cooldown

            }, 900);
        }

        previousVolume = volume;                                            // Saves current volume for next frame

        requestAnimationFrame(detect);
    }

    detect();
}