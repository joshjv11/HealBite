# Tech Stack

A full breakdown of every technology used in PoshanPal — what it is, what role it plays, and where it lives in the codebase.

---

## Frontend

### React 18 (JSX)
**What:** UI component library by Meta  
**Role:** The entire frontend is built as a single-page React application. State management (user profile, tab selection, pantry result, tracker stats, etc.) lives in React `useState` and `useCallback` hooks — no external state manager is needed given the scale.  
**Files:** `frontend/src/App.jsx`, `frontend/src/Dashboard.jsx`

### Vite
**What:** Next-generation frontend build tool  
**Role:** Dev server with Hot Module Replacement (HMR) during development; production bundler that outputs optimised static assets. Replaces Create React App.  
**Files:** `frontend/vite.config.js`

### Tailwind CSS (v3)
**What:** Utility-first CSS framework  
**Role:** Every layout, colour, spacing, and typography decision is expressed through Tailwind utility classes. The app uses a custom design token system (`surface`, `primary`, `tertiary`, `on-surface`, etc.) defined in `tailwind.config.js` — all mapped to a dark Material-You-inspired palette.  
**Files:** `frontend/tailwind.config.js`, `frontend/postcss.config.js`

### Framer Motion
**What:** Production-ready animation library for React  
**Role:** All page transitions (tab switches with `AnimatePresence`), card entrance animations (`initial → animate`), and the onboarding slide transitions are handled by Framer Motion. Gives the UI its fluid, premium feel without hand-writing CSS keyframes.  
**Package:** `framer-motion`

### Axios
**What:** Promise-based HTTP client  
**Role:** All API calls to the FastAPI backend — fetching meal plans, logging meals, posting to Pantry Chef, uploading lab reports, pulling medical history — go through Axios. Chosen over `fetch` for its cleaner response/error model and automatic JSON serialisation.  
**Package:** `axios`

### React Hot Toast
**What:** Lightweight toast notification library  
**Role:** All user feedback messages (success, error, informational) are delivered as non-blocking toasts via `react-hot-toast`. A shared `TOAST_STYLE` constant keeps all toasts visually consistent with the dark design system.  
**Package:** `react-hot-toast`

### Recharts
**What:** Composable charting library built on D3  
**Role:** Powers the "Longitudinal Trends" line graph in the Medical Command Center. Renders biomarker values over time using `LineChart`, `XAxis`, `YAxis`, `CartesianGrid`, `Tooltip`, and `ReferenceLine` components.  
**Package:** `recharts`

### Lucide React
**What:** Open-source icon library (React bindings)  
**Role:** Every icon in the app (mic, chef hat, flame, shield, trending arrows, etc.) comes from Lucide. Keeps icon style consistent and bundle size predictable.  
**Package:** `lucide-react`

### Web Speech API (browser-native)
**What:** Browser-native API for speech recognition and synthesis  
**Role:** Two features use it:
- **Speech Recognition** (`window.SpeechRecognition` / `webkitSpeechRecognition`) — voice input on the onboarding form fields and the Pantry Chef textarea
- **Speech Synthesis** (`window.speechSynthesis`) — reads meal names aloud via the `speakText()` utility, designed for low-literacy users

Requires Chrome or a Chromium-based browser; the code gracefully degrades with a toast error on unsupported browsers.  
**File:** `frontend/src/utils.js`

---

## Backend

### Python 3.14
**What:** General-purpose programming language  
**Role:** All backend logic is written in Python — API routing, database access, AI prompt construction, and file handling.

### FastAPI
**What:** Modern, high-performance Python web framework  
**Role:** All REST API endpoints are defined with FastAPI. Provides automatic OpenAPI docs, async request handling, and Pydantic request/response validation out of the box.  
**File:** `backend/main.py`

### SQLite + SQLAlchemy
**What:** SQLite is a file-based relational database; SQLAlchemy is Python's ORM layer  
**Role:** User profiles, meal plans, daily logs, and medical report metadata are all stored in a local SQLite database. SQLAlchemy handles model definition (`backend/models.py`) and session management (`backend/database.py`). SQLite requires zero infrastructure — the database is a single `.db` file on disk.

### Google Gemini API
**What:** Google's multimodal generative AI API  
**Role:** Three AI-powered features call Gemini:
1. **Weekly Meal Plan generation** — given a user's profile, allergies, BMI, and clinical directives, Gemini generates a full 7-day structured meal plan in JSON
2. **Pantry Chef** — given a list of ingredients, Gemini returns a recipe with calorie and protein estimates
3. **Medical Report Scanner** — a lab report image is sent to Gemini Vision; it extracts biomarkers, flags abnormal values, generates a clinical directive, and assigns a health score

### Cloudinary
**What:** Cloud-based media storage and delivery platform  
**Role:** Uploaded lab report images are stored on Cloudinary. The returned public URL is saved in the database so images remain accessible across sessions without local disk storage.

### python-dotenv
**What:** Loads environment variables from a `.env` file  
**Role:** API keys (Gemini, Cloudinary) and other secrets are kept out of source code and loaded from `.env` at runtime.

---

## Infrastructure & Tooling

### Git + GitHub
**What:** Version control system and code hosting  
**Role:** The full project history is tracked in Git. The remote is hosted at `https://github.com/joshjv11/PoshanPal.git`. All feature work is committed and pushed to `main`.

### ESLint
**What:** JavaScript/JSX linter  
**Role:** Catches common React mistakes (missing keys, unused variables, hook dependency arrays) during development.  
**File:** `frontend/eslint.config.js`

### PostCSS
**What:** CSS transformation tool  
**Role:** Required by Tailwind CSS to process utility classes and inject them into the bundle.  
**File:** `frontend/postcss.config.js`

### npm
**What:** Node package manager  
**Role:** Manages all frontend JavaScript dependencies. Lock file (`package-lock.json`) ensures reproducible installs.

### Python venv
**What:** Python virtual environment  
**Role:** Isolates backend Python dependencies from the system Python. All packages are installed inside `backend/venv/`.
