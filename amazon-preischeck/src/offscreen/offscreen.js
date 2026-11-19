/*
 * Offscreen document: MV3 service workers have no DOMParser, so fetched
 * Amazon pages are parsed here with the same extractor as the content script.
 */
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.target !== 'offscreen' || msg.type !== 'parseProduct') return false;
  try {
    const doc = new DOMParser().parseFromString(msg.html, 'text/html');
    if (PC.isCaptchaPage(doc)) {
      sendResponse({ captcha: true });
    } else {
      sendResponse(PC.extractProduct(doc, msg.url));
    }
  } catch (e) {
    sendResponse(null);
  }
  return false;
});
