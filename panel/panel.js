/**
 * ReVex Panel Logic
 * Handles UI interactions, messaging with background script, and request execution
 */

// ============================================================================
// DOM ELEMENTS
// ============================================================================

const elements = {
    // History
    historyList: document.getElementById('historyList'),
    historyCount: document.getElementById('historyCount'),
    clearHistory: document.getElementById('clearHistory'),
    refreshHistory: document.getElementById('refreshHistory'),

    // Tabs
    tabBtns: document.querySelectorAll('.tab-btn'),
    requestTab: document.getElementById('requestTab'),
    responseTab: document.getElementById('responseTab'),
    responseStatusTab: document.getElementById('responseStatusTab'),

    // Editor
    requestMethod: document.getElementById('requestMethod'),
    requestUrl: document.getElementById('requestUrl'),
    requestHeaders: document.getElementById('requestHeaders'),
    requestBody: document.getElementById('requestBody'),
    prettifyBody: document.getElementById('prettifyBody'),
    decodeRequest: document.getElementById('decodeRequest'),
    sendRequest: document.getElementById('sendRequest'),
    copyCurl: document.getElementById('copyCurl'),
    requestStatus: document.getElementById('requestStatus'),

    // Response
    responseOutput: document.getElementById('responseOutput'),
    responsePreview: document.getElementById('responsePreview'),
    responseStatus: document.getElementById('responseStatus'),
    responseTime: document.getElementById('responseTime'),
    viewBtns: document.querySelectorAll('.view-btn'),
    decodeSelected: document.getElementById('decodeSelected'),

    // Search
    searchHeaders: document.getElementById('searchHeaders'),
    searchHeadersCount: document.getElementById('searchHeadersCount'),
    searchResponse: document.getElementById('searchResponse'),
    searchResponseCount: document.getElementById('searchResponseCount'),
    searchPrev: document.getElementById('searchPrev'),
    searchNext: document.getElementById('searchNext'),

    // Toast
    toast: document.getElementById('toast'),

    // Decode Modal
    decodeModal: document.getElementById('decodeModal'),
    closeModal: document.getElementById('closeModal'),
    detectedType: document.getElementById('detectedType'),
    decodedOutput: document.getElementById('decodedOutput'),
    copyDecoded: document.getElementById('copyDecoded')
};

// ============================================================================
// STATE
// ============================================================================

let selectedRequestId = null;
let currentTab = 'request';
let currentView = 'raw';
let lastResponseBody = '';

// Search state
let searchMatches = [];
let currentMatchIndex = 0;

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    initializeEventListeners();
    initializeTabs();
    initializeViewToggle();
    initializeSearch();
    initializeDecoder();
    loadHistory();
});

function initializeEventListeners() {
    // Header buttons
    elements.clearHistory.addEventListener('click', handleClearHistory);
    elements.refreshHistory.addEventListener('click', loadHistory);

    // Send button
    elements.sendRequest.addEventListener('click', handleSendRequest);

    // cURL button
    elements.copyCurl.addEventListener('click', handleCopyCurl);

    // Prettify button
    elements.prettifyBody.addEventListener('click', handlePrettifyBody);

    // Keyboard shortcut: Ctrl+Enter to send
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            handleSendRequest();
        }
        // Escape to close modal
        if (e.key === 'Escape') {
            closeDecodeModal();
        }
    });

    // Listen for new requests from background
    browser.runtime.onMessage.addListener((message) => {
        if (message.action === 'newRequest') {
            addRequestToHistory(message.request);
        }
    });
}

// ============================================================================
// PRETTIFY JSON
// ============================================================================

function handlePrettifyBody() {
    const body = elements.requestBody.value.trim();
    if (!body) return;

    try {
        const parsed = JSON.parse(body);
        elements.requestBody.value = JSON.stringify(parsed, null, 2);
    } catch (e) {
        // Not valid JSON, show visual feedback
        elements.prettifyBody.style.color = 'var(--accent-red)';
        elements.prettifyBody.textContent = '{ } INVALID JSON';
        setTimeout(() => {
            elements.prettifyBody.style.color = '';
            elements.prettifyBody.textContent = '{ } PRETTIFY';
        }, 1500);
    }
}

// ============================================================================
// VIEW TOGGLE (RAW / PREVIEW)
// ============================================================================

function initializeViewToggle() {
    elements.viewBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const viewName = btn.dataset.view;
            switchView(viewName);
        });
    });
}

function switchView(viewName) {
    currentView = viewName;

    // Update view buttons
    elements.viewBtns.forEach(btn => {
        if (btn.dataset.view === viewName) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Toggle between raw textarea and preview iframe
    if (viewName === 'raw') {
        elements.responseOutput.style.display = '';
        elements.responsePreview.style.display = 'none';
    } else {
        elements.responseOutput.style.display = 'none';
        elements.responsePreview.style.display = '';
        // Render HTML in iframe
        renderPreview(lastResponseBody);
    }
}

function renderPreview(htmlContent) {
    // Create a safe blob URL for the iframe
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const blobUrl = URL.createObjectURL(blob);
    elements.responsePreview.src = blobUrl;

    // Clean up the blob URL after loading
    elements.responsePreview.onload = () => {
        URL.revokeObjectURL(blobUrl);
    };
}

// ============================================================================
// TAB MANAGEMENT
// ============================================================================

function initializeTabs() {
    elements.tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.dataset.tab;
            switchTab(tabName);
        });
    });
}

function switchTab(tabName) {
    currentTab = tabName;

    // Update tab buttons
    elements.tabBtns.forEach(btn => {
        if (btn.dataset.tab === tabName) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Update tab content
    if (tabName === 'request') {
        elements.requestTab.classList.add('active');
        elements.responseTab.classList.remove('active');
    } else {
        elements.requestTab.classList.remove('active');
        elements.responseTab.classList.add('active');
    }
}

// ============================================================================
// HISTORY MANAGEMENT
// ============================================================================

async function loadHistory() {
    try {
        const response = await browser.runtime.sendMessage({ action: 'getHistory' });
        renderHistory(response.history || []);
    } catch (error) {
        console.error('[ReVex] Failed to load history:', error);
        showEmptyState();
    }
}

async function handleClearHistory() {
    try {
        await browser.runtime.sendMessage({ action: 'clearHistory' });
        selectedRequestId = null;
        clearEditor();
        showEmptyState();
        updateHistoryCount(0);
    } catch (error) {
        console.error('[ReVex] Failed to clear history:', error);
    }
}

function renderHistory(history) {
    if (!history || history.length === 0) {
        showEmptyState();
        updateHistoryCount(0);
        return;
    }

    elements.historyList.innerHTML = '';

    history.forEach((request) => {
        const item = createHistoryItem(request);
        elements.historyList.appendChild(item);
    });

    updateHistoryCount(history.length);
}

function addRequestToHistory(request) {
    // Remove empty state if present
    const emptyState = elements.historyList.querySelector('.empty-state');
    if (emptyState) {
        emptyState.remove();
    }

    // Add new item at the top
    const item = createHistoryItem(request);
    elements.historyList.insertBefore(item, elements.historyList.firstChild);

    // Update count
    const currentCount = elements.historyList.querySelectorAll('.history-item').length;
    updateHistoryCount(currentCount);
}

function createHistoryItem(request) {
    const item = document.createElement('div');
    item.className = 'history-item';
    item.dataset.requestId = request.id;

    // Extract path from URL
    let displayPath;
    try {
        const url = new URL(request.url);
        displayPath = url.pathname + url.search;
        if (displayPath.length > 50) {
            displayPath = displayPath.substring(0, 47) + '...';
        }
    } catch (e) {
        displayPath = request.url;
    }

    // Format timestamp
    const time = new Date(request.timestamp);
    const timeStr = time.toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });

    // Build item using safe DOM manipulation (no innerHTML)
    const methodSpan = document.createElement('span');
    methodSpan.className = `history-method ${request.method.toLowerCase()}`;
    methodSpan.textContent = request.method;

    const pathSpan = document.createElement('span');
    pathSpan.className = 'history-path';
    pathSpan.title = request.url;
    pathSpan.textContent = displayPath;

    const timeSpan = document.createElement('span');
    timeSpan.className = 'history-time';
    timeSpan.textContent = timeStr;

    item.appendChild(methodSpan);
    item.appendChild(pathSpan);
    item.appendChild(timeSpan);

    item.addEventListener('click', () => selectRequest(request, item));

    return item;
}

function selectRequest(request, itemElement) {
    // Update selection state
    const previousSelected = elements.historyList.querySelector('.history-item.selected');
    if (previousSelected) {
        previousSelected.classList.remove('selected');
    }
    itemElement.classList.add('selected');
    selectedRequestId = request.id;

    // Populate editor
    populateEditor(request);
}

function showEmptyState() {
    elements.historyList.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">◎</div>
      <div class="empty-text">NO REQUESTS CAPTURED</div>
      <div class="empty-subtext">Navigate to capture HTTP traffic</div>
    </div>
  `;
}

function updateHistoryCount(count) {
    elements.historyCount.textContent = `[${count}]`;
}

// ============================================================================
// EDITOR MANAGEMENT
// ============================================================================

function populateEditor(request) {
    elements.requestMethod.value = request.method;
    elements.requestUrl.value = request.url;

    // Format headers as raw HTTP lines (Header: Value) like Burp Suite
    const headers = request.headers || {};
    const headerLines = [];
    for (const [key, value] of Object.entries(headers)) {
        headerLines.push(`${key}: ${value}`);
    }
    elements.requestHeaders.value = headerLines.join('\n');

    elements.requestBody.value = request.body || '';

    // Clear previous response
    clearResponse();
}

function clearEditor() {
    elements.requestMethod.value = 'GET';
    elements.requestUrl.value = '';
    elements.requestHeaders.value = '';
    elements.requestBody.value = '';
    clearResponse();
}

function clearResponse() {
    elements.responseOutput.value = '';
    elements.responseStatus.textContent = '';
    elements.responseStatus.className = 'response-status-badge';
    elements.responseTime.textContent = '';
    elements.requestStatus.textContent = '';
    elements.requestStatus.className = 'request-status';
}

// ============================================================================
// REQUEST EXECUTION
// ============================================================================

async function handleSendRequest() {
    const url = elements.requestUrl.value.trim();

    if (!url) {
        elements.requestStatus.textContent = 'ERROR: No URL specified';
        elements.requestStatus.className = 'request-status';
        return;
    }

    // Validate URL
    try {
        new URL(url);
    } catch (e) {
        elements.requestStatus.textContent = 'ERROR: Invalid URL format';
        elements.requestStatus.className = 'request-status';
        return;
    }

    // Set loading state
    setLoadingState(true);

    // Parse raw HTTP headers into object
    const rawHeaders = elements.requestHeaders.value;
    const parsedHeaders = {};
    if (rawHeaders.trim()) {
        const lines = rawHeaders.split('\n');
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

    const requestData = {
        method: elements.requestMethod.value,
        url: url,
        headers: parsedHeaders,
        body: elements.requestBody.value
    };

    try {
        const response = await browser.runtime.sendMessage({
            action: 'executeRequest',
            requestData: requestData
        });

        displayResponse(response);
    } catch (error) {
        displayError(error.message || 'Unknown error occurred');
    } finally {
        setLoadingState(false);
    }
}

function setLoadingState(loading) {
    if (loading) {
        elements.sendRequest.classList.add('loading');
        elements.sendRequest.disabled = true;
        elements.requestStatus.textContent = 'Sending request';
        elements.requestStatus.className = 'request-status loading';
    } else {
        elements.sendRequest.classList.remove('loading');
        elements.sendRequest.disabled = false;
        elements.requestStatus.textContent = '';
        elements.requestStatus.className = 'request-status';
    }
}

function displayResponse(response) {
    if (!response.success) {
        displayError(response.error);
        return;
    }

    // Status badge
    const statusCode = response.status;
    let statusClass = 'success';
    if (statusCode >= 300 && statusCode < 400) statusClass = 'redirect';
    else if (statusCode >= 400 && statusCode < 500) statusClass = 'client-error';
    else if (statusCode >= 500) statusClass = 'server-error';

    elements.responseStatus.textContent = `${statusCode} ${response.statusText}`;
    elements.responseStatus.className = `response-status-badge ${statusClass}`;

    // Update tab status badge
    elements.responseStatusTab.textContent = statusCode;
    elements.responseStatusTab.className = `tab-status ${statusClass}`;

    // Response time
    elements.responseTime.textContent = `${response.time}ms`;

    // Store raw body for preview mode
    lastResponseBody = response.body;

    // Format response body
    let formattedBody = response.body;

    // Try to pretty-print JSON
    try {
        const contentType = response.headers['content-type'] || '';
        if (contentType.includes('application/json') || formattedBody.trim().startsWith('{') || formattedBody.trim().startsWith('[')) {
            const parsed = JSON.parse(formattedBody);
            formattedBody = JSON.stringify(parsed, null, 2);
        }
    } catch (e) {
        // Not JSON, keep as-is
    }

    // Build raw HTTP response like Burp Suite
    let output = `HTTP/1.1 ${statusCode} ${response.statusText}\n`;

    // Response headers in raw format
    for (const [key, value] of Object.entries(response.headers)) {
        output += `${key}: ${value}\n`;
    }

    // Blank line between headers and body
    output += `\n`;
    output += formattedBody;

    elements.responseOutput.value = output;

    // Reset to RAW view and auto-switch to Response tab
    switchView('raw');
    switchTab('response');
}

function displayError(errorMessage) {
    elements.responseStatus.textContent = 'ERROR';
    elements.responseStatus.className = 'response-status-badge error';
    elements.responseStatusTab.textContent = 'ERR';
    elements.responseStatusTab.className = 'tab-status error';
    elements.responseTime.textContent = '';
    lastResponseBody = '';
    elements.responseOutput.value = `// ERROR\n// ─────────────────────────────────────────\n\n${errorMessage}`;

    // Reset to RAW view and auto-switch to Response tab
    switchView('raw');
    switchTab('response');
}

// ============================================================================
// UTILITIES
// ============================================================================

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================================
// FEATURE 1: COPY AS cURL
// ============================================================================

function handleCopyCurl() {
    const method = elements.requestMethod.value;
    const url = elements.requestUrl.value;
    const headersText = elements.requestHeaders.value;
    const body = elements.requestBody.value;

    // Parse headers
    const headers = {};
    headersText.split('\n').forEach(line => {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
            const key = line.substring(0, colonIndex).trim();
            const value = line.substring(colonIndex + 1).trim();
            if (key) headers[key] = value;
        }
    });

    const curlCommand = generateCurlCommand(method, url, headers, body);

    navigator.clipboard.writeText(curlCommand).then(() => {
        showToast('[SYSTEM] :: PAYLOAD COPIED TO CLIPBOARD');
    }).catch(err => {
        console.error('Failed to copy cURL:', err);
        showToast('[ERROR] :: COPY FAILED');
    });
}

function generateCurlCommand(method, url, headers, body) {
    let cmd = `curl -X ${method}`;

    // Add URL
    cmd += ` '${url}'`;

    // Add headers
    for (const [key, value] of Object.entries(headers)) {
        // Escape single quotes in header values
        const escapedValue = value.replace(/'/g, "'\\''");
        cmd += ` \\\n  -H '${key}: ${escapedValue}'`;
    }

    // Add body if present
    if (body && body.trim()) {
        // Escape single quotes in body for bash
        const escapedBody = body.replace(/'/g, "'\\''");
        cmd += ` \\\n  -d '${escapedBody}'`;
    }

    return cmd;
}

// ============================================================================
// TOAST NOTIFICATION
// ============================================================================

function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add('show');

    setTimeout(() => {
        elements.toast.classList.remove('show');
    }, 2000);
}

// ============================================================================
// FEATURE 2: MAGIC DECODER
// ============================================================================

function initializeDecoder() {
    elements.decodeSelected.addEventListener('click', () => handleDecode('response'));
    elements.decodeRequest.addEventListener('click', () => handleDecode('request'));
    elements.closeModal.addEventListener('click', closeDecodeModal);
    elements.copyDecoded.addEventListener('click', handleCopyDecoded);

    // Close modal when clicking outside
    elements.decodeModal.addEventListener('click', (e) => {
        if (e.target === elements.decodeModal) {
            closeDecodeModal();
        }
    });
}

function handleDecode(source) {
    let selectedText = '';

    if (source === 'response') {
        // Get selected text from response textarea
        const textarea = elements.responseOutput;
        selectedText = textarea.value.substring(textarea.selectionStart, textarea.selectionEnd).trim();
    } else {
        // Check both headers and body for selection in request tab
        const headersTextarea = elements.requestHeaders;
        const bodyTextarea = elements.requestBody;

        // Check headers first
        const headersSelection = headersTextarea.value.substring(headersTextarea.selectionStart, headersTextarea.selectionEnd).trim();
        const bodySelection = bodyTextarea.value.substring(bodyTextarea.selectionStart, bodyTextarea.selectionEnd).trim();

        selectedText = headersSelection || bodySelection;
    }

    if (!selectedText) {
        showToast('[SYSTEM] :: SELECT TEXT TO DECODE');
        return;
    }

    const result = smartDecode(selectedText);

    elements.detectedType.textContent = `DETECTED: ${result.type}`;
    elements.decodedOutput.value = result.output;
    elements.decodeModal.classList.add('show');
}

function smartDecode(inputString) {
    const cleaned = inputString.trim();

    // Check for JWT (starts with ey, has 2 dots)
    if (cleaned.startsWith('ey') && (cleaned.match(/\./g) || []).length === 2) {
        try {
            const parts = cleaned.split('.');
            const header = JSON.parse(atob(parts[0]));
            const payload = JSON.parse(atob(parts[1]));
            const output = `// JWT HEADER\n${JSON.stringify(header, null, 2)}\n\n// JWT PAYLOAD\n${JSON.stringify(payload, null, 2)}`;
            return { type: 'JWT', output };
        } catch (e) {
            return { type: 'JWT (CORRUPT)', output: 'Decoding Failed: Invalid JWT structure' };
        }
    }

    // Check for URL encoded (contains %)
    if (/%[0-9A-Fa-f]{2}/.test(cleaned)) {
        try {
            const decoded = decodeURIComponent(cleaned);
            return { type: 'URL Encoded', output: decoded };
        } catch (e) {
            return { type: 'URL Encoded (CORRUPT)', output: 'Decoding Failed: Invalid URL encoding' };
        }
    }

    // Check for Hex (pure hex characters, even length)
    if (/^[0-9A-Fa-f]+$/.test(cleaned) && cleaned.length % 2 === 0 && cleaned.length >= 4) {
        try {
            let decoded = '';
            for (let i = 0; i < cleaned.length; i += 2) {
                decoded += String.fromCharCode(parseInt(cleaned.substr(i, 2), 16));
            }
            // Check if result is printable
            if (/^[\x20-\x7E\s]+$/.test(decoded)) {
                return { type: 'Hex', output: decoded };
            }
        } catch (e) {
            // Fall through to Base64 check
        }
    }

    // Check for Base64 (alphanumeric, +, /, optional =)
    if (/^[A-Za-z0-9+/]+={0,2}$/.test(cleaned) && cleaned.length >= 4) {
        try {
            const decoded = atob(cleaned);
            // Check if result looks like valid text or JSON
            if (/^[\x20-\x7E\s]+$/.test(decoded) || decoded.startsWith('{') || decoded.startsWith('[')) {
                // Try to pretty-print if JSON
                try {
                    const parsed = JSON.parse(decoded);
                    return { type: 'Base64 (JSON)', output: JSON.stringify(parsed, null, 2) };
                } catch {
                    return { type: 'Base64', output: decoded };
                }
            }
            return { type: 'Base64 (Binary)', output: decoded };
        } catch (e) {
            return { type: 'Base64 (CORRUPT)', output: 'Decoding Failed: Invalid Base64' };
        }
    }

    return { type: 'Unknown', output: 'Could not detect encoding format' };
}

function closeDecodeModal() {
    elements.decodeModal.classList.remove('show');
}

function handleCopyDecoded() {
    const decoded = elements.decodedOutput.value;
    navigator.clipboard.writeText(decoded).then(() => {
        showToast('[SYSTEM] :: DECODED OUTPUT COPIED');
    }).catch(err => {
        console.error('Failed to copy decoded:', err);
    });
}

// ============================================================================
// FEATURE 3: DEEP SEARCH
// ============================================================================

function initializeSearch() {
    // Headers search
    elements.searchHeaders.addEventListener('input', (e) => {
        performSearch(e.target.value, elements.requestHeaders, elements.searchHeadersCount);
    });

    // Response search
    elements.searchResponse.addEventListener('input', (e) => {
        performSearch(e.target.value, elements.responseOutput, elements.searchResponseCount);
    });

    // Navigation buttons
    elements.searchPrev.addEventListener('click', () => navigateMatch(-1));
    elements.searchNext.addEventListener('click', () => navigateMatch(1));
}

function performSearch(query, textarea, countElement) {
    searchMatches = [];
    currentMatchIndex = 0;

    if (!query) {
        countElement.textContent = '';
        return;
    }

    const content = textarea.value;
    const lowerQuery = query.toLowerCase();
    const lowerContent = content.toLowerCase();

    // Find all matches
    let index = 0;
    while (true) {
        index = lowerContent.indexOf(lowerQuery, index);
        if (index === -1) break;
        searchMatches.push({ start: index, end: index + query.length });
        index += 1;
    }

    if (searchMatches.length > 0) {
        countElement.textContent = `[ 1 / ${searchMatches.length} ]`;
        // Jump to first match
        jumpToMatch(textarea, 0);
    } else {
        countElement.textContent = '[ 0 ]';
    }
}

function navigateMatch(direction) {
    if (searchMatches.length === 0) return;

    currentMatchIndex += direction;
    if (currentMatchIndex < 0) currentMatchIndex = searchMatches.length - 1;
    if (currentMatchIndex >= searchMatches.length) currentMatchIndex = 0;

    // Update count display
    const countElement = elements.searchResponseCount;
    countElement.textContent = `[ ${currentMatchIndex + 1} / ${searchMatches.length} ]`;

    // Jump to match in response textarea
    jumpToMatch(elements.responseOutput, currentMatchIndex);
}

function jumpToMatch(textarea, matchIndex) {
    const match = searchMatches[matchIndex];
    if (!match) return;

    // Focus and select the match
    textarea.focus();
    textarea.setSelectionRange(match.start, match.end);

    // Scroll to make the selection visible
    // Calculate approximate scroll position
    const lineHeight = 16;
    const textBeforeMatch = textarea.value.substring(0, match.start);
    const linesBeforeMatch = textBeforeMatch.split('\n').length;
    textarea.scrollTop = (linesBeforeMatch - 3) * lineHeight;
}

// Log panel initialization
console.log('[ReVex] Panel initialized');
