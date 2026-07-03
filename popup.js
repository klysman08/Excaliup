// ExcaliGif Popup logic
// Communicates with Excalidraw's content script to query status and toggle execution state

document.addEventListener('DOMContentLoaded', async () => {
  const statusBanner = document.getElementById('statusBanner');
  const statusText = document.getElementById('statusText');
  const gifToggle = document.getElementById('gifToggle');
  const gifCount = document.getElementById('gifCount');
  const engineStatus = document.getElementById('engineStatus');
  const versionLabel = document.getElementById('versionLabel');
  
  const flowToggle = document.getElementById('flowToggle');

  versionLabel.textContent = `v${chrome.runtime.getManifest().version}`;

  // GIF playback controls
  const gifSpeed = document.getElementById('gifSpeed');
  const gifSettingsGroup = document.getElementById('gifSettingsGroup');

  // Query the current active tab
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  
  if (!tab || !tab.url || !tab.url.includes('excalidraw.com')) {
    showDisconnected("Open excalidraw.com");
    return;
  }

  // Request status from the injected script (via content script)
  try {
    chrome.tabs.sendMessage(tab.id, { action: "getStatus" }, (response) => {
      // Check if runtime encountered an error (e.g. content script not loaded yet)
      if (chrome.runtime.lastError || !response) {
        showDisconnected("Refresh excalidraw.com");
        return;
      }
      
      showConnected(response);
    });
  } catch (e) {
    showDisconnected("Extension Error");
  }

  function showConnected(status) {
    statusBanner.className = "status-banner connected";
    statusText.textContent = status.connected ? "Excalidraw Connected" : "Canvas Loading...";
    
    gifToggle.disabled = !status.connected;
    flowToggle.disabled = !status.connected;
    gifSpeed.disabled = !status.connected;

    // Load current settings from response or use defaults
    const settings = status.settings || {
      gifsEnabled: status.enabled,
      flowEnabled: true,
      gifSpeed: 1
    };

    gifToggle.checked = settings.gifsEnabled;
    flowToggle.checked = settings.flowEnabled;
    gifSpeed.value = settings.gifSpeed || 1;

    gifSettingsGroup.style.display = settings.gifsEnabled ? 'flex' : 'none';

    gifCount.textContent = status.activeGifCount;
    document.getElementById('animatedCount').textContent = status.animatedElementCount || 0;
    engineStatus.textContent = settings.gifsEnabled || settings.flowEnabled ? "Running" : "Paused";
    
    // Broadcast setting changes
    const updateSettings = () => {
      const currentSettings = {
        gifsEnabled: gifToggle.checked,
        flowEnabled: flowToggle.checked,
        gifSpeed: parseFloat(gifSpeed.value)
      };
      
      gifSettingsGroup.style.display = currentSettings.gifsEnabled ? 'flex' : 'none';
      
      chrome.tabs.sendMessage(tab.id, { action: "updateSettings", settings: currentSettings }, (response) => {
        engineStatus.textContent = currentSettings.gifsEnabled || currentSettings.flowEnabled ? "Running" : "Paused";
      });
    };

    gifToggle.onchange = updateSettings;
    flowToggle.onchange = updateSettings;
    gifSpeed.onchange = updateSettings;
  }

  function showDisconnected(reason) {
    statusBanner.className = "status-banner disconnected";
    statusText.textContent = reason;
    
    gifToggle.disabled = true;
    gifToggle.checked = false;
    flowToggle.disabled = true;
    flowToggle.checked = false;
    gifSpeed.disabled = true;
    gifSettingsGroup.style.display = 'none';
    gifCount.textContent = "0";
    document.getElementById('animatedCount').textContent = "0";
    engineStatus.textContent = "Inactive";
  }
});
