import React, { useState, useRef } from 'react';
import axios from 'axios';
import { Mic, MicOff, ArrowRight, ArrowLeft, Zap, AlertCircle, Weight, Ruler, Target } from 'lucide-react';
import { speakText } from './utils';
import Dashboard from './Dashboard';
import { motion, AnimatePresence } from 'framer-motion';
import toast, { Toaster } from 'react-hot-toast';

const TOTAL_STEPS = 3;

const ALLERGEN_META = {
  peanut: { emoji: '🥜', label: 'Peanut'  },
  dairy:  { emoji: '🥛', label: 'Dairy'   },
  gluten: { emoji: '🌾', label: 'Gluten'  },
  soy:    { emoji: '🫘', label: 'Soy'     },
};

const REGION_OPTIONS = [
  { value: 'North', emoji: '🫓', label: 'North Indian', desc: 'Roti, dal, paneer' },
  { value: 'South', emoji: '🍛', label: 'South Indian', desc: 'Rice, sambar, idli' },
  { value: 'All',   emoji: '🇮🇳', label: 'Mix of Both',  desc: 'Best of India' },
];

export default function App() {
  const [step, setStep] = useState(0);
  const [userData, setUserData] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const recognitionRef = useRef(null);

  const [form, setForm] = useState({
    name: '', language: 'English', region: 'North',
    current_weight: '', target_weight: '', height_cm: '',
    allergies: [], medical_conditions: [],
  });

  /* ── Voice Input ──────────────────────────────── */
  const handleListen = (field) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      toast.error("Voice input not supported in this browser. Please use Chrome.");
      return;
    }

    // Toggle off if already listening
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

    recognition.onstart = () => setIsListening(true);

    recognition.onresult = (e) => {
      const raw = e.results[0][0].transcript;
      // Preserve Unicode letters (Hindi Devanagari, etc.) — only strip punctuation
      const clean = raw.replace(/[^\p{L}\p{N}\p{Zs}]/gu, '').trim();
      setForm(prev => ({ ...prev, [field]: clean }));
    };

    recognition.onerror = async (e) => {
      setIsListening(false);
      recognitionRef.current = null;
      if (e.error === 'not-allowed' || e.error === 'permission-denied') {
        toast.error("Microphone access denied. Allow mic in browser settings.");
      } else if (e.error === 'no-speech') {
        toast("No speech detected. Tap mic and try again.", { icon: '🎙️' });
      } else if (e.error === 'audio-capture') {
        toast.error("No microphone found. Please connect one and try again.");
      } else if (e.error === 'network') {
        // Brave browser blocks the Web Speech API network call to Google's servers
        const isBrave = navigator.brave && (await navigator.brave.isBrave().catch(() => false));
        if (isBrave) {
          toast.error(
            "Brave blocks voice input. Open brave://settings/privacy and disable 'Block fingerprinting', or switch to Chrome.",
            { duration: 6000 }
          );
        } else {
          toast.error("Voice needs an internet connection. Check your network and try again.");
        }
      } else {
        toast.error(`Voice error: ${e.error}. Please type instead.`);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    try {
      recognition.start();
    } catch (err) {
      setIsListening(false);
      toast.error("Could not start microphone. Please type instead.");
    }
  };

  /* ── Validation ───────────────────────────────── */
  const validateAndNext = (target) => {
    if (step === 1 && !form.name.trim())
      return toast.error('Please enter your name.', { icon: '👤' });

    if (step === 2) {
      const cw = parseFloat(form.current_weight);
      const tw = parseFloat(form.target_weight);
      const h  = parseFloat(form.height_cm);
      if (!cw || cw < 20 || cw > 300) return toast.error('Weight must be 20–300 kg.');
      if (!tw || tw < 20 || tw > 300) return toast.error('Target weight must be 20–300 kg.');
      if (!h  || h  < 90 || h  > 250) return toast.error('Height must be 90–250 cm.');
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
      toast.error('Could not reach server. Is the backend running?');
    } finally {
      setSubmitting(false);
    }
  };

  if (userData) return <Dashboard user={userData} />;

  /* ── Framer variants ──────────────────────────── */
  const slide = {
    initial: { opacity: 0, x: 40 },
    animate: { opacity: 1, x: 0, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] } },
    exit:    { opacity: 0, x: -40, transition: { duration: 0.2 } },
  };

  return (
    <div className="app-bg flex items-center justify-center min-h-screen p-4">
      <Toaster
        position="top-center"
        toastOptions={{
          style: { borderRadius: '12px', fontWeight: 600, fontSize: '14px' },
          success: { iconTheme: { primary: '#22c55e', secondary: '#fff' } },
        }}
      />

      <div className="w-full max-w-sm">

        {/* ── Logo strip ── */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center shadow-brand-lg">
            <Zap size={16} className="text-white" fill="white" />
          </div>
          <span className="font-black text-slate-700 tracking-tight text-lg">AaharVoice</span>
        </div>

        {/* ── Card ── */}
        <div className="glass-card rounded-3xl shadow-card overflow-hidden">

          {/* Progress bar */}
          {step > 0 && (
            <div className="h-1 bg-slate-100 w-full">
              <motion.div
                className="h-full bg-gradient-to-r from-brand-400 to-brand-600 rounded-full"
                initial={{ width: `${((step - 1) / TOTAL_STEPS) * 100}%` }}
                animate={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
                transition={{ duration: 0.4, ease: 'easeInOut' }}
              />
            </div>
          )}

          <div className="p-7">

            {/* Step dots */}
            {step > 0 && (
              <div className="flex items-center justify-between mb-6">
                <button
                  onClick={() => setStep(s => s - 1)}
                  className="w-9 h-9 rounded-full flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-500 transition-all active:scale-95"
                >
                  <ArrowLeft size={16} />
                </button>
                <div className="flex gap-1.5">
                  {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
                    <div
                      key={i}
                      className={`rounded-full transition-all duration-300 ${
                        i + 1 === step ? 'w-6 h-2 bg-brand-500' :
                        i + 1  < step  ? 'w-2 h-2 bg-brand-300'  :
                                         'w-2 h-2 bg-slate-200'
                      }`}
                    />
                  ))}
                </div>
                <span className="text-xs font-semibold text-slate-400 tabular-nums">
                  {step}/{TOTAL_STEPS}
                </span>
              </div>
            )}

            <AnimatePresence mode="wait">

              {/* ── Step 0: Language ── */}
              {step === 0 && (
                <motion.div key="s0" variants={slide} initial="initial" animate="animate" exit="exit"
                  className="flex flex-col gap-4 text-center">

                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center mx-auto mb-1 shadow-brand-lg animate-bounce-gentle">
                    <span className="text-3xl">🍱</span>
                  </div>

                  <div>
                    <h1 className="text-2xl font-black text-slate-800 leading-tight">Welcome to</h1>
                    <h1 className="text-2xl font-black bg-gradient-to-r from-brand-500 to-brand-700 bg-clip-text text-transparent leading-tight">AaharVoice</h1>
                    <p className="text-slate-400 text-sm mt-2 font-medium">Your personal Indian nutrition companion</p>
                  </div>

                  <div className="flex flex-col gap-3 mt-2">
                    <button
                      className="choice-card w-full bg-gradient-to-r from-brand-500 to-brand-600 text-white font-bold py-4 rounded-2xl shadow-brand-lg flex items-center justify-center gap-3 text-lg"
                      onClick={() => { setForm(p => ({ ...p, language: 'Hindi' })); speakText('हिंदी चुनी गई', 'hi-IN'); setStep(1); }}
                    >
                      🇮🇳 हिंदी (Hindi)
                    </button>
                    <button
                      className="choice-card w-full bg-white border-2 border-slate-200 hover:border-brand-400 text-slate-700 font-bold py-4 rounded-2xl flex items-center justify-center gap-3 text-lg transition-colors"
                      onClick={() => { setForm(p => ({ ...p, language: 'English' })); speakText('English selected', 'en-IN'); setStep(1); }}
                    >
                      🇬🇧 English
                    </button>
                  </div>

                  <p className="text-xs text-slate-300 font-medium mt-1">Your personal Indian nutrition companion</p>
                </motion.div>
              )}

              {/* ── Step 1: Name ── */}
              {step === 1 && (
                <motion.div key="s1" variants={slide} initial="initial" animate="animate" exit="exit"
                  className="flex flex-col gap-5">

                  <div>
                    <h2 className="text-xl font-black text-slate-800">What should we call you?</h2>
                    <p className="text-sm text-slate-400 font-medium mt-1">Speak or type your name below</p>
                  </div>

                  <div className="relative">
                    <input
                      className="w-full text-center text-2xl font-bold p-5 bg-slate-50 border-2 border-slate-200 rounded-2xl focus:border-brand-500 focus:bg-white focus:outline-none transition-all placeholder:text-slate-200 placeholder:font-normal placeholder:text-xl"
                      value={form.name}
                      onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                      placeholder="Your name..."
                      autoFocus
                    />
                  </div>

                  <div className="flex flex-col items-center gap-2 py-2">
                    <motion.button
                      onClick={() => handleListen('name')}
                      whileTap={{ scale: 0.9 }}
                      className={`w-20 h-20 rounded-full flex items-center justify-center text-white shadow-lg transition-all
                        ${isListening ? 'mic-active bg-red-500' : 'bg-slate-800 hover:bg-slate-700 hover:shadow-xl'}`}
                    >
                      {isListening ? <MicOff size={30} /> : <Mic size={30} />}
                    </motion.button>
                    <span className={`text-xs font-semibold transition-colors ${isListening ? 'text-red-500' : 'text-slate-400'}`}>
                      {isListening ? '🔴 Listening…' : 'Tap to speak'}
                    </span>
                  </div>

                  <button
                    className="w-full bg-brand-500 hover:bg-brand-600 text-white font-bold py-4 rounded-2xl flex justify-center items-center gap-2 transition-all shadow-brand-lg active:scale-[0.98]"
                    onClick={() => validateAndNext(2)}
                  >
                    Continue <ArrowRight size={18} />
                  </button>
                </motion.div>
              )}

              {/* ── Step 2: Body details ── */}
              {step === 2 && (
                <motion.div key="s2" variants={slide} initial="initial" animate="animate" exit="exit"
                  className="flex flex-col gap-4">

                  <div>
                    <h2 className="text-xl font-black text-slate-800">
                      Nice to meet you, {form.name.split(' ')[0] || 'you'}! 👋
                    </h2>
                    <p className="text-sm text-slate-400 font-medium mt-1">Help us personalise your meal plan</p>
                  </div>

                  {[
                    { label: 'Current Weight',  field: 'current_weight', unit: 'kg',  icon: Weight,  placeholder: '75' },
                    { label: 'Target Weight',   field: 'target_weight',  unit: 'kg',  icon: Target,  placeholder: '65' },
                    { label: 'Height',          field: 'height_cm',      unit: 'cm',  icon: Ruler,   placeholder: '170' },
                  ].map(({ label, field, unit, icon: Icon, placeholder }) => (
                    <div key={field}>
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1 flex items-center gap-1.5">
                        <Icon size={12} /> {label}
                      </label>
                      <div className="relative mt-1">
                        <input
                          type="number"
                          inputMode="numeric"
                          className="w-full p-4 pr-14 bg-slate-50 border-2 border-slate-200 rounded-xl focus:border-brand-500 focus:bg-white outline-none transition-all font-semibold text-slate-700 text-lg"
                          value={form[field]}
                          onChange={e => setForm(p => ({ ...p, [field]: e.target.value }))}
                          placeholder={placeholder}
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">{unit}</span>
                      </div>
                    </div>
                  ))}

                  <button
                    className="w-full mt-1 bg-brand-500 hover:bg-brand-600 text-white font-bold py-4 rounded-2xl flex justify-center items-center gap-2 transition-all shadow-brand-lg active:scale-[0.98]"
                    onClick={() => validateAndNext(3)}
                  >
                    Continue <ArrowRight size={18} />
                  </button>
                </motion.div>
              )}

              {/* ── Step 3: Allergies + Region ── */}
              {step === 3 && (
                <motion.div key="s3" variants={slide} initial="initial" animate="animate" exit="exit"
                  className="flex flex-col gap-5">

                  {/* Allergies */}
                  <div>
                    <h2 className="text-sm font-black text-red-500 uppercase tracking-wider flex items-center gap-1.5 mb-3">
                      <AlertCircle size={14} /> Allergies to avoid
                    </h2>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(ALLERGEN_META).map(([key, { emoji, label }]) => {
                        const selected = form.allergies.includes(key);
                        return (
                          <button
                            key={key}
                            onClick={() => toggleAllergy(key)}
                            className={`choice-card py-3 px-3 rounded-xl border-2 font-semibold transition-all flex items-center gap-2 text-sm
                              ${selected
                                ? 'bg-red-50 border-red-300 text-red-600 shadow-sm'
                                : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300'}`}
                          >
                            <span className="text-lg">{emoji}</span>
                            <span>{label}</span>
                            {selected && <span className="ml-auto text-red-500">✓</span>}
                          </button>
                        );
                      })}
                    </div>
                    {form.allergies.length === 0 && (
                      <p className="text-xs text-slate-400 font-medium mt-2 ml-1">Tap to select — or skip if none</p>
                    )}
                  </div>

                  {/* Region */}
                  <div>
                    <h2 className="text-sm font-black text-slate-600 uppercase tracking-wider mb-3">
                      🗺️ Cuisine Preference
                    </h2>
                    <div className="flex flex-col gap-2">
                      {REGION_OPTIONS.map(({ value, emoji, label, desc }) => {
                        const selected = form.region === value;
                        return (
                          <button
                            key={value}
                            onClick={() => setForm(p => ({ ...p, region: value }))}
                            className={`choice-card flex items-center gap-3 p-3.5 rounded-xl border-2 text-left transition-all
                              ${selected
                                ? 'bg-brand-50 border-brand-400 shadow-sm'
                                : 'bg-slate-50 border-slate-200 hover:border-slate-300'}`}
                          >
                            <span className="text-2xl">{emoji}</span>
                            <div className="flex-1">
                              <p className={`font-bold text-sm ${selected ? 'text-brand-700' : 'text-slate-700'}`}>{label}</p>
                              <p className="text-xs text-slate-400 font-medium">{desc}</p>
                            </div>
                            {selected && (
                              <div className="w-5 h-5 rounded-full bg-brand-500 flex items-center justify-center flex-shrink-0">
                                <span className="text-white text-xs">✓</span>
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
                    className="w-full bg-gradient-to-r from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 text-white font-black py-4 rounded-2xl transition-all disabled:opacity-60 flex justify-center items-center gap-2 text-base shadow-lg active:scale-[0.98]"
                  >
                    {submitting ? (
                      <>
                        <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                        </svg>
                        Generating your plan…
                      </>
                    ) : (
                      <>✨ Generate My Plan</>
                    )}
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
