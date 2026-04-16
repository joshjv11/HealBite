# What Was Done

## 1. Full App Rebrand — PoshanPal → PoshanPal

Every user-facing string that carried the old name "PoshanPal" was replaced with "PoshanPal".

| Location | Old Value | New Value |
|---|---|---|
| `frontend/index.html` — `<title>` tag | `PoshanPal` | `PoshanPal` |
| `frontend/src/App.jsx` — welcome screen brand mark | `PoshanPal` | `PoshanPal` |
| `frontend/src/App.jsx` — TTS greeting on language select | `"Welcome to PoshanPal"` | `"Welcome to PoshanPal"` |
| `frontend/src/App.jsx` — footer tagline | `"Your personal Indian nutrition companion"` | `"Your personal nutrition companion"` |
| `frontend/src/Dashboard.jsx` — top navigation bar | `PoshanPal` | `PoshanPal` |

The word "Indian" was also removed from the tagline because PoshanPal is intended as a broader, non-region-locked identity.

---

## 2. Pantry Chef → Journal Connection

A **"Log to Journal"** button was added inside the recipe result card that appears after Pantry Chef generates a recipe.

### What the button does
- Takes the generated recipe's `name`, `calories`, and `protein` values
- Calls the same `logMeal()` API function already used by the Weekly Plan tab
- After the API call resolves, **automatically switches the active tab to "Journal"** so the user can immediately see the logged entry in their daily tracker

### Files changed
- `frontend/src/Dashboard.jsx` — new button markup added inside the `pantryResult` motion block
