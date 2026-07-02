// ExcaliGif Main Page Application Logic
import { playSelect, playToggle, playSuccess, playError } from './audio.js';

// Preloaded pixel-art GIFs (Base64 encoded to guarantee offline/local loading)
const SAMPLES = {
  heart: {
    name: "Pixel Heart",
    // Pulsing pixel heart
    gif: "data:image/gif;base64,R0lGODlhDwAPAPQAAAAAAIAAAACAAICAAAAAgIAAgQCAgIDAwAD1AQD1gAD1wQD10QDy8vL09PT29vb4+Pj6+vr8/Pz9/f3///z8/P7+/v///wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACH5BAEAAB8ALAAAAAAPAA8AAAVS4Cdmg2hGZ6oqaUgMQzC8LwwFMCzDNszCMAzHMFTFUizFMAzHMFRVUixFMAzHMFTFUixFMAzHMLwfEFFFUixFMAzHMFRVUixFMDwfEBAAOw=="
  },
  coin: {
    name: "Retro Coin",
    // Rotating pixel coin
    gif: "data:image/gif;base64,R0lGODlhDwAPAPQAAP///wAAAPj4+Pz8/P7+/v39/fn5+fDwqfLy8u7u7tTUz9zc3MTExPT09Ojo6NTUxNTU1MTEzMTExMzMzOTk5Ozs7NjY2Pj4+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACH5BAEAAB8ALAAAAAAPAA8AAAVK4Cdmg2hGZ6oqaUgMQzC8LwwFMCzDNszCMAzHMFTFUizFMAzHMFRVUixFMAzHMFTFUixFMAzHMLwfEFFFUixFMAzHMFRVUixFMDwfEBAAOw=="
  },
  ghost: {
    name: "Mini Ghost",
    // Blinking pixel ghost
    gif: "data:image/gif;base64,R0lGODlhDwAPAPQAAAAAAIAAAACAAICAAAAAgIAAgQCAgIDAwAD1AQD1gAD1wQD10QD1+QD2+gD3+wD4/AD5/QD6/gD7/wD8/wD9/wD+/wD//wD///z8/P7+/v///wAAAAAAAAAAAAAAAAAAACH5BAEAAB8ALAAAAAAPAA8AAAVS4Cdmg2hGZ6oqaUgMQzC8LwwFMCzDNszCMAzHMFTFUizFMAzHMFRVUixFMAzHMFTFUixFMAzHMLwfEFFFUixFMAzHMFRVUixFMDwfEBAAOw=="
  }
};

// Alternate actual sample GIFs (using reliable fallbacks if base64 placeholder styling is identical)
// We will generate the static canvases directly from the active GIF elements.

document.addEventListener('DOMContentLoaded', () => {
  // Global State
  const state = {
    connected: true,
    enabled: true,
    flowEnabled: true,
    flowStyle: 'particles',
    flowSpeed: 'medium',
    activeGifs: 0,
    selectedElement: null,
    draggedElement: null,
    dragOffset: { x: 0, y: 0 },
    nextId: 1
  };

  // Elements
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const statusBanner = document.getElementById('statusBanner');
  const gifToggle = document.getElementById('gifToggle');
  const gifCount = document.getElementById('gifCount');
  const engineStatus = document.getElementById('engineStatus');
  
  const flowToggle = document.getElementById('flowToggle');
  const flowStyle = document.getElementById('flowStyle');
  const flowSpeed = document.getElementById('flowSpeed');
  const flowSettingsGroup = document.getElementById('flowSettingsGroup');
  
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

  // SOUND HOOKS FOR STANDARD INTERACTION
  const addSoundHooks = () => {
    document.querySelectorAll('button, a, .sample-item, .faq-item, .control-btn').forEach(el => {
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
      engineStatus.textContent = state.enabled ? "Running" : "Paused";
      
      flowToggle.disabled = false;
      flowToggle.checked = state.flowEnabled;
      flowStyle.disabled = !state.flowEnabled;
      flowSpeed.disabled = !state.flowEnabled;
      flowSettingsGroup.style.display = state.flowEnabled ? 'flex' : 'none';
    } else {
      // Check if we want a loading state or absolute disconnected
      if (isLoading) {
        statusBanner.classList.add('loading');
        statusText.textContent = "Canvas Loading...";
        gifToggle.disabled = true;
        gifToggle.checked = false;
        engineStatus.textContent = "-";
      } else {
        statusBanner.classList.add('disconnected');
        statusText.textContent = "Open excalidraw.com";
        gifToggle.disabled = true;
        gifToggle.checked = false;
        engineStatus.textContent = "Inactive";
      }
      
      flowToggle.disabled = true;
      flowToggle.checked = false;
      flowStyle.disabled = true;
      flowSpeed.disabled = true;
      flowSettingsGroup.style.display = 'none';
    }

    // Update count display
    gifCount.textContent = state.connected ? state.activeGifs : "0";

    // Toggle active classes on simulation controllers
    btnConnected.classList.toggle('active', isConn);
    btnDisconnected.classList.toggle('active', !state.connected && !isLoading);
    btnLoading.classList.toggle('active', isLoading);

    // Update playground items animation based on dashboard state
    updatePlaygroundAnimationState();
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
      
      // Simulate loading done in 2 seconds automatically to satisfy interactive flow
      setTimeout(() => {
        if (statusBanner.dataset.state === 'loading') {
          setConnectionState('connected');
        }
      }, 2000);
    }
    updateSimulatorUI();
  };

  // Toggle extension ON/OFF
  gifToggle.addEventListener('change', () => {
    state.enabled = gifToggle.checked;
    playToggle(state.enabled);
    updateSimulatorUI();
  });

  // Toggle flow animations ON/OFF
  flowToggle.addEventListener('change', () => {
    state.flowEnabled = flowToggle.checked;
    playToggle(state.flowEnabled);
    updateSimulatorUI();
  });

  flowStyle.addEventListener('change', () => {
    state.flowStyle = flowStyle.value;
    playSelect();
    updateSimulatorUI();
  });

  flowSpeed.addEventListener('change', () => {
    state.flowSpeed = flowSpeed.value;
    playSelect();
    updateSimulatorUI();
  });

  // Simulator State Controllers
  btnConnected.addEventListener('click', () => setConnectionState('connected'));
  btnDisconnected.addEventListener('click', () => setConnectionState('disconnected'));
  btnLoading.addEventListener('click', () => setConnectionState('loading'));

  // Header / Call To Actions click sounds
  installBtn.addEventListener('click', (e) => {
    e.preventDefault();
    playSuccess();
    alert("🌟 ExcaliGif Installed! (Simulated - follow installation steps below to load unpacked extension)");
  });

  demoBtn.addEventListener('click', (e) => {
    e.preventDefault();
    playSuccess();
    document.getElementById('playground').scrollIntoView({ behavior: 'smooth' });
  });

  // Playground Board logic
  const checkEmptyState = () => {
    const items = canvasBoard.querySelectorAll('.canvas-element');
    state.activeGifs = items.length;
    
    if (items.length === 0) {
      canvasEmptyState.style.display = 'flex';
    } else {
      canvasEmptyState.style.display = 'none';
    }
    updateSimulatorUI();
  };

  // Update how elements render based on extension enabled/disabled state
  const updatePlaygroundAnimationState = () => {
    const isRunning = state.connected && state.enabled;
    const elements = canvasBoard.querySelectorAll('.canvas-element');
    
    elements.forEach(el => {
      const img = el.querySelector('.el-img');
      const canvas = el.querySelector('.el-static-canvas');
      const label = el.querySelector('.el-label');
      const isArrow = el.classList.contains('element-arrow');
      
      if (isArrow) {
        const svg = el.querySelector('svg');
        const isFlowActive = isRunning && state.flowEnabled;
        
        if (label) {
          label.textContent = isFlowActive ? `FLOW: ${state.flowStyle.toUpperCase()}` : "STATIC FLOW";
          label.style.backgroundColor = isFlowActive ? "var(--color-primary)" : "var(--color-text-muted)";
        }
        
        el.classList.toggle('style-particles', state.flowStyle === 'particles');
        el.classList.toggle('style-dashes', state.flowStyle === 'dashes');
        el.classList.toggle('static', !isFlowActive);
        
        // Update speed class/attributes
        let dur = '2s';
        if (state.flowSpeed === 'slow') dur = '4s';
        if (state.flowSpeed === 'fast') dur = '0.7s';
        
        const anims = el.querySelectorAll('animateMotion');
        anims.forEach(anim => {
          anim.setAttribute('dur', dur);
        });
        
        // Update marching dashes speed
        const marchingAnts = el.querySelector('.marching-ants');
        if (marchingAnts) {
          let animDuration = '1.2s';
          if (state.flowSpeed === 'slow') animDuration = '2.4s';
          if (state.flowSpeed === 'fast') animDuration = '0.4s';
          marchingAnts.style.animationDuration = animDuration;
        }
        
        if (svg) {
          if (isFlowActive) {
            svg.unpauseAnimations();
          } else {
            svg.pauseAnimations();
          }
        }
      } else {
        if (isRunning) {
          el.classList.remove('static');
          img.style.display = 'block';
          canvas.style.display = 'none';
          label.textContent = "GIF ACTIVE";
          label.style.backgroundColor = "var(--color-success)";
        } else {
          el.classList.add('static');
          img.style.display = 'none';
          canvas.style.display = 'block';
          label.textContent = "STATIC FRAME";
          label.style.backgroundColor = "var(--color-text-muted)";
          
          // Render first frame of GIF onto static canvas
          try {
            const ctx = canvas.getContext('2d');
            canvas.width = img.naturalWidth || 64;
            canvas.height = img.naturalHeight || 64;
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          } catch (err) {
            // Fallback if drawImage fails (e.g. cross-origin, or image not loaded yet)
            console.log("Canvas drawImage fallback:", err);
          }
        }
      }
    });
  };

  // Add a GIF element to the simulated Excalidraw board
  const addGifToBoard = (gifSrc, name, posX = 100, posY = 100) => {
    const elId = `el-${state.nextId++}`;
    
    const wrapper = document.createElement('div');
    wrapper.className = 'canvas-element selected';
    wrapper.id = elId;
    wrapper.style.left = `${posX}px`;
    wrapper.style.top = `${posY}px`;

    // Create img element (playing state)
    const img = document.createElement('img');
    img.src = gifSrc;
    img.className = 'el-img';
    img.alt = name;
    
    // Create static canvas element (paused state)
    const canvas = document.createElement('canvas');
    canvas.className = 'el-static-canvas';
    canvas.style.display = 'none';
    canvas.width = 64;
    canvas.height = 64;

    // Badge label
    const label = document.createElement('div');
    label.className = 'el-label';
    label.textContent = "GIF ACTIVE";

    wrapper.appendChild(img);
    wrapper.appendChild(canvas);
    wrapper.appendChild(label);
    
    // Select the newly added element
    if (state.selectedElement) {
      state.selectedElement.classList.remove('selected');
    }
    state.selectedElement = wrapper;

    // Mouse events for dragging
    wrapper.addEventListener('mousedown', (e) => {
      // Don't drag if clicking badge
      if (e.target.classList.contains('el-label')) return;
      
      e.preventDefault();
      playSelect();
      
      if (state.selectedElement) {
        state.selectedElement.classList.remove('selected');
      }
      state.selectedElement = wrapper;
      wrapper.classList.add('selected');
      
      state.draggedElement = wrapper;
      state.dragOffset.x = e.clientX - wrapper.offsetLeft;
      state.dragOffset.y = e.clientY - wrapper.offsetTop;
    });

    // Generate static frame on load
    img.onload = () => {
      updatePlaygroundAnimationState();
    };

    canvasBoard.appendChild(wrapper);
    playSuccess();
    checkEmptyState();
  };

  // Add a Vector element to the simulated whiteboard
  const addArrowToBoard = (points, arrowheadPoints, w, h, name, posX = 100, posY = 100) => {
    const elId = `el-${state.nextId++}`;
    
    const wrapper = document.createElement('div');
    wrapper.className = 'canvas-element element-arrow selected';
    wrapper.id = elId;
    wrapper.style.left = `${posX}px`;
    wrapper.style.top = `${posY}px`;
    wrapper.style.width = `${w}px`;
    wrapper.style.height = `${h}px`;

    wrapper.innerHTML = `
      <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
        <path d="${points}" class="flow-arrow-line" stroke="var(--color-text-main)" stroke-width="4" fill="none" />
        <path d="${points}" class="flow-arrow-line marching-ants" stroke="var(--color-primary)" stroke-width="4" stroke-dasharray="10, 6" fill="none" style="display: none;" />
        <g class="flow-particles" style="display: none;">
          <circle r="5" fill="var(--color-primary)" filter="drop-shadow(0px 0px 3px var(--color-primary))">
            <animateMotion dur="2s" repeatCount="indefinite" path="${points}" begin="0s" />
          </circle>
          <circle r="5" fill="var(--color-primary)" filter="drop-shadow(0px 0px 3px var(--color-primary))">
            <animateMotion dur="2s" repeatCount="indefinite" path="${points}" begin="0.5s" />
          </circle>
          <circle r="5" fill="var(--color-primary)" filter="drop-shadow(0px 0px 3px var(--color-primary))">
            <animateMotion dur="2s" repeatCount="indefinite" path="${points}" begin="1s" />
          </circle>
          <circle r="5" fill="var(--color-primary)" filter="drop-shadow(0px 0px 3px var(--color-primary))">
            <animateMotion dur="2s" repeatCount="indefinite" path="${points}" begin="1.5s" />
          </circle>
        </g>
        <polygon points="${arrowheadPoints}" class="flow-arrow-head" fill="var(--color-text-main)" />
      </svg>
      <div class="el-label" style="background-color: var(--color-primary)">FLOW: PARTICLES</div>
    `;

    // Select the newly added element
    if (state.selectedElement) {
      state.selectedElement.classList.remove('selected');
    }
    state.selectedElement = wrapper;

    // Mouse events for dragging
    wrapper.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('el-label')) return;
      
      e.preventDefault();
      playSelect();
      
      if (state.selectedElement) {
        state.selectedElement.classList.remove('selected');
      }
      state.selectedElement = wrapper;
      wrapper.classList.add('selected');
      
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
    playError();
    checkEmptyState();
  });

  // Select item samples triggers
  sampleHeart.addEventListener('click', () => {
    // Adding a nice pixel heart GIF
    const gifUrl = "https://static.klipy.com/ii/f87f46a2c5aeaeed4c68910815f73eaf/b2/8e/ubnyCmzy.gif"; // Reliable retro heart
    addGifToBoard(gifUrl, "Heart Pixel", 120, 100);
  });

  sampleCoin.addEventListener('click', () => {
    const gifUrl = "https://static.klipy.com/ii/71b2873e478b9d8d0482ea3ec777ba7f/15/36/izQlaTmV.gif"; // Spinning coin
    addGifToBoard(gifUrl, "Coin Spin", 260, 150);
  });

  sampleGhost.addEventListener('click', () => {
    const gifUrl = "https://static.klipy.com/ii/4493325008d34b7bf8cd6813cd5c1619/87/ad/71WOMbwke67fmBx.gif"; // Pacman ghost
    addGifToBoard(gifUrl, "Ghost Pixel", 180, 80);
  });

  // Select vector element triggers
  spawnArrow.addEventListener('click', () => {
    addArrowToBoard(
      "M 10 35 L 230 35",
      "230,35 218,28 218,42",
      250, 70,
      "Flow Arrow",
      100, 150
    );
  });

  spawnZigzag.addEventListener('click', () => {
    addArrowToBoard(
      "M 10 10 L 110 60 L 150 15 L 270 45",
      "270,45 258,38 258,52",
      290, 70,
      "Zigzag Flow",
      120, 120
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
        alert("⚠️ Please drop an animated GIF file (.gif) only!");
      }
    }
  });

  // Track dragging across screen
  document.addEventListener('mousemove', (e) => {
    if (state.draggedElement) {
      const el = state.draggedElement;
      let newX = e.clientX - state.dragOffset.x;
      let newY = e.clientY - state.dragOffset.y;
      
      // Bound checking inside canvasBoard
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
        state.selectedElement.classList.remove('selected');
        state.selectedElement = null;
      }
    }
  });

  // Delete key deletes selected elements
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedElement) {
      state.selectedElement.remove();
      state.selectedElement = null;
      playError();
      checkEmptyState();
    }
  });

  // FAQ Accordion logic
  document.querySelectorAll('.faq-item').forEach(item => {
    item.addEventListener('click', () => {
      const isActive = item.classList.contains('active');
      
      // Close all first
      document.querySelectorAll('.faq-item').forEach(el => el.classList.remove('active'));
      
      if (!isActive) {
        item.classList.add('active');
        playSuccess();
      } else {
        playToggle(false);
      }
    });
  });

  // Init UI
  updateSimulatorUI();
  addSoundHooks();

  // Dynamically hook sound events on newly added elements too
  const observer = new MutationObserver(() => {
    addSoundHooks();
  });
  observer.observe(document.body, { childList: true, subtree: true });
});
