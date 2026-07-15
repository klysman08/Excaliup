// Excali Up Main Page Application Logic
import { playSelect, playToggle, playSuccess, playError, setMuted, getMuted, setVolume } from './audio.js';

// Preloaded pixel-art GIFs (Base64 encoded to guarantee offline/local loading)
const SAMPLES = {
  heart: {
    name: "Pixel Heart",
    gif: "data:image/gif;base64,R0lGODlhDwAPAPQAAAAAAIAAAACAAICAAAAAgIAAgQCAgIDAwAD1AQD1gAD1wQD10QDy8vL09PT29vb4+Pj6+vr8/Pz9/f3///z8/P7+/v///wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACH5BAEAAB8ALAAAAAAPAA8AAAVS4Cdmg2hGZ6oqaUgMQzC8LwwFMCzDNszCMAzHMFTFUizFMAzHMFRVUixFMAzHMFTFUixFMAzHMLwfEFFFUixFMAzHMFRVUixFMDwfEBAAOw=="
  },
  coin: {
    name: "Retro Coin",
    gif: "data:image/gif;base64,R0lGODlhDwAPAPQAAP///wAAAPj4+Pz8/P7+/v39/fn5+fDwqfLy8u7u7tTUz9zc3MTExPT09Ojo6NTUxNTU1MTEzMTExMzMzOTk5Ozs7NjY2Pj4+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACH5BAEAAB8ALAAAAAAPAA8AAAVK4Cdmg2hGZ6oqaUgMQzC8LwwFMCzDNszCMAzHMFTFUizFMAzHMFRVUixFMAzHMFTFUixFMAzHMLwfEFFFUixFMAzHMFRVUixFMDwfEBAAOw=="
  },
  ghost: {
    name: "Mini Ghost",
    gif: "data:image/gif;base64,R0lGODlhDwAPAPQAAAAAAIAAAACAAICAAAAAgIAAgQCAgIDAwAD1AQD1gAD1wQD10QD1+QD2+gD3+wD4/AD5/QD6/gD7/wD8/wD9/wD+/wD//wD///z8/P7+/v///wAAAAAAAAAAAAAAAAAAACH5BAEAAB8ALAAAAAAPAA8AAAVS4Cdmg2hGZ6oqaUgMQzC8LwwFMCzDNszCMAzHMFTFUizFMAzHMFRVUixFMAzHMFTFUixFMAzHMLwfEFFFUixFMAzHMFRVUixFMDwfEBAAOw=="
  }
};

// Simulated Iconify Library Icons
const ICONIFY_ICONS = [
  // General Shapes/Icons
  { name: "Lucide Star", svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>', category: "general" },
  { name: "Lucide Heart", svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>', category: "general" },
  { name: "Lucide Home", svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>', category: "general" },
  { name: "Lucide Check", svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>', category: "general" },
  { name: "Lucide Search", svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>', category: "general" },
  { name: "Lucide User", svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>', category: "general" },
  { name: "Lucide Sparkles", svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m11.314 11.314l.707-.707M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z"/></svg>', category: "general" },
  { name: "Lucide Trash", svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>', category: "general" },

  // Animated SVGs
  { name: "SVG Spinner", svg: '<svg viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="2"><circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="0"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/></circle></svg>', category: "animated" },
  { name: "SVG Pulse", svg: '<svg viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="2"><circle cx="12" cy="12" r="1" fill="none"><animate attributeName="r" values="1;10" dur="1.5s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;0" dur="1.5s" repeatCount="indefinite"/></circle></svg>', category: "animated" },
  { name: "SVG Rotation", svg: '<svg viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="2.5s" repeatCount="indefinite"/></path></svg>', category: "animated" }
];

document.addEventListener('DOMContentLoaded', () => {
  // Global State
  const state = {
    connected: true,
    enabled: true,      // GIF animations enabled
    svgEnabled: true,   // SVG playback enabled
    flowEnabled: true,  // Path flow animations enabled
    gifSpeed: 1.0,      // GIF speed multiplier
    activeGifs: 0,
    selectedElement: null,
    draggedElement: null,
    draggedIcon: null,
    dragOffset: { x: 0, y: 0 },
    nextId: 1,
    favorites: [],      // Starred Iconify icons
    currentTab: 'all',  // Iconify tab: all, animated, favorites
    iconifyOpen: false  // Is Iconify sidebar open
  };

  // Elements
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const statusBanner = document.getElementById('statusBanner');
  const gifToggle = document.getElementById('gifToggle');
  const svgToggle = document.getElementById('svgToggle');
  const flowToggle = document.getElementById('flowToggle');
  const gifCount = document.getElementById('gifCount');
  const engineStatus = document.getElementById('engineStatus');
  
  const canvasBoard = document.getElementById('canvasBoard');
  const canvasEmptyState = document.getElementById('canvasEmptyState');
  
  const btnConnected = document.getElementById('btnConnected');
  const btnDisconnected = document.getElementById('btnDisconnected');
  const btnLoading = document.getElementById('btnLoading');
  
  const sampleHeart = document.getElementById('sampleHeart');
  const sampleCoin = document.getElementById('sampleCoin');
  const sampleGhost = document.getElementById('sampleGhost');
  const spawnArrow = document.getElementById('spawnArrow');
  const spawnZigzag = document.getElementById('spawnZigzag');

  const installBtn = document.getElementById('installBtn');
  const demoBtn = document.getElementById('demoBtn');
  const themeToggle = document.getElementById('theme-toggle');

  // New Iconify elements
  const btnToggleIconify = document.getElementById('btnToggleIconify');
  const simIconifyPanel = document.getElementById('simIconifyPanel');
  const simIconifyClose = document.getElementById('simIconifyClose');
  const simIconifySearch = document.getElementById('simIconifySearch');
  const simIconifyGrid = document.getElementById('simIconifyGrid');
  const simGifSpeedPills = document.getElementById('simGifSpeedPills');
  const soundToggle = document.getElementById('sound-toggle');
  const volumeSlider = document.getElementById('volume-slider');

  // SOUND HOOKS FOR STANDARD INTERACTION
  const addSoundHooks = () => {
    document.querySelectorAll('button, a, .sample-item, .faq-item, .control-btn, .sim-toolbar-btn, .sim-pill-group button, .sim-iconify-tabs button, .sim-iconify-item').forEach(el => {
      if (!el.dataset.soundHooked) {
        el.dataset.soundHooked = 'true';
        el.addEventListener('mouseenter', () => playSelect());
      }
    });
  };

  // THEME TOGGLE (DARK / LIGHT MODE)
  const initTheme = () => {
    const savedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (savedTheme === 'dark' || (!savedTheme && systemPrefersDark)) {
      document.body.classList.add('dark-mode');
      themeToggle.textContent = "☀️ LIGHT MODE";
    } else {
      document.body.classList.remove('dark-mode');
      themeToggle.textContent = "🌙 DARK MODE";
    }
  };

  themeToggle.addEventListener('click', () => {
    const isDark = document.body.classList.toggle('dark-mode');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    themeToggle.textContent = isDark ? "☀️ LIGHT MODE" : "🌙 DARK MODE";
    playToggle(isDark);
  });

  initTheme();

  // SOUND EFFECTS MUTE & VOLUME TOGGLE
  const initSound = () => {
    const savedMute = localStorage.getItem('soundMuted') === 'true';
    setMuted(savedMute);
    if (soundToggle) {
      soundToggle.textContent = savedMute ? "🔇 SOUND OFF" : "🔊 SOUND ON";
    }
    const savedVol = localStorage.getItem('soundVolume');
    const initVol = savedVol !== null ? parseFloat(savedVol) : 50;
    if (volumeSlider) {
      volumeSlider.value = initVol;
    }
    setVolume(initVol / 100);
  };

  if (soundToggle) {
    soundToggle.addEventListener('click', () => {
      const currentlyMuted = getMuted();
      const newMuted = !currentlyMuted;
      setMuted(newMuted);
      localStorage.setItem('soundMuted', newMuted);
      soundToggle.textContent = newMuted ? "🔇 SOUND OFF" : "🔊 SOUND ON";
      if (!newMuted) {
        playToggle(true);
      }
    });
  }

  if (volumeSlider) {
    volumeSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      setVolume(val / 100);
      localStorage.setItem('soundVolume', val);
    });
  }

  initSound();

  // Selection change synchronizer
  const onSelectionChanged = () => {
    const elements = canvasBoard.querySelectorAll('.canvas-element');
    elements.forEach(el => {
      el.classList.toggle('selected', el === state.selectedElement);
    });
    
    updateSimToolbar();
  };

  // Update simulator UI based on state variables
  const updateSimulatorUI = () => {
    // 1. Connection Status Banner
    statusBanner.className = "sim-status-banner";
    const isConn = state.connected && statusBanner.dataset.state !== 'loading';
    const isLoading = statusBanner.dataset.state === 'loading';
    
    if (state.connected) {
      statusBanner.classList.add('connected');
      statusText.textContent = "Excalidraw Connected";
      
      gifToggle.disabled = false;
      gifToggle.checked = state.enabled;
      
      svgToggle.disabled = false;
      svgToggle.checked = state.svgEnabled;
      
      flowToggle.disabled = false;
      flowToggle.checked = state.flowEnabled;
      
      engineStatus.textContent = (state.enabled || state.svgEnabled || state.flowEnabled) ? "Running" : "Paused";
    } else {
      if (isLoading) {
        statusBanner.classList.add('loading');
        statusText.textContent = "Canvas Loading...";
      } else {
        statusBanner.classList.add('disconnected');
        statusText.textContent = "Open excalidraw.com";
      }
      
      gifToggle.disabled = true;
      gifToggle.checked = false;
      
      svgToggle.disabled = true;
      svgToggle.checked = false;
      
      flowToggle.disabled = true;
      flowToggle.checked = false;
      
      engineStatus.textContent = isLoading ? "-" : "Inactive";
    }

    // Update active media counts
    const gifCountValue = canvasBoard.querySelectorAll('.canvas-element:not(.element-arrow):not(.element-svg)').length;
    state.activeGifs = gifCountValue;
    gifCount.textContent = state.connected ? state.activeGifs : "0";

    // Toggle active classes on simulation controllers
    btnConnected.classList.toggle('active', isConn);
    btnDisconnected.classList.toggle('active', !state.connected && !isLoading);
    btnLoading.classList.toggle('active', isLoading);

    // Update playground items animation based on dashboard state
    updatePlaygroundAnimationState();
    onSelectionChanged();
  };

  // Set specific connection state
  const setConnectionState = (connType) => {
    if (connType === 'connected') {
      state.connected = true;
      statusBanner.dataset.state = 'connected';
      playSuccess();
    } else if (connType === 'disconnected') {
      state.connected = false;
      statusBanner.dataset.state = 'disconnected';
      playError();
    } else if (connType === 'loading') {
      state.connected = false;
      statusBanner.dataset.state = 'loading';
      playToggle(true); // Short blip
      
      setTimeout(() => {
        if (statusBanner.dataset.state === 'loading') {
          setConnectionState('connected');
        }
      }, 2000);
    }
    updateSimulatorUI();
  };

  // Toggle extension controls
  gifToggle.addEventListener('change', () => {
    state.enabled = gifToggle.checked;
    playToggle(state.enabled);
    updateSimulatorUI();
  });

  svgToggle.addEventListener('change', () => {
    state.svgEnabled = svgToggle.checked;
    playToggle(state.svgEnabled);
    updateSimulatorUI();
  });

  flowToggle.addEventListener('change', () => {
    state.flowEnabled = flowToggle.checked;
    playToggle(state.flowEnabled);
    updateSimulatorUI();
  });

  // GIF Speed pill handlers
  if (simGifSpeedPills) {
    simGifSpeedPills.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        playSelect();
        state.gifSpeed = parseFloat(btn.dataset.val);
        simGifSpeedPills.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === btn));
        updateSimulatorUI();
      });
    });
  }

  // Simulator State Controllers
  btnConnected.addEventListener('click', () => setConnectionState('connected'));
  btnDisconnected.addEventListener('click', () => setConnectionState('disconnected'));
  btnLoading.addEventListener('click', () => setConnectionState('loading'));

  // Header / Call To Actions click sounds
  installBtn.addEventListener('click', (e) => {
    playSuccess();
  });

  demoBtn.addEventListener('click', (e) => {
    e.preventDefault();
    playSuccess();
    document.getElementById('playground').scrollIntoView({ behavior: 'smooth' });
  });

  // Playground Board logic
  const checkEmptyState = () => {
    const items = canvasBoard.querySelectorAll('.canvas-element');
    
    if (items.length === 0) {
      canvasEmptyState.style.display = 'flex';
    } else {
      canvasEmptyState.style.display = 'none';
    }
    updateSimulatorUI();
  };

  // SVG dynamic builder function
  const renderArrowSVGContent = (el) => {
    const isRunning = state.connected;
    const isFlowActive = isRunning && state.flowEnabled && el.dataset.style;
    const points = el.dataset.points;
    const arrowheadPoints = el.dataset.arrowheadPoints;
    const w = el.dataset.w;
    const h = el.dataset.h;
    const style = el.dataset.style;
    const speed = el.dataset.speed || 'medium';
    const direction = el.dataset.direction || 'forward';
    
    const size = parseInt(el.dataset.size || '3');
    const spacing = parseInt(el.dataset.spacing || '50');
    const glow = el.dataset.glow || 'none';
    
    const strokeWidth = size * 1.5;
    const particleRadius = size * 1.8;
    
    // Calculate speed factor
    let dur = '2s';
    if (speed === 'slow') dur = '4s';
    if (speed === 'fast') dur = '0.7s';
    
    let flowContent = '';
    
    if (isFlowActive) {
      if (style === 'particles') {
        const numParticles = Math.max(2, Math.min(10, Math.floor(200 / spacing)));
        let circles = '';
        for (let i = 0; i < numParticles; i++) {
          const delay = (i * (parseFloat(dur) / numParticles)).toFixed(2) + 's';
          circles += `
            <circle r="${particleRadius}" fill="var(--color-primary)">
              <animateMotion dur="${dur}" repeatCount="indefinite" path="${points}" begin="${delay}" keyPoints="${direction === 'reverse' ? '1;0' : '0;1'}" keyTimes="0;1" calcMode="linear" />
            </circle>
          `;
        }
        flowContent = `<g class="flow-particles ${glow !== 'none' ? 'glow-' + glow : ''}">${circles}</g>`;
      } else if (style === 'dashes') {
        const dashLen = size * 3.5;
        const gapLen = size * 2.5;
        const antsSpeed = speed === 'slow' ? '2.4s' : (speed === 'fast' ? '0.4s' : '1.2s');
        const antsDir = direction === 'reverse' ? 'reverse' : 'normal';
        flowContent = `
          <path d="${points}" class="flow-arrow-line marching-ants" 
                stroke="var(--color-primary)" stroke-width="${strokeWidth}" 
                stroke-dasharray="${dashLen}, ${gapLen}" fill="none" 
                style="animation-duration: ${antsSpeed}; animation-direction: ${antsDir};" />
        `;
      } else if (style === 'comet') {
        let circles = '';
        const delays = ['0s', '0.08s', '0.16s'];
        const opacities = ['1.0', '0.6', '0.2'];
        const scales = [1.0, 0.7, 0.4];
        
        for (let i = 0; i < 3; i++) {
          let delay = delays[i];
          if (direction === 'reverse') {
            delay = delays[2 - i];
          }
          circles += `
            <circle r="${particleRadius * scales[i]}" fill="var(--color-primary)" opacity="${opacities[i]}">
              <animateMotion dur="${dur}" repeatCount="indefinite" path="${points}" begin="${delay}" keyPoints="${direction === 'reverse' ? '1;0' : '0;1'}" keyTimes="0;1" calcMode="linear" />
            </circle>
          `;
        }
        flowContent = `<g class="flow-comet ${glow !== 'none' ? 'glow-' + glow : ''}">${circles}</g>`;
      } else if (style === 'snake') {
        const snakeSpeed = speed === 'slow' ? '4s' : (speed === 'fast' ? '0.8s' : '2s');
        const snakeDir = direction === 'reverse' ? 'reverse' : 'normal';
        flowContent = `
          <path d="${points}" class="flow-arrow-line flow-snake snake-animation" 
                stroke="var(--color-primary)" stroke-width="${strokeWidth * 1.5}" 
                stroke-dasharray="50, 150" fill="none" 
                style="animation-duration: ${snakeSpeed}; animation-direction: ${snakeDir};" />
        `;
      } else if (style === 'pulse') {
        const pulseSpeed = speed === 'slow' ? '3s' : (speed === 'fast' ? '0.6s' : '1.5s');
        flowContent = `
          <path d="${points}" class="flow-arrow-line pulse-animation" 
                stroke="var(--color-primary)" stroke-width="${strokeWidth}" fill="none" 
                style="animation-duration: ${pulseSpeed};" />
        `;
      } else if (style === 'ripple') {
        const numRipples = Math.max(1, Math.min(3, Math.floor(100 / spacing)));
        let ripples = '';
        for (let i = 0; i < numRipples; i++) {
          const delay = (i * (parseFloat(dur) / numRipples)).toFixed(2) + 's';
          ripples += `
            <circle r="4" fill="none" stroke="var(--color-primary)" stroke-width="2" class="ripple-circle">
              <animateMotion dur="${dur}" repeatCount="indefinite" path="${points}" begin="${delay}" keyPoints="${direction === 'reverse' ? '1;0' : '0;1'}" keyTimes="0;1" calcMode="linear" />
            </circle>
          `;
        }
        flowContent = `<g class="${glow !== 'none' ? 'glow-' + glow : ''}">${ripples}</g>`;
      }
    }
    
    const glowClass = (isFlowActive && glow !== 'none') ? 'glow-' + glow : '';
    
    return `
      <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
        <path d="${points}" class="flow-arrow-line ${glowClass}" stroke="var(--color-text-main)" stroke-width="${strokeWidth}" fill="none" />
        ${flowContent}
        <polygon points="${arrowheadPoints}" class="flow-arrow-head" fill="var(--color-text-main)" />
      </svg>
      <div class="el-label" style="background-color: ${isFlowActive ? 'var(--color-primary)' : 'var(--color-text-muted)'}">
        ${isFlowActive ? `FLOW: ${style.toUpperCase()}` : 'STATIC LINE'}
      </div>
    `;
  };

  // Update how elements render based on extension enabled/disabled state
  const updatePlaygroundAnimationState = () => {
    const isRunning = state.connected;
    const elements = canvasBoard.querySelectorAll('.canvas-element');
    
    let animatedLineCount = 0;
    
    elements.forEach(el => {
      const img = el.querySelector('.el-img');
      const canvas = el.querySelector('.el-static-canvas');
      const label = el.querySelector('.el-label');
      
      const isArrow = el.classList.contains('element-arrow');
      const isSvg = el.classList.contains('element-svg');
      
      if (isArrow) {
        // Redraw arrow based on state settings
        el.innerHTML = renderArrowSVGContent(el);
        
        const style = el.dataset.style;
        const isFlowActive = isRunning && state.flowEnabled && style;
        
        if (isFlowActive) {
          animatedLineCount++;
        }
      } else if (isSvg) {
        const svg = el.querySelector('svg');
        const isSvgActive = isRunning && state.svgEnabled;
        
        if (svg) {
          if (isSvgActive) {
            svg.unpauseAnimations();
            label.textContent = "SVG ACTIVE";
            label.style.backgroundColor = "var(--color-primary)";
          } else {
            svg.pauseAnimations();
            label.textContent = "SVG PAUSED";
            label.style.backgroundColor = "var(--color-text-muted)";
          }
        }
      } else {
        // GIF element
        const isGifActive = isRunning && state.enabled;
        
        if (isGifActive) {
          el.classList.remove('static');
          img.style.display = 'block';
          canvas.style.display = 'none';
          
          if (state.gifSpeed !== 1.0) {
            label.textContent = `GIF ACTIVE (${state.gifSpeed}x)`;
          } else {
            label.textContent = "GIF ACTIVE";
          }
          label.style.backgroundColor = "var(--color-success)";
        } else {
          el.classList.add('static');
          img.style.display = 'none';
          canvas.style.display = 'block';
          label.textContent = "STATIC FRAME";
          label.style.backgroundColor = "var(--color-text-muted)";
          
          // Render first frame onto canvas
          try {
            const ctx = canvas.getContext('2d');
            canvas.width = img.naturalWidth || 64;
            canvas.height = img.naturalHeight || 64;
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          } catch (err) {
            console.log("Canvas drawImage fallback:", err);
          }
        }
      }
    });

    const animatedCount = document.getElementById('animatedCount');
    if (animatedCount) {
      animatedCount.textContent = state.connected ? animatedLineCount : "0";
    }
  };

  // Add a GIF element to the simulated board
  const addGifToBoard = (gifSrc, name, posX = 100, posY = 100) => {
    const elId = `el-${state.nextId++}`;
    
    const wrapper = document.createElement('div');
    wrapper.className = 'canvas-element selected';
    wrapper.id = elId;
    wrapper.style.left = `${posX}px`;
    wrapper.style.top = `${posY}px`;

    const img = document.createElement('img');
    img.className = 'el-img';
    img.alt = name;
    
    const canvas = document.createElement('canvas');
    canvas.className = 'el-static-canvas';
    canvas.style.display = 'none';
    canvas.width = 64;
    canvas.height = 64;

    const label = document.createElement('div');
    label.className = 'el-label';
    label.textContent = "GIF ACTIVE";

    wrapper.appendChild(img);
    wrapper.appendChild(canvas);
    wrapper.appendChild(label);
    
    state.selectedElement = wrapper;
    onSelectionChanged();

    wrapper.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('el-label')) return;
      e.preventDefault();
      playSelect();
      state.selectedElement = wrapper;
      onSelectionChanged();
      state.draggedElement = wrapper;
      state.dragOffset.x = e.clientX - wrapper.offsetLeft;
      state.dragOffset.y = e.clientY - wrapper.offsetTop;
    });

    img.onload = () => {
      updatePlaygroundAnimationState();
    };
    img.src = gifSrc;

    canvasBoard.appendChild(wrapper);
    playSuccess();
    checkEmptyState();
  };

  // Add an SVG element from Iconify
  const addIconToBoard = (icon, posX = 120, posY = 120) => {
    const elId = `el-${state.nextId++}`;
    
    const wrapper = document.createElement('div');
    wrapper.className = 'canvas-element element-svg selected';
    wrapper.id = elId;
    wrapper.style.left = `${posX}px`;
    wrapper.style.top = `${posY}px`;
    wrapper.style.width = '64px';
    wrapper.style.height = '64px';
    
    wrapper.innerHTML = `
      <div class="el-svg-container" style="width:100%; height:100%; display:flex; justify-content:center; align-items:center;">
        ${icon.svg}
      </div>
      <div class="el-label" style="background-color: var(--color-primary)">SVG ACTIVE</div>
    `;
    
    state.selectedElement = wrapper;
    onSelectionChanged();

    wrapper.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('el-label')) return;
      e.preventDefault();
      playSelect();
      state.selectedElement = wrapper;
      onSelectionChanged();
      state.draggedElement = wrapper;
      state.dragOffset.x = e.clientX - wrapper.offsetLeft;
      state.dragOffset.y = e.clientY - wrapper.offsetTop;
    });

    canvasBoard.appendChild(wrapper);
    playSuccess();
    checkEmptyState();
  };

  // Add a Vector Arrow to the simulated board
  const addArrowToBoard = (points, arrowheadPoints, w, h, name, posX = 100, posY = 100) => {
    const elId = `el-${state.nextId++}`;
    
    const wrapper = document.createElement('div');
    wrapper.className = 'canvas-element element-arrow selected';
    wrapper.id = elId;
    wrapper.style.left = `${posX}px`;
    wrapper.style.top = `${posY}px`;
    wrapper.style.width = `${w}px`;
    wrapper.style.height = `${h}px`;

    // Save configurations in datasets
    wrapper.dataset.points = points;
    wrapper.dataset.arrowheadPoints = arrowheadPoints;
    wrapper.dataset.w = w;
    wrapper.dataset.h = h;
    
    wrapper.dataset.style = '';
    wrapper.dataset.speed = 'medium';
    wrapper.dataset.direction = 'forward';
    wrapper.dataset.size = '3';
    wrapper.dataset.spacing = '50';
    wrapper.dataset.glow = 'none';

    wrapper.innerHTML = renderArrowSVGContent(wrapper);
    
    state.selectedElement = wrapper;
    onSelectionChanged();

    wrapper.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('el-label')) return;
      e.preventDefault();
      playSelect();
      state.selectedElement = wrapper;
      onSelectionChanged();
      state.draggedElement = wrapper;
      state.dragOffset.x = e.clientX - wrapper.offsetLeft;
      state.dragOffset.y = e.clientY - wrapper.offsetTop;
    });

    canvasBoard.appendChild(wrapper);
    playSuccess();
    checkEmptyState();
  };

  // Clear Canvas Board action
  document.getElementById('btnClearCanvas').addEventListener('click', () => {
    const items = canvasBoard.querySelectorAll('.canvas-element');
    items.forEach(item => item.remove());
    state.selectedElement = null;
    onSelectionChanged();
    playError();
    checkEmptyState();
  });

  // Select item samples triggers
  sampleHeart.addEventListener('click', () => {
    addGifToBoard("https://static.klipy.com/ii/4493325008d34b7bf8cd6813cd5c1619/87/ad/71WOMbwke67fmBx.gif", "Pixel Heart", 120, 100);
  });

  sampleCoin.addEventListener('click', () => {
    addGifToBoard("https://static.klipy.com/ii/71b2873e478b9d8d0482ea3ec777ba7f/15/36/izQlaTmV.gif", "Retro Coin", 260, 150);
  });

  sampleGhost.addEventListener('click', () => {
    addGifToBoard("https://static.klipy.com/ii/f87f46a2c5aeaeed4c68910815f73eaf/b2/8e/ubnyCmzy.gif", "Mini Ghost", 180, 80);
  });

  // Select vector element triggers
  spawnArrow.addEventListener('click', () => {
    addArrowToBoard(
      "M 10 35 L 230 35",
      "230,35 218,28 218,42",
      250, 70,
      "Flow Arrow",
      60, 150
    );
  });

  spawnZigzag.addEventListener('click', () => {
    addArrowToBoard(
      "M 10 10 L 110 60 L 150 15 L 270 45",
      "270,45 258,38 258,52",
      290, 70,
      "Zigzag Flow",
      40, 120
    );
  });

  // Drag and Drop files onto whiteboard
  canvasBoard.addEventListener('dragover', (e) => {
    e.preventDefault();
    canvasBoard.style.borderColor = 'var(--color-primary)';
  });

  canvasBoard.addEventListener('dragleave', () => {
    canvasBoard.style.borderColor = 'var(--color-border)';
  });

  canvasBoard.addEventListener('drop', (e) => {
    e.preventDefault();
    canvasBoard.style.borderColor = 'var(--color-border)';
    
    // Check if dragging an Iconify icon
    if (state.draggedIcon) {
      const boardRect = canvasBoard.getBoundingClientRect();
      const dropX = e.clientX - boardRect.left - 32;
      const dropY = e.clientY - boardRect.top - 32;
      addIconToBoard(state.draggedIcon, dropX, dropY);
      state.draggedIcon = null;
      return;
    }
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.type.match('image/gif')) {
        const reader = new FileReader();
        reader.onload = (event) => {
          addGifToBoard(event.target.result, file.name, 150, 120);
        };
        reader.readAsDataURL(file);
      } else {
        playError();
        alert("⚠️ Please drop an animated GIF file (.gif) or drag an Iconify icon!");
      }
    }
  });

  // Track dragging across screen
  document.addEventListener('mousemove', (e) => {
    if (state.draggedElement) {
      const el = state.draggedElement;
      let newX = e.clientX - state.dragOffset.x;
      let newY = e.clientY - state.dragOffset.y;
      
      const boardRect = canvasBoard.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      
      const maxX = boardRect.width - elRect.width;
      const maxY = boardRect.height - elRect.height;
      
      newX = Math.max(0, Math.min(newX, maxX));
      newY = Math.max(0, Math.min(newY, maxY));
      
      el.style.left = `${newX}px`;
      el.style.top = `${newY}px`;
    }
  });

  document.addEventListener('mouseup', () => {
    if (state.draggedElement) {
      state.draggedElement = null;
    }
  });

  // Click on background to deselect element
  canvasBoard.addEventListener('click', (e) => {
    if (e.target === canvasBoard || e.target === canvasEmptyState || e.target.classList.contains('canvas-grid-bg')) {
      if (state.selectedElement) {
        state.selectedElement = null;
        onSelectionChanged();
      }
    }
  });

  // Keyboard shortcut keys listener
  document.addEventListener('keydown', (e) => {
    // Delete/Backspace keys
    if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedElement) {
      state.selectedElement.remove();
      state.selectedElement = null;
      onSelectionChanged();
      playError();
      checkEmptyState();
    }
    
    // 'B' key to toggle Iconify panel (if not focused on inputs)
    if (e.key.toLowerCase() === 'b' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
      e.preventDefault();
      toggleIconifyPanel();
    }
  });

  // FAQ Accordion logic
  document.querySelectorAll('.faq-item').forEach(item => {
    item.addEventListener('click', () => {
      const isActive = item.classList.contains('active');
      
      document.querySelectorAll('.faq-item').forEach(el => el.classList.remove('active'));
      
      if (!isActive) {
        item.classList.add('active');
        playSuccess();
      } else {
        playToggle(false);
      }
    });
  });

  // Simulated Canvas Toolbar logic
  const updateSimToolbar = () => {
    const simToolbar = document.getElementById('simFloatingToolbar');
    const simToolbarPanel = document.getElementById('simToolbarPanel');
    const simGearBtn = document.getElementById('simGearBtn');
    if (!simToolbar) return;
    
    const el = state.selectedElement;
    const isRunning = state.connected && state.flowEnabled;
    
    if (el && el.classList.contains('element-arrow') && isRunning) {
      simToolbar.classList.add('visible');
      
      const activeStyle = el.dataset.style || '';
      
      // Update style buttons
      const styleButtons = simToolbar.querySelectorAll('.sim-toolbar-main button[data-style]');
      styleButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.style === activeStyle);
      });
      
      if (simGearBtn) {
        simGearBtn.style.display = activeStyle ? 'flex' : 'none';
        if (!activeStyle) {
          simToolbarPanel.classList.remove('visible');
          simGearBtn.classList.remove('active');
        }
      }
      
      if (activeStyle) {
        updateSimPills('speed', el.dataset.speed || 'medium');
        updateSimPills('direction', el.dataset.direction || 'forward');
        updateSimPills('size', el.dataset.size || '3');
        updateSimPills('spacing', el.dataset.spacing || '50');
        updateSimPills('glow', el.dataset.glow || 'none');
      }
    } else {
      simToolbar.classList.remove('visible');
      if (simToolbarPanel) simToolbarPanel.classList.remove('visible');
      if (simGearBtn) simGearBtn.classList.remove('active');
    }
  };
  
  const updateSimPills = (settingKey, val) => {
    let id = '';
    if (settingKey === 'speed') id = 'simSpeedPills';
    else if (settingKey === 'direction') id = 'simDirPills';
    else if (settingKey === 'size') id = 'simSizePills';
    else if (settingKey === 'spacing') id = 'simSpacingPills';
    else if (settingKey === 'glow') id = 'simGlowPills';
    
    const group = document.getElementById(id);
    if (!group) return;
    const buttons = group.querySelectorAll('button');
    buttons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.val === val);
    });
  };

  // Wire simulated toolbar buttons
  document.querySelectorAll('.sim-toolbar-main button[data-style]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      playSelect();
      
      const el = state.selectedElement;
      if (!el) return;
      
      const targetStyle = btn.dataset.style;
      const currentStyle = el.dataset.style || '';
      
      if (currentStyle === targetStyle) {
        el.dataset.style = '';
      } else {
        el.dataset.style = targetStyle;
        if (!el.dataset.speed) el.dataset.speed = 'medium';
        if (!el.dataset.direction) el.dataset.direction = 'forward';
        if (!el.dataset.size) el.dataset.size = '3';
        if (!el.dataset.spacing) el.dataset.spacing = '50';
        if (!el.dataset.glow) el.dataset.glow = 'none';
      }
      
      updatePlaygroundAnimationState();
      onSelectionChanged();
    });
  });

  document.getElementById('simGearBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    playToggle(true);
    
    const panel = document.getElementById('simToolbarPanel');
    const gearBtn = document.getElementById('simGearBtn');
    if (panel && gearBtn) {
      const isVisible = panel.classList.toggle('visible');
      gearBtn.classList.toggle('active', isVisible);
    }
  });

  document.getElementById('simRemoveBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    playError();
    
    const el = state.selectedElement;
    if (el) {
      el.dataset.style = '';
      updatePlaygroundAnimationState();
      onSelectionChanged();
    }
  });

  // Listeners for collapsible settings pills
  document.querySelectorAll('.sim-toolbar-panel .sim-pill-group button').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      playSelect();
      
      const el = state.selectedElement;
      if (!el) return;
      
      const parent = btn.parentElement;
      let key = '';
      if (parent.id === 'simSpeedPills') key = 'speed';
      else if (parent.id === 'simDirPills') key = 'direction';
      else if (parent.id === 'simSizePills') key = 'size';
      else if (parent.id === 'simSpacingPills') key = 'spacing';
      else if (parent.id === 'simGlowPills') key = 'glow';
      
      if (key) {
        el.dataset[key] = btn.dataset.val;
        updatePlaygroundAnimationState();
        onSelectionChanged();
      }
    });
  });

  // Toggle Iconify Sidebar Panel
  const toggleIconifyPanel = () => {
    state.iconifyOpen = !state.iconifyOpen;
    playToggle(state.iconifyOpen);
    if (state.iconifyOpen) {
      simIconifyPanel.classList.add('visible');
      renderIconifyGrid();
    } else {
      simIconifyPanel.classList.remove('visible');
    }
  };

  btnToggleIconify.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleIconifyPanel();
  });

  simIconifyClose.addEventListener('click', (e) => {
    e.stopPropagation();
    state.iconifyOpen = false;
    simIconifyPanel.classList.remove('visible');
    playToggle(false);
  });

  // Iconify search filters
  simIconifySearch.addEventListener('input', () => {
    renderIconifyGrid();
  });

  // Iconify Tabs switching
  simIconifyPanel.querySelectorAll('.sim-iconify-tabs button').forEach(tabBtn => {
    tabBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      playSelect();
      state.currentTab = tabBtn.dataset.tab;
      simIconifyPanel.querySelectorAll('.sim-iconify-tabs button').forEach(b => b.classList.toggle('active', b === tabBtn));
      renderIconifyGrid();
    });
  });

  // Render Iconify sidebar icons dynamically
  const renderIconifyGrid = () => {
    simIconifyGrid.innerHTML = '';
    const query = simIconifySearch.value.toLowerCase().trim();
    
    const filtered = ICONIFY_ICONS.filter(icon => {
      // Tab filter
      if (state.currentTab === 'animated' && icon.category !== 'animated') return false;
      if (state.currentTab === 'favorites' && !state.favorites.includes(icon.name)) return false;
      
      // Query filter
      if (query && !icon.name.toLowerCase().includes(query)) return false;
      
      return true;
    });

    if (filtered.length === 0) {
      simIconifyGrid.innerHTML = `<div style="grid-column: span 3; text-align: center; font-size: 0.75rem; color: var(--color-text-muted); padding-top: 20px;">No icons found</div>`;
      return;
    }

    filtered.forEach(icon => {
      const item = document.createElement('div');
      item.className = 'sim-iconify-item';
      item.title = `Click to paste or drag onto board`;
      
      // Star favorite toggler
      const isFav = state.favorites.includes(icon.name);
      const star = document.createElement('span');
      star.className = `sim-iconify-item-star ${isFav ? 'active' : ''}`;
      star.innerHTML = '★';
      star.title = isFav ? 'Remove from Favorites' : 'Add to Favorites';
      
      star.addEventListener('click', (e) => {
        e.stopPropagation();
        playToggle(true);
        if (state.favorites.includes(icon.name)) {
          state.favorites = state.favorites.filter(n => n !== icon.name);
        } else {
          state.favorites.push(icon.name);
        }
        renderIconifyGrid();
      });

      const iconContainer = document.createElement('div');
      iconContainer.style.width = '24px';
      iconContainer.style.height = '24px';
      iconContainer.innerHTML = icon.svg;

      const label = document.createElement('span');
      label.className = 'sim-iconify-item-label';
      label.textContent = icon.name.replace('Lucide ', '').replace('SVG ', '');

      item.appendChild(star);
      item.appendChild(iconContainer);
      item.appendChild(label);

      // Support clicking to paste
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        addIconToBoard(icon);
      });

      // Support drag & drop
      item.draggable = true;
      item.addEventListener('dragstart', (e) => {
        state.draggedIcon = icon;
        playSelect();
      });

      simIconifyGrid.appendChild(item);
    });

    addSoundHooks();
  };

  // Init UI
  updateSimulatorUI();
  addSoundHooks();

  const observer = new MutationObserver(() => {
    addSoundHooks();
  });
  observer.observe(document.body, { childList: true, subtree: true });
});
