import React, { useState, useRef } from 'react';
import axios from 'axios';
import {
  Mic, MicOff, ArrowRight, ArrowLeft,
  AlertCircle, Weight, Ruler, Target, Activity,
  Plus, Minus, Volume2,
} from 'lucide-react';
import { speakText } from './utils';
import Dashboard from './Dashboard';
import { motion, AnimatePresence } from 'framer-motion';
import toast, { Toaster } from 'react-hot-toast';

const TOTAL_STEPS = 3;

const SUPPORTED_LANGUAGES = [
  { code: 'hi-IN', label: 'हिंदी',    englishLabel: 'Hindi',    icon: '🇮🇳' },
  { code: 'mr-IN', label: 'मराठी',   englishLabel: 'Marathi',  icon: '🚩' },
  { code: 'ta-IN', label: 'தமிழ்',    englishLabel: 'Tamil',    icon: '🛕' },
  { code: 'bn-IN', label: 'বাংলা',    englishLabel: 'Bengali',  icon: '🐅' },
  { code: 'gu-IN', label: 'ગુજરાતી',  englishLabel: 'Gujarati', icon: '🪁' },
  { code: 'en-IN', label: 'English',  englishLabel: 'English',  icon: 'A'  },
];

const ALLERGEN_META = {
  peanut: { emoji: '🥜', label: 'Peanut' },
  dairy:  { emoji: '🥛', label: 'Dairy'  },
  gluten: { emoji: '🌾', label: 'Gluten' },
  soy:    { emoji: '🫘', label: 'Soy'    },
};

const REGION_OPTIONS = [
  { value: 'North',   emoji: '🫓', label: 'North Indian', desc: 'Roti, dal, paneer'       },
  { value: 'South',   emoji: '🍛', label: 'South Indian', desc: 'Rice, sambar, idli'      },
  { value: 'All',     emoji: '🇮🇳', label: 'Mix of Both',  desc: 'Best of India'           },
  { value: 'Western', emoji: '🥗', label: 'Western',      desc: 'Salads, wraps, grilled'  },
];

// Each entry carries the native-script text AND a romanised English fallback.
// The fallback is spoken when the device has no voice for that language,
// preventing the wrong TTS engine from producing silence or garbled output.
const WELCOME_GREETINGS = {
  'hi-IN': {
    text:     'PoshanPal में आपका स्वागत है। अपना नाम बताइए।',
    fallback: 'PoshanPal mein aapka swagat hai. Apna naam bataiye.',
  },
  'mr-IN': {
    text:     'PoshanPal मध्ये आपले स्वागत आहे। आपले नाव सांगा।',
    fallback: 'PoshanPal madhye aapale swagat aahe. Aapale naav saanga.',
  },
  'ta-IN': {
    text:     'PoshanPal-இல் உங்களை வரவேற்கிறோம். உங்கள் பெயரைச் சொல்லுங்கள்.',
    fallback: 'Vanakkam! Welcome to PoshanPal. Please tell us your name.',
  },
  'bn-IN': {
    text:     'PoshanPal-এ আপনাকে স্বাগতম। আপনার নাম বলুন।',
    fallback: 'Namaskar! Welcome to PoshanPal. Please tell us your name.',
  },
  'gu-IN': {
    text:     'PoshanPal માં આપનું સ્વાગત છે। આપનું નામ કહો.',
    fallback: 'Kem chho! Welcome to PoshanPal. Please tell us your name.',
  },
  'en-IN': {
    text:     'Welcome to PoshanPal. Please tell us your name.',
    fallback: null,
  },
};

const TOAST_STYLE = {
  style: {
    background: '#1e201e',
    color: '#e2e3df',
    borderRadius: '12px',
    fontWeight: 600,
    fontSize: '14px',
    border: '1px solid #404944',
  },
};

export default function App() {
  const [step, setStep]         = useState(0);
  const [userData, setUserData] = useState(null);
  const [listeningField, setListeningField] = useState(null); // null | field name
  const [submitting, setSubmitting]         = useState(false);
  const recognitionRef = useRef(null);

  const [form, setForm] = useState({
    name: '', language: 'en-IN', region: 'North',
    age: '', current_weight: '', target_weight: '', height_cm: '',
    allergies: [], medical_conditions: [],
  });

  /* ── Voice Input ──────────────────────────────── */
  const NUMERIC_FIELDS = new Set(['age', 'current_weight', 'target_weight', 'height_cm']);

  const handleListen = (field) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { toast.error("Voice not supported. Use Chrome.", TOAST_STYLE); return; }

    if (listeningField === field && recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
      setListeningField(null);
      return;
    }

    // Stop any currently running recognition before starting a new one
    if (recognitionRef.current) { recognitionRef.current.abort(); recognitionRef.current = null; }

    const recognition = new SR();
    recognitionRef.current = recognition;
    recognition.lang = form.language || 'en-IN';
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognition.onstart  = () => setListeningField(field);
    recognition.onresult = (e) => {
      const raw = e.results[0][0].transcript;
      let value;
      if (NUMERIC_FIELDS.has(field)) {
        // Extract the first number spoken (handles "seventy five kilos" → "75")
        const match = raw.match(/\d+(\.\d+)?/);
        value = match ? match[0] : raw.replace(/[^\d.]/g, '').trim();
        // If no number could be extracted, warn and bail — never put text into a number input
        if (!value) {
          toast("No number detected. Please speak a number or type it.", { icon: '🔢', ...TOAST_STYLE });
          return;
        }
      } else {
        value = raw.replace(/[^\p{L}\p{N}\p{Zs}]/gu, '').trim();
      }
      setForm(prev => ({ ...prev, [field]: value }));
    };
    recognition.onerror = async (e) => {
      setListeningField(null);
      recognitionRef.current = null;
      if (e.error === 'not-allowed') {
        toast.error("Microphone access denied. Allow mic in browser settings.", TOAST_STYLE);
      } else if (e.error === 'no-speech') {
        toast("No speech detected. Tap mic and try again.", { icon: '🎙️', ...TOAST_STYLE });
      } else if (e.error === 'audio-capture') {
        toast.error("No microphone found. Please connect one.", TOAST_STYLE);
      } else if (e.error === 'network') {
        const isBrave = navigator.brave && (await navigator.brave.isBrave().catch(() => false));
        if (isBrave) {
          toast.error("Brave blocks voice. Open brave://settings/privacy → disable fingerprint blocking.", { duration: 6000, ...TOAST_STYLE });
        } else {
          toast.error("Voice needs internet. Check your connection.", TOAST_STYLE);
        }
      } else {
        toast.error(`Voice error: ${e.error}. Please type instead.`, TOAST_STYLE);
      }
    };
    recognition.onend = () => { setListeningField(null); recognitionRef.current = null; };

    try { recognition.start(); } catch { setListeningField(null); toast.error("Could not start microphone.", TOAST_STYLE); }
  };

  /* ── Validation ───────────────────────────────── */
  const validateAndNext = (target) => {
    if (step === 1 && !form.name.trim()) return toast.error('Please enter your name.', TOAST_STYLE);
    if (step === 2) {
      const age = parseInt(form.age);
      const cw  = parseFloat(form.current_weight);
      const tw  = parseFloat(form.target_weight);
      const h   = parseFloat(form.height_cm);
      if (!age || age < 10 || age > 100) return toast.error('Age must be 10–100 years.', TOAST_STYLE);
      if (!cw  || cw  < 20 || cw  > 300) return toast.error('Weight must be 20–300 kg.', TOAST_STYLE);
      if (!tw  || tw  < 20 || tw  > 300) return toast.error('Target weight must be 20–300 kg.', TOAST_STYLE);
      if (!h   || h   < 90 || h   > 250) return toast.error('Height must be 90–250 cm.', TOAST_STYLE);
    }
    setStep(target);
  };

  const toggleAllergy = (value) =>
    setForm(prev => {
      const arr = prev.allergies;
      return { ...prev, allergies: arr.includes(value) ? arr.filter(i => i !== value) : [...arr, value] };
    });

  /* ── Submit ───────────────────────────────────── */
  const submitProfile = async () => {
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        age:            parseInt(form.age, 10),
        current_weight: parseFloat(form.current_weight),
        target_weight:  parseFloat(form.target_weight),
        height_cm:      parseFloat(form.height_cm),
      };
      const res = await axios.post('http://127.0.0.1:8000/api/users/', payload);
      setUserData(res.data);
    } catch {
      toast.error('Could not reach server. Is the backend running?', TOAST_STYLE);
    } finally {
      setSubmitting(false);
    }
  };

  if (userData) return <Dashboard user={userData} />;

  const slide = {
    initial: { opacity: 0, x: 40 },
    animate: { opacity: 1, x: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
    exit:    { opacity: 0, x: -40, transition: { duration: 0.2 } },
  };

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      <Toaster position="top-center" toastOptions={TOAST_STYLE} />

      <div className="w-full max-w-sm">
        {/* Brand mark */}
        <div className="text-center mb-8">
          <span className="font-headline text-4xl italic text-on-surface tracking-tight">PoshanPal</span>
        </div>

        {/* Main card */}
        <div className="bg-surface-container-low border border-outline-variant/20 rounded-2xl overflow-hidden shadow-2xl shadow-black/40">

          {/* Step progress bar */}
          {step > 0 && (
            <div className="h-px bg-surface-container-highest w-full">
              <motion.div
                className="h-full bg-primary"
                initial={{ width: `${((step - 1) / TOTAL_STEPS) * 100}%` }}
                animate={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
                transition={{ duration: 0.4, ease: 'easeInOut' }}
              />
            </div>
          )}

          <div className="p-8">

            {/* Step nav header */}
            {step > 0 && (
              <div className="flex items-center justify-between mb-8">
                <button
                  onClick={() => {
                    if (recognitionRef.current) {
                      recognitionRef.current.abort();
                      recognitionRef.current = null;
                      setListeningField(null);
                    }
                    setStep(s => s - 1);
                  }}
                  className="flex items-center gap-1.5 text-[10px] font-label uppercase tracking-widest text-on-surface-variant hover:text-on-surface transition-colors"
                >
                  <ArrowLeft size={13} /> Back
                </button>
                <div className="flex gap-1.5 items-center">
                  {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
                    <div
                      key={i}
                      className={`rounded-full transition-all duration-300 ${
                        i + 1 === step ? 'w-6 h-1.5 bg-primary' :
                        i + 1  < step  ? 'w-1.5 h-1.5 bg-primary/40' :
                                         'w-1.5 h-1.5 bg-surface-container-highest'
                      }`}
                    />
                  ))}
                </div>
                <span className="text-[10px] font-label text-on-surface-variant tabular-nums">{step} / {TOTAL_STEPS}</span>
              </div>
            )}

            <AnimatePresence mode="wait">

              {/* ── Step 0: Language Grid ─────────────────── */}
              {step === 0 && (
                <motion.div key="s0" variants={slide} initial="initial" animate="animate" exit="exit"
                  className="flex flex-col gap-6 text-center">

                  <div className="py-2">
                    <div className="w-20 h-20 rounded-2xl bg-primary-container border border-primary/20 flex items-center justify-center mx-auto mb-6">
                      <Volume2 className="text-primary w-10 h-10" />
                    </div>
                    <h1 className="font-headline text-4xl italic text-on-surface leading-tight">
                      Welcome.
                    </h1>
                    <p className="font-label text-[10px] uppercase tracking-[0.2em] text-tertiary mt-4">
                      Select your language
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {SUPPORTED_LANGUAGES.map(lang => (
                      <button
                        key={lang.code}
                        onClick={() => {
                          setForm(p => ({ ...p, language: lang.code }));
                          const g = WELCOME_GREETINGS[lang.code];
                          speakText(g.text, lang.code, g.fallback);
                          setStep(1);
                        }}
                        className="py-4 bg-surface-container border border-outline-variant/30 hover:border-primary/40 hover:bg-surface-container-high rounded-xl flex flex-col items-center gap-1.5 transition-all active:scale-[0.98]"
                      >
                        <span className="text-2xl">{lang.icon}</span>
                        <span className="font-label font-bold text-on-surface text-lg">{lang.label}</span>
                        <span className="font-label text-[9px] uppercase tracking-widest text-on-surface-variant">{lang.englishLabel}</span>
                      </button>
                    ))}
                  </div>

                    <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant/40">
                    Your personal nutrition companion
                  </p>
                </motion.div>
              )}

              {/* ── Step 1: Name + Voice ─────────────────── */}
              {step === 1 && (
                <motion.div key="s1" variants={slide} initial="initial" animate="animate" exit="exit"
                  className="flex flex-col gap-6">

                  <div>
                    <h2 className="font-headline text-3xl italic text-on-surface leading-tight">
                      What shall we<br />call you?
                    </h2>
                    <p className="font-label text-xs text-on-surface-variant mt-2">
                      Speak or type your name below
                    </p>
                  </div>

                  <input
                    className="w-full text-center text-2xl font-label py-5 bg-surface-container border border-outline-variant/30 rounded-xl focus:border-primary/60 focus:bg-surface-container-high outline-none transition-all text-on-surface placeholder:text-on-surface-variant/25"
                    value={form.name}
                    onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                    placeholder="Your name…"
                    autoFocus
                  />

                  <div className="flex flex-col items-center gap-2 py-1">
                    <motion.button
                      onClick={() => handleListen('name')}
                      whileTap={{ scale: 0.88 }}
                      className={`w-16 h-16 rounded-full flex items-center justify-center transition-all border-2 ${
                        listeningField === 'name'
                          ? 'mic-active'
                          : 'bg-surface-container border-outline-variant/30 hover:border-primary/40 text-on-surface-variant hover:text-primary'
                      }`}
                    >
                      {listeningField === 'name' ? <MicOff size={22} /> : <Mic size={22} />}
                    </motion.button>
                    <span className={`text-[10px] font-label uppercase tracking-widest transition-colors ${
                      listeningField === 'name' ? 'text-tertiary' : 'text-on-surface-variant/40'
                    }`}>
                      {listeningField === 'name' ? '● Listening…' : 'Tap to speak'}
                    </span>
                  </div>

                  <button
                    onClick={() => validateAndNext(2)}
                    className="w-full bg-gradient-to-r from-primary to-primary-fixed text-on-primary font-label font-semibold py-4 rounded-xl flex justify-center items-center gap-2 transition-all hover:shadow-lg hover:shadow-primary/20 active:scale-[0.98]"
                  >
                    Continue <ArrowRight size={16} />
                  </button>
                </motion.div>
              )}

              {/* ── Step 2: Body Details ─────────────────── */}
              {step === 2 && (
                <motion.div key="s2" variants={slide} initial="initial" animate="animate" exit="exit"
                  className="flex flex-col gap-5">

                  <div>
                    <h2 className="font-headline text-3xl italic text-on-surface leading-tight">
                      Your blueprint,<br />{form.name.split(' ')[0] || 'friend'}.
                    </h2>
                    <p className="font-label text-xs text-on-surface-variant mt-2">
                      Your age, weight, and height let us calculate your exact calorie target
                    </p>
                  </div>

                  {[
                    { label: 'Age',            field: 'age',            unit: 'yrs', icon: Activity, placeholder: '25',  min: 10,  max: 100 },
                    { label: 'Current Weight', field: 'current_weight', unit: 'kg',  icon: Weight,   placeholder: '75',  min: 20,  max: 300 },
                    { label: 'Target Weight',  field: 'target_weight',  unit: 'kg',  icon: Target,   placeholder: '65',  min: 20,  max: 300 },
                    { label: 'Height',         field: 'height_cm',      unit: 'cm',  icon: Ruler,    placeholder: '170', min: 90,  max: 250 },
                  ].map(({ label, field, unit, icon: Icon, placeholder, min, max }) => {
                    const active  = listeningField === field;
                    const current = parseFloat(form[field]) || 0;

                    const adjust = (dir) => {
                      const next = Math.min(max, Math.max(min, current + dir));
                      setForm(p => ({ ...p, [field]: String(next) }));
                    };

                    return (
                      <div key={field}>
                        <label className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant flex items-center gap-1.5 mb-2">
                          <Icon size={11} /> {label}
                        </label>

                        <div className="flex items-stretch gap-2">
                          {/* Decrement */}
                          <button
                            type="button"
                            onClick={() => adjust(-1)}
                            className="w-12 flex-shrink-0 flex flex-col items-center justify-center gap-0.5 rounded-xl bg-surface-container border border-outline-variant/30 text-on-surface-variant hover:text-error hover:border-error/40 hover:bg-error/5 active:scale-95 transition-all py-3">
                            <Minus size={16} />
                            <span className="font-label text-[8px] uppercase tracking-widest opacity-50">−1</span>
                          </button>

                          {/* Central editable display */}
                          <div className={`flex-1 flex items-center justify-center gap-2 rounded-xl border transition-all px-3 ${
                            active
                              ? 'bg-surface-container-high border-tertiary/60'
                              : 'bg-surface-container border-outline-variant/30 focus-within:border-primary/60 focus-within:bg-surface-container-high'
                          }`}>
                            <input
                              type="number"
                              inputMode="decimal"
                              className="w-full bg-transparent outline-none font-label text-on-surface text-3xl font-bold text-center placeholder:text-on-surface-variant/25 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none py-3"
                              value={form[field]}
                              onChange={e => setForm(p => ({ ...p, [field]: e.target.value }))}
                              placeholder={active ? '…' : placeholder}
                            />
                            <span className="font-label text-base text-on-surface-variant flex-shrink-0 font-semibold">{unit}</span>
                          </div>

                          {/* Increment */}
                          <button
                            type="button"
                            onClick={() => adjust(1)}
                            className="w-12 flex-shrink-0 flex flex-col items-center justify-center gap-0.5 rounded-xl bg-surface-container border border-outline-variant/30 text-on-surface-variant hover:text-primary hover:border-primary/40 hover:bg-primary/5 active:scale-95 transition-all py-3">
                            <Plus size={16} />
                            <span className="font-label text-[8px] uppercase tracking-widest opacity-50">+1</span>
                          </button>

                          {/* Mic — full-height dedicated button, same tier as +/− */}
                          <button
                            type="button"
                            onClick={() => handleListen(field)}
                            className={`w-12 flex-shrink-0 flex flex-col items-center justify-center gap-0.5 rounded-xl border transition-all py-3 ${
                              active
                                ? 'mic-active border-tertiary/60'
                                : 'bg-surface-container border-outline-variant/30 text-on-surface-variant hover:text-tertiary hover:border-tertiary/50 hover:bg-tertiary/5'
                            }`}>
                            {active ? <MicOff size={18} /> : <Mic size={18} />}
                            <span className="font-label text-[8px] uppercase tracking-widest opacity-50">
                              {active ? 'stop' : 'voice'}
                            </span>
                          </button>
                        </div>

                        {/* Range hint */}
                        <p className="font-label text-[9px] text-on-surface-variant/40 uppercase tracking-widest mt-1.5 text-center">
                          {min}–{max} {unit}
                        </p>
                      </div>
                    );
                  })}

                  <button
                    onClick={() => validateAndNext(3)}
                    className="w-full mt-1 bg-gradient-to-r from-primary to-primary-fixed text-on-primary font-label font-semibold py-4 rounded-xl flex justify-center items-center gap-2 transition-all hover:shadow-lg hover:shadow-primary/20 active:scale-[0.98]"
                  >
                    Continue <ArrowRight size={16} />
                  </button>
                </motion.div>
              )}

              {/* ── Step 3: Allergies + Region ───────────── */}
              {step === 3 && (
                <motion.div key="s3" variants={slide} initial="initial" animate="animate" exit="exit"
                  className="flex flex-col gap-6">

                  <div>
                    <h2 className="font-headline text-3xl italic text-on-surface">Refine your palate.</h2>
                    <p className="font-label text-xs text-on-surface-variant mt-2">
                      Set restrictions and cuisine preference
                    </p>
                  </div>

                  {/* Allergies */}
                  <div>
                    <p className="font-label text-[10px] uppercase tracking-widest text-error/70 flex items-center gap-1.5 mb-3">
                      <AlertCircle size={11} /> Avoid these
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(ALLERGEN_META).map(([key, { emoji, label }]) => {
                        const sel = form.allergies.includes(key);
                        return (
                          <button
                            key={key}
                            onClick={() => toggleAllergy(key)}
                            className={`py-3 px-3 rounded-xl border transition-all flex items-center gap-2 text-sm font-label ${
                              sel
                                ? 'bg-error/10 border-error/30 text-error'
                                : 'bg-surface-container border-outline-variant/20 text-on-surface-variant hover:border-outline-variant/50'
                            }`}
                          >
                            <span className="text-base">{emoji}</span>
                            <span>{label}</span>
                            {sel && <span className="ml-auto text-error text-xs">✓</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Region */}
                  <div>
                    <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-3">
                      Cuisine preference
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {REGION_OPTIONS.map(({ value, emoji, label, desc }) => {
                        const sel = form.region === value;
                        return (
                          <button
                            key={value}
                            onClick={() => setForm(p => ({ ...p, region: value }))}
                            className={`p-3 rounded-xl border text-left transition-all ${
                              sel
                                ? 'bg-primary-container border-primary/30'
                                : 'bg-surface-container border-outline-variant/20 hover:border-outline-variant/50'
                            }`}
                          >
                            <span className="text-xl">{emoji}</span>
                            <p className={`font-label font-semibold text-sm mt-1 ${sel ? 'text-primary' : 'text-on-surface'}`}>{label}</p>
                            <p className="font-label text-[10px] text-on-surface-variant/60 leading-snug">{desc}</p>
                            {sel && (
                              <div className="mt-2 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                                <span className="text-on-primary text-[8px] font-bold">✓</span>
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <button
                    onClick={submitProfile}
                    disabled={submitting}
                    className="w-full bg-gradient-to-r from-tertiary to-tertiary-container text-on-tertiary font-label font-bold py-4 rounded-xl transition-all disabled:opacity-60 flex justify-center items-center gap-2 hover:shadow-lg hover:shadow-tertiary/20 active:scale-[0.98]"
                  >
                    {submitting ? (
                      <>
                        <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                        Generating your plan…
                      </>
                    ) : '✦ Generate My Plan'}
                  </button>
                </motion.div>
              )}

            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
