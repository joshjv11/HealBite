import React, { useState, useRef } from 'react';
import axios from 'axios';
import {
  Mic, MicOff, ArrowRight, ArrowLeft,
  AlertCircle, Weight, Ruler, Target,
} from 'lucide-react';
import { speakText } from './utils';
import Dashboard from './Dashboard';
import { motion, AnimatePresence } from 'framer-motion';
import toast, { Toaster } from 'react-hot-toast';

const TOTAL_STEPS = 3;

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
  const [isListening, setIsListening] = useState(false);
  const [submitting, setSubmitting]   = useState(false);
  const recognitionRef = useRef(null);

  const [form, setForm] = useState({
    name: '', language: 'English', region: 'North',
    current_weight: '', target_weight: '', height_cm: '',
    allergies: [], medical_conditions: [],
  });

  /* ── Voice Input ──────────────────────────────── */
  const handleListen = (field) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { toast.error("Voice not supported. Use Chrome.", TOAST_STYLE); return; }

    if (isListening && recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
      setIsListening(false);
      return;
    }

    const recognition = new SR();
    recognitionRef.current = recognition;
    recognition.lang = form.language === 'Hindi' ? 'hi-IN' : 'en-IN';
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognition.onstart  = () => setIsListening(true);
    recognition.onresult = (e) => {
      const raw   = e.results[0][0].transcript;
      const clean = raw.replace(/[^\p{L}\p{N}\p{Zs}]/gu, '').trim();
      setForm(prev => ({ ...prev, [field]: clean }));
    };
    recognition.onerror = async (e) => {
      setIsListening(false);
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
    recognition.onend = () => { setIsListening(false); recognitionRef.current = null; };

    try { recognition.start(); } catch { setIsListening(false); toast.error("Could not start microphone.", TOAST_STYLE); }
  };

  /* ── Validation ───────────────────────────────── */
  const validateAndNext = (target) => {
    if (step === 1 && !form.name.trim()) return toast.error('Please enter your name.', TOAST_STYLE);
    if (step === 2) {
      const cw = parseFloat(form.current_weight);
      const tw = parseFloat(form.target_weight);
      const h  = parseFloat(form.height_cm);
      if (!cw || cw < 20 || cw > 300) return toast.error('Weight must be 20–300 kg.', TOAST_STYLE);
      if (!tw || tw < 20 || tw > 300) return toast.error('Target weight must be 20–300 kg.', TOAST_STYLE);
      if (!h  || h  < 90 || h  > 250) return toast.error('Height must be 90–250 cm.', TOAST_STYLE);
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
          <span className="font-headline text-4xl italic text-on-surface tracking-tight">AaharVoice</span>
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
                  onClick={() => setStep(s => s - 1)}
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

              {/* ── Step 0: Language ─────────────────────── */}
              {step === 0 && (
                <motion.div key="s0" variants={slide} initial="initial" animate="animate" exit="exit"
                  className="flex flex-col gap-6 text-center">

                  <div className="py-2">
                    <div className="w-20 h-20 rounded-2xl bg-primary-container border border-primary/20 flex items-center justify-center mx-auto mb-6">
                      <span className="text-4xl">🍱</span>
                    </div>
                    <h1 className="font-headline text-4xl italic text-on-surface leading-tight">
                      Your nutrition,<br />refined.
                    </h1>
                    <p className="font-label text-[10px] uppercase tracking-[0.2em] text-tertiary mt-4">
                      Choose your language to begin
                    </p>
                  </div>

                  <div className="flex flex-col gap-3">
                    <button
                      onClick={() => { setForm(p => ({ ...p, language: 'Hindi' })); speakText('हिंदी चुनी गई', 'hi-IN'); setStep(1); }}
                      className="w-full py-4 bg-surface-container border border-outline-variant/30 hover:border-primary/40 hover:bg-surface-container-high rounded-xl font-label text-on-surface text-lg transition-all active:scale-[0.98]"
                    >
                      🇮🇳 हिंदी (Hindi)
                    </button>
                    <button
                      onClick={() => { setForm(p => ({ ...p, language: 'English' })); speakText('English selected', 'en-IN'); setStep(1); }}
                      className="w-full py-4 bg-primary-container border border-primary/20 hover:border-primary/50 rounded-xl font-label text-on-surface text-lg transition-all active:scale-[0.98]"
                    >
                      🇬🇧 English
                    </button>
                  </div>

                  <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant/40">
                    Your personal Indian nutrition companion
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
                        isListening
                          ? 'mic-active'
                          : 'bg-surface-container border-outline-variant/30 hover:border-primary/40 text-on-surface-variant hover:text-primary'
                      }`}
                    >
                      {isListening ? <MicOff size={22} /> : <Mic size={22} />}
                    </motion.button>
                    <span className={`text-[10px] font-label uppercase tracking-widest transition-colors ${
                      isListening ? 'text-tertiary' : 'text-on-surface-variant/40'
                    }`}>
                      {isListening ? '● Listening…' : 'Tap to speak'}
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
                      We'll personalise your plan to these numbers
                    </p>
                  </div>

                  {[
                    { label: 'Current Weight', field: 'current_weight', unit: 'kg', icon: Weight,  placeholder: '75' },
                    { label: 'Target Weight',  field: 'target_weight',  unit: 'kg', icon: Target,  placeholder: '65' },
                    { label: 'Height',         field: 'height_cm',      unit: 'cm', icon: Ruler,   placeholder: '170' },
                  ].map(({ label, field, unit, icon: Icon, placeholder }) => (
                    <div key={field}>
                      <label className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant flex items-center gap-1.5 mb-1.5">
                        <Icon size={11} /> {label}
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          inputMode="numeric"
                          className="w-full p-4 pr-14 bg-surface-container border border-outline-variant/30 rounded-xl focus:border-primary/60 focus:bg-surface-container-high outline-none transition-all font-label text-on-surface text-lg placeholder:text-on-surface-variant/25"
                          value={form[field]}
                          onChange={e => setForm(p => ({ ...p, [field]: e.target.value }))}
                          placeholder={placeholder}
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant font-label text-sm">{unit}</span>
                      </div>
                    </div>
                  ))}

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
