const STORAGE_KEY = "tvAccessHelper.form";

const form = document.getElementById("grant-form");
const usernameInput = document.getElementById("username");
const durationPresetInput = document.getElementById("durationPreset");
const scriptTitleInput = document.getElementById("scriptTitle");
const revokeButton = document.getElementById("revoke-button");
const grantButton = document.getElementById("grant-button");
const statusElement = document.getElementById("status");
const logElement = document.getElementById("log");
const durationNote = document.getElementById("duration-note");

restoreForm();
updateDurationCopy();

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await runAction("grant");
});

revokeButton.addEventListener("click", async () => {
  await runAction("revoke");
});

durationPresetInput.addEventListener("change", () => {
  updateDurationCopy();
});

async function runAction(action) {
  const username = usernameInput.value.trim();
  const durationPreset = durationPresetInput.value;
  const scriptTitle = scriptTitleInput.value.trim();

  if (!username) {
    setStatus("Enter the TradingView username first.", "error");
    usernameInput.focus();
    return;
  }

  setBusy(true);
  setStatus(
    action === "grant" ? "Working on TradingView tab..." : "Finding user in TradingView access list...",
    "working"
  );
  setLog([]);

  try {
    await chrome.storage.local.set({
      [STORAGE_KEY]: {
        username,
        durationPreset,
        scriptTitle
      }
    });

    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });

    if (!tab?.id || !tab.url || !tab.url.includes("tradingview.com")) {
      throw new Error("Open the correct TradingView tab first, then run the extension again.");
    }

    const response = await sendMessageToTradingViewTab(tab.id, {
      type: action === "grant" ? "grantTemporaryAccess" : "revokeTemporaryAccess",
      payload: {
        username,
        scriptTitle,
        durationPreset
      }
    });

    if (!response?.ok) {
      throw new Error(response?.error || "TradingView automation did not complete.");
    }

    setStatus(response.message || "Completed successfully.", "success");
    setLog(response.steps || []);
  } catch (error) {
    setStatus(error.message || "Something went wrong.", "error");
  } finally {
    setBusy(false);
  }
}

async function restoreForm() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const formState = stored[STORAGE_KEY];

  if (!formState) {
    return;
  }

  usernameInput.value = formState.username || "";
  durationPresetInput.value = formState.durationPreset || "2d";
  scriptTitleInput.value = formState.scriptTitle || "";
  updateDurationCopy();
}

function setBusy(isBusy) {
  grantButton.disabled = isBusy;
  revokeButton.disabled = isBusy;
}

function setStatus(text, kind) {
  statusElement.textContent = text;
  statusElement.className = `status ${kind || "idle"}`;
}

function setLog(steps) {
  if (!steps.length) {
    logElement.hidden = true;
    logElement.textContent = "";
    return;
  }

  logElement.hidden = false;
  logElement.textContent = steps.map((step, index) => `${index + 1}. ${step}`).join("\n");
}

function updateDurationCopy() {
  const label = getDurationLabel(durationPresetInput.value);
  durationNote.textContent =
    durationPresetInput.value === "none"
      ? "The extension will try to keep access without an expiration date if TradingView shows that option."
      : `The extension will set TradingView access for ${label.toLowerCase()}.`;

  grantButton.textContent = `Grant ${label}`;
}

function getDurationLabel(durationPreset) {
  switch (durationPreset) {
    case "30d":
      return "30 Days";
    case "1y":
      return "1 Year";
    case "none":
      return "No Expiry";
    case "2d":
    default:
      return "2 Days";
  }
}


async function sendMessageToTradingViewTab(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    const messageText = error?.message || "";
    if (!messageText.includes("Receiving end does not exist")) {
      throw error;
    }
  }

  setStatus("Connecting the helper to the current TradingView tab...", "working");

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"]
  });

  await wait(180);
  return chrome.tabs.sendMessage(tabId, message);
}

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
