// ExcaliGif Popup logic
// Communicates with Excalidraw's content script to query status and toggle execution state

document.addEventListener('DOMContentLoaded', async () => {
  const statusBanner = document.getElementById('statusBanner');
  const statusText = document.getElementById('statusText');
  const gifToggle = document.getElementById('gifToggle');
  const gifCount = document.getElementById('gifCount');
  const engineStatus = document.getElementById('engineStatus');
  
  const flowToggle = document.getElementById('flowToggle');
  const flowStyle = document.getElementById('flowStyle');
  const flowSpeed = document.getElementById('flowSpeed');
  const flowSettingsGroup = document.getElementById('flowSettingsGroup');

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
    flowStyle.disabled = !status.connected;
    flowSpeed.disabled = !status.connected;

    // Load current settings from response or use defaults
    const settings = status.settings || {
      gifsEnabled: status.enabled,
      flowEnabled: true,
      flowStyle: 'particles',
      flowSpeed: 'medium'
    };

    gifToggle.checked = settings.gifsEnabled;
    flowToggle.checked = settings.flowEnabled;
    flowStyle.value = settings.flowStyle;
    flowSpeed.value = settings.flowSpeed;
    flowSettingsGroup.style.display = settings.flowEnabled ? 'flex' : 'none';

    gifCount.textContent = status.activeGifCount;
    engineStatus.textContent = settings.gifsEnabled ? "Running" : "Paused";
    
    // Broadcast setting changes
    const updateSettings = () => {
      const currentSettings = {
        gifsEnabled: gifToggle.checked,
        flowEnabled: flowToggle.checked,
        flowStyle: flowStyle.value,
        flowSpeed: flowSpeed.value
      };
      
      flowSettingsGroup.style.display = currentSettings.flowEnabled ? 'flex' : 'none';
      
      chrome.tabs.sendMessage(tab.id, { action: "updateSettings", settings: currentSettings }, (response) => {
        engineStatus.textContent = currentSettings.gifsEnabled ? "Running" : "Paused";
      });
    };

    gifToggle.onchange = updateSettings;
    flowToggle.onchange = updateSettings;
    flowStyle.onchange = updateSettings;
    flowSpeed.onchange = updateSettings;
  }

  function showDisconnected(reason) {
    statusBanner.className = "status-banner disconnected";
    statusText.textContent = reason;
    
    gifToggle.disabled = true;
    gifToggle.checked = false;
    flowToggle.disabled = true;
    flowToggle.checked = false;
    flowStyle.disabled = true;
    flowSpeed.disabled = true;
    flowSettingsGroup.style.display = 'none';
    gifCount.textContent = "0";
    engineStatus.textContent = "Inactive";
  }
});

