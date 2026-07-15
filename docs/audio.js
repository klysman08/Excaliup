// Excali Up Web Audio Synthesizer
// Generates zero-dependency retro 8-bit sound effects in real-time

let audioCtx = null;
let isMuted = false;

let bgMusic = null;
let bgSource = null;
let bgGain = null;
let currentVolume = 0.5; // Default volume 50%
const FADE_TIME = 4.0; // 4 seconds fade-in / fade-out duration

export function setVolume(vol) {
  currentVolume = Math.max(0, Math.min(1, vol));
  if (bgMusic && bgGain && !isMuted) {
    const now = audioCtx ? audioCtx.currentTime : 0;
    if (now) {
      bgGain.gain.cancelScheduledValues(now);
      bgGain.gain.setValueAtTime(bgGain.gain.value, now);
      bgGain.gain.linearRampToValueAtTime(currentVolume, now + 0.1);
    }
  }
}

export function getVolume() {
  return currentVolume;
}

export function initBackgroundMusic() {
  if (bgMusic) return;
  
  bgMusic = new Audio('minecraft-background.mp3');
  bgMusic.loop = false;
  
  bgMusic.addEventListener('timeupdate', () => {
    if (!bgMusic.duration) return;
    const timeLeft = bgMusic.duration - bgMusic.currentTime;
    // Initiate fade-out FADE_TIME seconds before the end of the song
    if (timeLeft > 0 && timeLeft <= FADE_TIME) {
      fadeMusic(0, timeLeft);
    }
  });
  
  bgMusic.addEventListener('ended', () => {
    // Loop back to start smoothly
    bgMusic.currentTime = 0;
    bgMusic.play().then(() => {
      fadeMusic(currentVolume, FADE_TIME);
    }).catch(e => console.log("BG Loop block:", e));
  });
}

function fadeMusic(targetVolume, duration) {
  try {
    const ctx = getAudioContext();
    if (!bgGain) {
      bgGain = ctx.createGain();
      bgGain.gain.setValueAtTime(0, ctx.currentTime);
      bgSource = ctx.createMediaElementSource(bgMusic);
      bgSource.connect(bgGain);
      bgGain.connect(ctx.destination);
    }
    
    const now = ctx.currentTime;
    bgGain.gain.cancelScheduledValues(now);
    bgGain.gain.setValueAtTime(bgGain.gain.value, now);
    bgGain.gain.linearRampToValueAtTime(targetVolume, now + duration);
  } catch (err) {
    console.warn("Fade error:", err);
  }
}

export function startBackgroundMusic() {
  if (isMuted) return;
  initBackgroundMusic();
  
  bgMusic.play().then(() => {
    fadeMusic(currentVolume, FADE_TIME);
  }).catch(e => {
    console.warn("Background music autoplay blocked:", e);
    // User interaction fallback
    const startOnInteract = () => {
      if (bgMusic && bgMusic.paused && !isMuted) {
        bgMusic.play().then(() => {
          fadeMusic(currentVolume, FADE_TIME);
        }).catch(err => console.warn(err));
      }
      document.removeEventListener('click', startOnInteract);
      document.removeEventListener('keydown', startOnInteract);
    };
    document.addEventListener('click', startOnInteract);
    document.addEventListener('keydown', startOnInteract);
  });
}

export function stopBackgroundMusic() {
  if (bgMusic) {
    fadeMusic(0, 1.5);
    setTimeout(() => {
      if (isMuted && bgMusic) {
        bgMusic.pause();
      }
    }, 1500);
  }
}

export function setMuted(muted) {
  isMuted = muted;
  if (muted) {
    stopBackgroundMusic();
  } else {
    startBackgroundMusic();
  }
}

export function getMuted() {
  return isMuted;
}

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

// Play a quick retro hover/select blip
export function playSelect() {
  if (isMuted) return;
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle'; // Smooth but retro triangle wave
    osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.08);
  } catch (e) {
    console.warn("Audio playback blocked or unsupported:", e);
  }
}

// Play a retro power-up (ON) or power-down (OFF) toggle sound
export function playToggle(enabled) {
  if (isMuted) return;
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'square'; // Classic retro square wave

    if (enabled) {
      // Rising sweep (ON)
      osc.frequency.setValueAtTime(300, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.18);
    } else {
      // Falling sweep (OFF)
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.18);
    }

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.18);
  } catch (e) {
    console.warn("Audio playback blocked or unsupported:", e);
  }
}

// Play a retro coin sound (two-tone rising)
export function playSuccess() {
  if (isMuted) return;
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'square';
    
    // Mario-like coin sound: B5 (987.77 Hz) for 0.08s, then E6 (1318.51 Hz)
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(987.77, now);
    osc.frequency.setValueAtTime(1318.51, now + 0.08);

    gain.gain.setValueAtTime(0.1, now);
    gain.gain.setValueAtTime(0.1, now + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(now + 0.35);
  } catch (e) {
    console.warn("Audio playback blocked or unsupported:", e);
  }
}

// Play a retro error buzzer (descending low frequency buzz)
export function playError() {
  if (isMuted) return;
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth'; // Buzzing sawtooth wave
    
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.linearRampToValueAtTime(60, now + 0.25);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(now + 0.28);
  } catch (e) {
    console.warn("Audio playback blocked or unsupported:", e);
  }
}
