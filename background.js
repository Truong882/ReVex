/**
 * ReVex Background Script
 * Role 1: Capture outgoing HTTP requests via webRequest API
 * Role 2: Execute fetch requests relayed from the panel (CORS bypass)
 */

// ============================================================================
// REQUEST HISTORY STORAGE
// ============================================================================

const MAX_HISTORY_SIZE = 50;
let requestHistory = [];
let requestIdCounter = 0;

/**
 * Add a request to history with circular buffer behavior
 * @param {Object} requestData - The request data to store
 */
function addToHistory(requestData) {
  requestData.id = ++requestIdCounter;
  requestData.timestamp = Date.now();
  
  requestHistory.unshift(requestData);
  
  // Keep only the last MAX_HISTORY_SIZE requests
  if (requestHistory.length > MAX_HISTORY_SIZE) {
    requestHistory.pop();
  }
}

// ============================================================================
// ROLE 1: THE LISTENER - Capture outgoing requests
// ============================================================================

browser.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    // Only capture main document and XHR/fetch requests
    const validTypes = ['main_frame', 'sub_frame', 'xmlhttprequest', 'other'];
    if (!validTypes.includes(details.type)) {
      return;
    }

    // Build headers object from array
    const headers = {};
    if (details.requestHeaders) {
      for (const header of details.requestHeaders) {
        headers[header.name] = header.value;
      }
    }

    // Extract request data
    const requestData = {
      method: details.method,
      url: details.url,
      headers: headers,
      type: details.type,
      tabId: details.tabId,
      body: null // Body isn't available in onBeforeSendHeaders
    };

    addToHistory(requestData);

    // Notify any open panels about the new request
    browser.runtime.sendMessage({
      action: 'newRequest',
      request: requestData
    }).catch(() => {
      // Panel might not be open, ignore the error
    });
  },
  { urls: ['<all_urls>'] },
  ['requestHeaders']
);

// Try to capture request body via onBeforeRequest
browser.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.requestBody) {
      // Find the matching request in history and update its body
      const matchingRequest = requestHistory.find(
        req => req.url === details.url && req.method === details.method && !req.body
      );
      
      if (matchingRequest) {
        if (details.requestBody.raw) {
          // Decode raw body data
          const decoder = new TextDecoder('utf-8');
          const bodyParts = details.requestBody.raw.map(part => {
            if (part.bytes) {
              return decoder.decode(part.bytes);
            }
            return '';
          });
          matchingRequest.body = bodyParts.join('');
        } else if (details.requestBody.formData) {
          // Convert form data to string
          matchingRequest.body = JSON.stringify(details.requestBody.formData);
        }
      }
    }
  },
  { urls: ['<all_urls>'] },
  ['requestBody']
);

// ============================================================================
// ROLE 2: THE EXECUTOR - Relay fetch requests from panel
// ============================================================================

browser.runtime.onMessage.addListener((message, sender) => {
  // Handle request for history
  if (message.action === 'getHistory') {
    return Promise.resolve({ history: requestHistory });
  }

  // Handle clearing history
  if (message.action === 'clearHistory') {
    requestHistory = [];
    requestIdCounter = 0;
    return Promise.resolve({ success: true });
  }

  // Handle executing a request (the CORS bypass)
  if (message.action === 'executeRequest') {
    return executeRequest(message.requestData);
  }

  return false;
});

/**
 * Execute a fetch request from the background context
 * This bypasses CORS restrictions using extension privileges
 * @param {Object} requestData - The request configuration
 * @returns {Promise<Object>} - The response data
 */
async function executeRequest(requestData) {
  try {
    const { method, url, headers, body } = requestData;

    // Build fetch options
    const fetchOptions = {
      method: method,
      headers: {},
      mode: 'cors',
      credentials: 'omit'
    };

    // Parse and set headers
    if (headers) {
      let parsedHeaders = headers;
      if (typeof headers === 'string') {
        try {
          parsedHeaders = JSON.parse(headers);
        } catch (e) {
          // If not valid JSON, try to parse as key: value format
          parsedHeaders = {};
          const lines = headers.split('\n');
          for (const line of lines) {
            const colonIndex = line.indexOf(':');
            if (colonIndex > 0) {
              const key = line.substring(0, colonIndex).trim();
              const value = line.substring(colonIndex + 1).trim();
              if (key) {
                parsedHeaders[key] = value;
              }
            }
          }
        }
      }
      fetchOptions.headers = parsedHeaders;
    }

    // Add body for non-GET requests
    if (body && method !== 'GET' && method !== 'HEAD') {
      fetchOptions.body = body;
    }

    // Execute the fetch
    const startTime = performance.now();
    const response = await fetch(url, fetchOptions);
    const endTime = performance.now();

    // Read response body
    const responseBody = await response.text();

    // Build response headers object
    const responseHeaders = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    return {
      success: true,
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      body: responseBody,
      time: Math.round(endTime - startTime)
    };

  } catch (error) {
    return {
      success: false,
      error: error.message || 'Unknown error occurred',
      status: 0,
      statusText: 'Error',
      headers: {},
      body: ''
    };
  }
}

// Log startup
console.log('[ReVex] Background script initialized');
