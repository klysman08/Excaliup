// Excali Up content script
// Proxy content script that routes messages between the popup (isolated world)
// and the Excalidraw page context (main world) via custom DOM events


// Listen for messages from the popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "toggleState") {
    // Forward the message to the injected script via a custom DOM event
    const event = new CustomEvent('ExcaliGifToggleState', { detail: { enabled: message.enabled } });
    document.dispatchEvent(event);
    sendResponse({ status: "forwarded" });
  } else if (message.action === "updateSettings") {
    const event = new CustomEvent('ExcaliGifUpdateSettings', { detail: message.settings });
    document.dispatchEvent(event);
    sendResponse({ status: "forwarded" });
  } else if (message.action === "getStatus") {
    let responded = false;
    
    // Setup a one-time event listener to catch the response from the injected script
    const responseHandler = (e) => {
      if (responded) return;
      responded = true;
      document.removeEventListener('ExcaliGifStatusResponse', responseHandler);
      sendResponse(e.detail);
    };
    document.addEventListener('ExcaliGifStatusResponse', responseHandler);
    
    // Query the page context for status by sending a custom event
    const queryEvent = new CustomEvent('ExcaliGifQueryStatus');
    document.dispatchEvent(queryEvent);
    
    // Safety fallback timeout (150ms) in case inject.js is not loaded or errored
    setTimeout(() => {
      if (!responded) {
        responded = true;
        document.removeEventListener('ExcaliGifStatusResponse', responseHandler);
        sendResponse({ connected: false, enabled: false, activeGifCount: 0 });
      }
    }, 150);
    
    // Return true to indicate we will respond asynchronously
    return true;
  }
});
