/**
 * ReVex DevTools Initialization
 * Creates the "ReVex" panel in the browser's Developer Tools
 */

browser.devtools.panels.create(
    'ReVex',                    // Panel title
    '/icons/icon-48.png',       // Panel icon
    '/panel/panel.html'         // Panel content page
).then((panel) => {
    console.log('[ReVex] DevTools panel created successfully');
}).catch((error) => {
    console.error('[ReVex] Failed to create DevTools panel:', error);
});
