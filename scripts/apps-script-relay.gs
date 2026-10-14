/**
 * Gmail HTTPS relay for the Cyborg Job Pipeline bot daemon.
 *
 * Hosts like Render's free tier block outbound SMTP, so the daemon POSTs each
 * approved email here and this script sends it from your Gmail account.
 *
 * Setup (https://script.google.com):
 *   1. New project → paste this file into Code.gs.
 *   2. Project Settings → Script Properties → add SYNC_SECRET with the same
 *      value as SYNC_SECRET in your daemon's environment.
 *   3. Deploy → New deployment → type "Web app", execute as "Me",
 *      access "Anyone". Authorize the Gmail permission when asked.
 *   4. Set GMAIL_WEBHOOK_URL on the daemon to the web app URL.
 *
 * After editing this script, redeploy via Deploy → Manage deployments →
 * edit → Version: New version. Editing the existing deployment keeps its URL.
 *
 * Note: GmailApp mangles emoji in subjects; other non-ASCII text is fine.
 */

function jsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const { fromName, to, subject, body, attachmentBase64, attachmentFilename, secret } = data;

    // Reject everything unless SYNC_SECRET is configured and matches
    const expected = PropertiesService.getScriptProperties().getProperty("SYNC_SECRET");
    if (!expected || secret !== expected) {
      return jsonResponse({ success: false, error: "Unauthorized" });
    }

    if (!to || !subject || !body) {
      return jsonResponse({ success: false, error: "Missing to, subject or body" });
    }

    const options = {};
    if (fromName) {
      options.name = fromName;
    }

    // Attach the persona's PDF resume if provided
    if (attachmentBase64 && attachmentFilename) {
      const decodedBytes = Utilities.base64Decode(attachmentBase64);
      options.attachments = [Utilities.newBlob(decodedBytes, "application/pdf", attachmentFilename)];
    }

    GmailApp.sendEmail(to, subject, body, options);
    return jsonResponse({ success: true });
  } catch (err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

// Health check
function doGet() {
  return jsonResponse({ status: "ok" });
}
