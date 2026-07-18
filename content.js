const CLICKABLE_SELECTOR = [
  "button",
  "[role='button']",
  "[role='menuitem']",
  "a",
  "label",
  "span",
  "div"
].join(",");

const INPUT_SELECTOR = [
  "input",
  "textarea",
  "[contenteditable='true']"
].join(",");

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "grantTemporaryAccess") {
    handleGrant(message.payload)
      .then((result) => sendResponse(result))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: error.message || "Unable to grant access."
        })
      );

    return true;
  }

  if (message?.type === "revokeTemporaryAccess") {
    handleRevoke(message.payload)
      .then((result) => sendResponse(result))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: error.message || "Unable to revoke access."
        })
      );

    return true;
  }

  return false;
});

async function handleGrant({ username, scriptTitle, durationPreset }) {
  const steps = [];
  const durationConfig = resolveDuration(durationPreset);
  steps.push(
    `Looking for TradingView access controls for "${username}".`
  );

  let scope = document;
  const accessDialog = getVisibleDialog();
  if (accessDialog) {
    scope = accessDialog;
    steps.push("Using the currently open access dialog.");
  } else {
    scope = await openAccessArea(scriptTitle, steps);
  }

  const userDialog = await openAddUserDialog(scope, steps);
  await populateUsername(userDialog, username, steps);
  const expirationDialog = await selectUserForAccess(userDialog, username, steps);
  await populateDates(expirationDialog, durationConfig, steps);
  await submitDialog(expirationDialog, "grant", steps);

  return {
    ok: true,
    message: `${durationConfig.label} access was submitted for ${username}.`,
    steps
  };
}

async function handleRevoke({ username, scriptTitle }) {
  const steps = [];
  steps.push(`Looking for an access entry for "${username}".`);

  let scope = document;
  const accessDialog = getVisibleDialog();
  if (accessDialog) {
    scope = accessDialog;
    steps.push("Using the currently open access dialog.");
  } else {
    scope = await openAccessArea(scriptTitle, steps);
  }

  const userRow = findUserRow(scope, username);
  if (!userRow) {
    throw new Error(
      `Could not find "${username}" in the current TradingView access list. Open the right script access window and try again.`
    );
  }

  const revokeButton = findBestTextMatch(
    [
      "remove",
      "revoke",
      "delete",
      "remove access"
    ],
    userRow,
    {
      clickableOnly: true
    }
  );

  if (!revokeButton) {
    throw new Error("Found the user row, but could not find the remove or revoke button.");
  }

  await humanClick(revokeButton);
  steps.push("Clicked the remove or revoke action.");
  await wait(randomBetween(280, 520));

  const confirmDialog = getVisibleDialog() || document;
  const confirmButton = findBestTextMatch(
    [
      "remove",
      "revoke",
      "delete",
      "confirm",
      "ok"
    ],
    confirmDialog,
    {
      clickableOnly: true,
      disallow: ["cancel"]
    }
  );

  if (confirmButton) {
    await humanClick(confirmButton);
    steps.push("Confirmed the revoke action.");
    await wait(randomBetween(550, 900));
  }

  return {
    ok: true,
    message: `Access revoke was submitted for ${username}.`,
    steps
  };
}

async function openAccessArea(scriptTitle, steps) {
  if (hasAddUserControl(document)) {
    steps.push("Access page already looks open.");
    return document;
  }

  const scriptScope = scriptTitle ? findScriptScope(scriptTitle) : null;
  if (scriptTitle) {
    if (scriptScope) {
      steps.push(`Matched the script title "${scriptTitle}".`);
    } else {
      steps.push(`Could not match "${scriptTitle}", so using the whole page.`);
    }
  }

  const searchRoot = scriptScope || document;
  const manageButton = findBestTextMatch(
    [
      "manage access",
      "manage script access",
      "script access",
      "access"
    ],
    searchRoot,
    {
      clickableOnly: true,
      disallow: ["accessibility"]
    }
  );

  if (!manageButton) {
    throw new Error(
      "Could not find a TradingView Manage access button. Open your invite-only script page or access window first."
    );
  }

  await humanClick(manageButton);
  steps.push("Opened the Manage access area.");
  await waitFor(() => Boolean(getVisibleDialog() || hasAddUserControl(document)), 6000);

  return getVisibleDialog() || document;
}

async function openAddUserDialog(scope, steps) {
  const readyInput = findGrantSearchField(scope);
  if (readyInput) {
    steps.push("Add new users tab is already open.");
    return scope;
  }

  const addUsersTab = findBestTextMatch(
    [
      "add new users",
      "new users"
    ],
    scope,
    {
      clickableOnly: true
    }
  );

  if (!addUsersTab) {
    throw new Error("Could not find the Add new users tab in the TradingView access area.");
  }

  await humanClick(addUsersTab);
  steps.push("Opened the Add new users tab.");
  await waitFor(() => Boolean(findGrantSearchField(getVisibleDialog() || document)), 6000);

  return getVisibleDialog() || document;
}

async function populateUsername(scope, username, steps) {
  const input = findGrantSearchField(scope);
  if (!input) {
    throw new Error("Could not find the Add new users search field.");
  }

  await humanType(input, username);
  steps.push(
    `Typed the username "${username}" into the Add new users search field.`
  );
  await wait(randomBetween(350, 650));
}

async function selectUserForAccess(scope, username, steps) {
  const resultRow = await waitFor(() => findGrantResultRow(scope, username), 6000);
  const addAccessButton = findBestTextMatch(
    [
      "add access"
    ],
    resultRow,
    {
      clickableOnly: true
    }
  );

  if (!addAccessButton) {
    throw new Error("Found the user in TradingView results, but could not find the Add access button.");
  }

  await humanClick(addAccessButton);
  steps.push(
    `Clicked Add access for "${username}".`
  );
  await waitFor(() => {
    const dialog = getVisibleDialog();
    return Boolean(dialog && normalizeText(dialog.innerText).includes("expiration"));
  }, 6000);

  return getVisibleDialog() || document;
}

async function populateDates(scope, durationConfig, steps) {
  if (durationConfig.mode === "none") {
    const toggled = await tryEnableNoExpiration(scope);
    if (toggled) {
      steps.push("Enabled the no-expiration option.");
    } else {
      steps.push("No-expiration mode selected. Leaving TradingView date fields unchanged.");
    }

    return;
  }

  const visibleDateFields = getVisibleDateFields(scope);
  if (!visibleDateFields.length) {
    const expirationControl = findBestTextMatch(
      [
        "expiration",
        "expiry",
        "end date"
      ],
      scope,
      {
        clickableOnly: true
      }
    );

    if (expirationControl) {
      await humanClick(expirationControl);
      steps.push("Opened the expiration date control.");
      await wait(randomBetween(220, 420));
    }
  }

  const dateFields = getVisibleDateFields(scope);
  if (!dateFields.length) {
    throw new Error("Could not find the expiration date field. Please open the access dialog and make sure the date inputs are visible.");
  }

  const startDate = new Date();
  const targetDate = durationConfig.targetDate;

  if (dateFields.length >= 2) {
    await setDateLikeValue(dateFields[0], startDate, steps, "start date");
    await setDateLikeValue(dateFields[dateFields.length - 1], targetDate, steps, "expiration date");
  } else {
    await setDateLikeValue(dateFields[0], targetDate, steps, "expiration date");
  }

  await wait(randomBetween(180, 320));
}

async function submitDialog(scope, mode, steps) {
  const buttonTexts =
    mode === "grant"
      ? ["apply", "add", "save", "grant", "confirm", "ok"]
      : ["remove", "revoke", "delete", "confirm", "ok"];

  const submitButton = findBestTextMatch(buttonTexts, scope, {
    clickableOnly: true,
    disallow: ["cancel", "close"]
  });

  if (!submitButton) {
    throw new Error("Could not find the final confirmation button in the TradingView dialog.");
  }

  await humanClick(submitButton);
  steps.push(mode === "grant" ? "Submitted the access request." : "Submitted the revoke request.");
  await wait(randomBetween(700, 1100));
}

function getVisibleDialog() {
  const dialogs = Array.from(document.querySelectorAll("[role='dialog'], .dialog, .tv-dialog"));
  return dialogs.find(isVisible) || null;
}

function hasAddUserControl(scope) {
  return Boolean(
    findBestTextMatch(
      ["add new users", "new users", "add access"],
      scope,
      {
        clickableOnly: true,
        disallow: ["address", "added", "additional"]
      }
    ) || findGrantSearchField(scope)
  );
}

function hasUsernameField(scope) {
  return Boolean(findUsernameField(scope));
}

function findScriptScope(scriptTitle) {
  const normalizedTitle = normalizeText(scriptTitle);
  const containers = Array.from(document.querySelectorAll("article, section, tr, li, div"));

  return containers.find((element) => {
    if (!isVisible(element)) {
      return false;
    }

    const text = normalizeText(element.innerText);
    return text.includes(normalizedTitle) && element.querySelector(CLICKABLE_SELECTOR);
  }) || null;
}

function findGrantSearchField(scope) {
  const inputs = Array.from(scope.querySelectorAll(INPUT_SELECTOR));

  const labeledInput = inputs.find((input) => {
    if (!isVisible(input)) {
      return false;
    }

    const context = normalizeText(readNearbyText(input));
    const placeholder = normalizeText(input.getAttribute("placeholder") || "");
    return (
      context.includes("grant them access") ||
      context.includes("grant individual users") ||
      placeholder.includes("grant them access") ||
      placeholder.includes("username") ||
      placeholder.includes("grant")
    );
  });

  if (labeledInput) {
    return labeledInput;
  }

  return inputs.find((input) => {
    if (!isVisible(input)) {
      return false;
    }

    const type = (input.getAttribute("type") || "").toLowerCase();
    const placeholder = normalizeText(input.getAttribute("placeholder") || "");
    return type === "search" || placeholder.includes("search for a user");
  }) || null;
}

function findGrantResultRow(scope, username) {
  const normalizedUsername = normalizeText(username);
  const containers = Array.from(scope.querySelectorAll("tr, li, article, section, div"));

  return containers.find((element) => {
    if (!isVisible(element)) {
      return false;
    }

    const text = normalizeText(element.innerText);
    return text.includes(normalizedUsername) && text.includes("add access") && text.length < 500;
  }) || null;
}

function findUserRow(scope, username) {
  const normalizedUsername = normalizeText(username);
  const containers = Array.from(scope.querySelectorAll("tr, li, article, section, div"));

  return containers.find((element) => {
    if (!isVisible(element)) {
      return false;
    }

    const text = normalizeText(element.innerText);
    return text.includes(normalizedUsername) && text.length < 400;
  }) || null;
}

function findUsernameField(scope) {
  return findGrantSearchField(scope);
}

function getVisibleDateFields(scope) {
  return Array.from(scope.querySelectorAll("input"))
    .filter((input) => isVisible(input))
    .filter((input) => {
      const type = (input.getAttribute("type") || "").toLowerCase();
      const nearbyText = normalizeText(readNearbyText(input));
      const placeholder = normalizeText(input.getAttribute("placeholder") || "");

      return (
        type === "date" ||
        nearbyText.includes("date") ||
        nearbyText.includes("expiration") ||
        nearbyText.includes("expiry") ||
        placeholder.includes("dd") ||
        placeholder.includes("mm") ||
        placeholder.includes("yy")
      );
    });
}

async function setDateLikeValue(input, date, steps, label) {
  await humanClick(input);

  if ((input.getAttribute("type") || "").toLowerCase() === "date" && "valueAsDate" in input) {
    input.valueAsDate = date;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    steps.push(`Set the ${label} with the native date input.`);
    await wait(randomBetween(140, 260));
    return;
  }

  const candidateValues = buildDateCandidates(date);
  for (const value of candidateValues) {
    await humanType(input, value);

    const current = (input.value || input.textContent || "").trim();
    if (current) {
      steps.push(`Filled the ${label} as ${current}.`);
      return;
    }
  }

  throw new Error(`Could not set the ${label} field.`);
}

function buildDateCandidates(date) {
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const shortM = String(date.getMonth() + 1);
  const shortD = String(date.getDate());

  return [
    `${yyyy}-${mm}-${dd}`,
    `${dd}/${mm}/${yyyy}`,
    `${mm}/${dd}/${yyyy}`,
    `${yyyy}/${mm}/${dd}`,
    `${shortD}/${shortM}/${yyyy}`,
    `${shortM}/${shortD}/${yyyy}`
  ];
}

function setNativeValue(element, value) {
  if (!element) {
    return;
  }

  if (element.isContentEditable) {
    element.textContent = value;
    element.dispatchEvent(new InputEvent("input", { bubbles: true, data: value, inputType: "insertText" }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }

  const prototype = Object.getPrototypeOf(element);
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");

  if (descriptor?.set) {
    descriptor.set.call(element, value);
  } else {
    element.value = value;
  }

  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function findBestTextMatch(texts, scope, options = {}) {
  const root = scope || document;
  const elements = Array.from(root.querySelectorAll(CLICKABLE_SELECTOR));
  const normalizedTexts = texts.map(normalizeText);
  const disallow = (options.disallow || []).map(normalizeText);

  let bestMatch = null;
  let bestScore = -1;

  for (const element of elements) {
    if (!isVisible(element)) {
      continue;
    }

    const clickableCandidate = options.clickableOnly ? toClickable(element) : element;
    if (!clickableCandidate || !isVisible(clickableCandidate)) {
      continue;
    }

    const haystack = normalizeText(readElementText(clickableCandidate));
    if (!haystack) {
      continue;
    }

    if (disallow.some((word) => haystack.includes(word))) {
      continue;
    }

    let score = 0;
    for (const needle of normalizedTexts) {
      if (!needle) {
        continue;
      }

      if (haystack === needle) {
        score = Math.max(score, 100 + needle.length);
      } else if (haystack.startsWith(needle)) {
        score = Math.max(score, 80 + needle.length);
      } else if (haystack.includes(needle)) {
        score = Math.max(score, 50 + needle.length);
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = clickableCandidate;
    }
  }

  return bestMatch;
}

function toClickable(element) {
  return (
    element.closest("button, [role='button'], [role='menuitem'], a, label") ||
    element
  );
}

function readElementText(element) {
  const parts = [
    element.innerText,
    element.textContent,
    element.getAttribute?.("aria-label"),
    element.getAttribute?.("title"),
    element.getAttribute?.("data-name"),
    element.getAttribute?.("placeholder")
  ];

  return parts.filter(Boolean).join(" ");
}

function readNearbyText(element) {
  const label = element.closest("label");
  const parent = element.parentElement;
  const fieldWrapper = element.closest("[role='dialog'], form, section, div");

  return [
    label?.innerText,
    parent?.innerText,
    fieldWrapper?.innerText,
    element.getAttribute("aria-label"),
    element.getAttribute("placeholder"),
    element.getAttribute("name")
  ]
    .filter(Boolean)
    .join(" ");
}

async function humanClick(element) {
  element.scrollIntoView({
    block: "center",
    inline: "center"
  });

  await wait(randomBetween(120, 260));
  element.focus?.();
  element.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" }));
  element.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
  element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse" }));
  element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  await wait(randomBetween(45, 120));
  element.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "mouse" }));
  element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  element.click();
  await wait(randomBetween(110, 240));
}

function normalizeText(value) {
  return (value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function isVisible(element) {
  if (!element || !(element instanceof Element)) {
    return false;
  }

  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();

  return (
    style.visibility !== "hidden" &&
    style.display !== "none" &&
    rect.width > 0 &&
    rect.height > 0
  );
}

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function humanType(element, value) {
  await humanClick(element);

  if (element.isContentEditable) {
    setNativeValue(element, "");
    await wait(randomBetween(120, 220));

    let current = "";
    for (const character of value) {
      current += character;
      dispatchKeySequence(element, character);
      setNativeValue(element, current);
      await wait(getTypingDelay(character));
    }

    return;
  }

  const type = (element.getAttribute("type") || "").toLowerCase();
  if (type && ["date", "number"].includes(type)) {
    setNativeValue(element, value);
    await wait(randomBetween(130, 220));
    return;
  }

  setNativeValue(element, "");
  await wait(randomBetween(90, 180));

  let current = "";
  for (const character of value) {
    current += character;
    dispatchKeySequence(element, character);
    setNativeValue(element, current);
    await wait(getTypingDelay(character));
  }
}

function dispatchKeySequence(element, character) {
  element.dispatchEvent(new KeyboardEvent("keydown", { key: character, bubbles: true }));
  element.dispatchEvent(new KeyboardEvent("keypress", { key: character, bubbles: true }));
  element.dispatchEvent(new KeyboardEvent("keyup", { key: character, bubbles: true }));
}

function getTypingDelay(character) {
  if (character === " " || character === "/" || character === "-") {
    return randomBetween(90, 180);
  }

  return randomBetween(55, 140);
}

async function tryEnableNoExpiration(scope) {
  const noExpirationButton = findBestTextMatch(
    [
      "no expiration",
      "no expiry",
      "without expiration",
      "never expires",
      "never expire"
    ],
    scope,
    {
      clickableOnly: true
    }
  );

  if (!noExpirationButton) {
    return false;
  }

  await humanClick(noExpirationButton);
  await wait(randomBetween(180, 340));
  return true;
}

function resolveDuration(durationPreset) {
  const startDate = new Date();

  switch (durationPreset) {
    case "30d": {
      const targetDate = new Date(startDate);
      targetDate.setDate(targetDate.getDate() + 30);
      return { mode: "dated", label: "30-day", targetDate };
    }
    case "1y": {
      const targetDate = new Date(startDate);
      targetDate.setFullYear(targetDate.getFullYear() + 1);
      return { mode: "dated", label: "1-year", targetDate };
    }
    case "none":
      return { mode: "none", label: "No-expiration" };
    case "2d":
    default: {
      const targetDate = new Date(startDate);
      targetDate.setDate(targetDate.getDate() + 2);
      return { mode: "dated", label: "2-day", targetDate };
    }
  }
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function waitFor(predicate, timeoutMs) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const result = predicate();
    if (result) {
      return result;
    }

    await wait(150);
  }

  throw new Error("Timed out while waiting for TradingView to open the next step.");
}
