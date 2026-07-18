# TradingView Invite-Only Access Manager

Chrome extension for TradingView script authors — automate granting and revoking invite-only indicator access (2 days, 30 days, 1 year, or lifetime) via the official Manage Access flow.

## Features

- Grants invite-only access to any TradingView username straight from a popup form.
- Preset durations: 2 days, 30 days, 1 year, or no expiration (lifetime).
- Revokes a user's access from the same access list.
- Drives TradingView's official Manage Access dialog — no unofficial API.
- Text-based UI matching (not brittle CSS classes) so it survives most layout changes.
- Human-like typing and clicking with short randomized delays.
- Remembers your last-used username, duration, and script title via local storage.
- Optional script-title field to target the right script when a page lists several.

## Stack

- Chrome Extension Manifest V3
- Vanilla JavaScript (popup + content script)
- HTML / CSS popup UI
- `chrome.storage`, `chrome.scripting`, and `chrome.tabs` APIs

## Getting started

1. Clone or download this repository.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select this project folder.
5. Open TradingView and navigate to your invite-only script's access page.
6. Click the extension icon, enter the TradingView username, pick a duration, and click **Grant Access** (or **Revoke Access**).

## Notes

- You must be the author of the invite-only script and already have permission to manage its access.
- Keep the correct TradingView tab open on the script's access page or the card that shows **Manage access**.
- TradingView changes its UI over time; if a button label changes, the text-matching logic in `content.js` may need a small update.
- If your TradingView UI language is not English, add the relevant labels in `content.js`.

## Author

Built by [Jayadev Rana](https://jayadevrana.in) — @bluealgocapital · [YouTube](https://www.youtube.com/@jayadevrana3657) · [GitHub](https://github.com/jayadevrana)
