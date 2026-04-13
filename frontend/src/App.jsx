import React, { useState, useRef } from 'react';
import axios from 'axios';
import { Mic, MicOff, ArrowRight, Activity, AlertCircle } from 'lucide-react';
import { speakText } from './utils';
import Dashboard from './Dashboard';
import { motion, AnimatePresence } from 'framer-motion';
import toast, { Toaster } from 'react-hot-toast';

export default function App() {
  const [step, setStep] = useState(0);
  const [userData, setUserData] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const recognitionRef = useRef(null);

  const [form, setForm] = useState({
    name: '',
    language: 'English',
    region: 'North',
    current_weight: '',
    target_weight: '',
    height_cm: '',
    allergies: [],
    medical_conditions: [],
  });

  const handleListen = (field) => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error("Your browser doesn't support voice input. Please type.");
      return;
    }

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang = form.language === 'Hindi' ? 'hi-IN' : 'en-IN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setIsListening(true);

    recognition.onresult = (e) => {
      const transcript = e.results[0][0].transcript.replace(/[^a-zA-Z0-9 ]/g, '');
      setForm(prev => ({ ...prev, [field]: transcript }));
    };

    recognition.onerror = (e) => {
      if (e.error !== 'no-speech') toast.error("Didn't catch that. Try typing.");
      setIsListening(false);
    };

    recognition.onend = () => setIsListening(false);

    try {
      recognition.start();
      setTimeout(() => { try { recognition.stop(); } catch (_) {} }, 6000);
    } catch (_) {
      setIsListening(false);
    }
  };

  const validateAndNext = (targetStep) => {
    if (step === 1 && !form.name.trim()) {
      return toast.error('Please enter your name.');
    }
    if (step === 2) {
      const cw = parseFloat(form.current_weight);
      const tw = parseFloat(form.target_weight);
      const h = parseFloat(form.height_cm);
      if (!cw || cw < 20 || cw > 300) return toast.error('Current weight must be between 20–300 kg.');
      if (!tw || tw < 20 || tw > 300) return toast.error('Target weight must be between 20–300 kg.');
      if (!h || h < 90 || h > 250) return toast.error('Height must be between 90–250 cm.');
    }
    setStep(targetStep);
  };

  const toggleArray = (field, value) => {
    setForm(prev => {
      const arr = prev[field];
      return { ...prev, [field]: arr.includes(value) ? arr.filter(i => i !== value) : [...arr, value] };
    });
  };

  const submitProfile = async () => {
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        current_weight: parseFloat(form.current_weight),
        target_weight: parseFloat(form.target_weight),
        height_cm: parseFloat(form.height_cm),
      };
      const res = await axios.post('http://127.0.0.1:8000/api/users/', payload);
      setUserData(res.data);
      toast.success('Profile created! AI is generating your plan...');
    } catch {
      toast.error('Failed to connect to server. Is the backend running?');
    } finally {
      setSubmitting(false);
    }
  };

  if (userData) return <Dashboard user={userData} />;

  const slide = {
    initial: { opacity: 0, x: 50 },
    animate: { opacity: 1, x: 0 },
    exit:    { opacity: 0, x: -50 },
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <Toaster position="top-center" />

      <div className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden border border-slate-100">
        {/* Progress bar */}
        <div className="h-1.5 bg-brand-100 w-full">
          <div
            className="h-full bg-brand-500 transition-all duration-500"
            style={{ width: `${(step / 3) * 100}%` }}
          />
        </div>

        <div className="p-8">
          <AnimatePresence mode="wait">

            {step === 0 && (
              <motion.div key="step0" variants={slide} initial="initial" animate="animate" exit="exit"
                className="flex flex-col gap-4 text-center">
                <div className="bg-brand-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-2">
                  <Activity className="text-brand-600 w-8 h-8" />
                </div>
                <h1 className="text-2xl font-bold text-slate-800">Welcome to AaharVoice</h1>
                <p className="text-slate-500 mb-2">Select your preferred language to begin.</p>

                <button
                  className="w-full bg-brand-500 hover:bg-brand-600 text-white font-semibold py-4 rounded-xl transition-all shadow-md shadow-brand-500/30"
                  onClick={() => { setForm(prev => ({ ...prev, language: 'Hindi' })); speakText('हिंदी चुनी गई', 'hi-IN'); setStep(1); }}
                >
                  हिंदी (Hindi)
                </button>
                <button
                  className="w-full bg-white border-2 border-slate-200 hover:border-brand-500 text-slate-700 font-semibold py-4 rounded-xl transition-all"
                  onClick={() => { setForm(prev => ({ ...prev, language: 'English' })); speakText('English selected', 'en-IN'); setStep(1); }}
                >
                  English
                </button>
              </motion.div>
            )}

            {step === 1 && (
              <motion.div key="step1" variants={slide} initial="initial" animate="animate" exit="exit"
                className="flex flex-col gap-6 text-center">
                <h1 className="text-2xl font-bold text-slate-800">What is your name?</h1>

                <input
                  className="w-full text-center text-xl p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl focus:border-brand-500 focus:outline-none transition-all"
                  value={form.name}
                  onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Type your name..."
                />

                <div className="flex flex-col items-center gap-2">
                  <button
                    onClick={() => handleListen('name')}
                    className={`w-20 h-20 rounded-full flex items-center justify-center text-white transition-all shadow-lg ${isListening ? 'mic-active' : 'bg-slate-800 hover:bg-slate-700'}`}
                  >
                    {isListening ? <MicOff size={32} /> : <Mic size={32} />}
                  </button>
                  <span className="text-sm text-slate-400 font-medium">
                    {isListening ? 'Listening...' : 'Tap to Speak'}
                  </span>
                </div>

                <button
                  className="w-full bg-brand-500 hover:bg-brand-600 text-white font-semibold py-4 rounded-xl flex justify-center items-center gap-2 transition-all"
                  onClick={() => validateAndNext(2)}
                >
                  Continue <ArrowRight size={20} />
                </button>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div key="step2" variants={slide} initial="initial" animate="animate" exit="exit"
                className="flex flex-col gap-4">
                <h1 className="text-2xl font-bold text-slate-800 text-center mb-2">Body Details</h1>

                {[
                  { label: 'Current Weight (kg)', field: 'current_weight', placeholder: 'e.g. 75' },
                  { label: 'Target Weight (kg)',  field: 'target_weight',  placeholder: 'e.g. 65' },
                  { label: 'Height (cm)',          field: 'height_cm',      placeholder: 'e.g. 170' },
                ].map(({ label, field, placeholder }) => (
                  <div key={field}>
                    <label className="text-sm font-semibold text-slate-500 ml-1">{label}</label>
                    <input
                      type="number"
                      className="w-full p-4 bg-slate-50 border-2 border-slate-200 rounded-xl mt-1 focus:border-brand-500 outline-none transition-all"
                      value={form[field]}
                      onChange={e => setForm(prev => ({ ...prev, [field]: e.target.value }))}
                      placeholder={placeholder}
                    />
                  </div>
                ))}

                <button
                  className="w-full mt-2 bg-brand-500 hover:bg-brand-600 text-white font-semibold py-4 rounded-xl flex justify-center items-center gap-2 transition-all"
                  onClick={() => validateAndNext(3)}
                >
                  Continue <ArrowRight size={20} />
                </button>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div key="step3" variants={slide} initial="initial" animate="animate" exit="exit"
                className="flex flex-col gap-6">
                <div>
                  <h2 className="text-xl font-bold text-red-500 mb-3 flex items-center gap-2">
                    <AlertCircle size={20} /> Any Allergies?
                  </h2>
                  <div className="grid grid-cols-2 gap-3">
                    {['peanut', 'dairy', 'gluten', 'soy'].map(alg => (
                      <button
                        key={alg}
                        onClick={() => toggleArray('allergies', alg)}
                        className={`py-3 px-4 rounded-xl font-semibold border-2 transition-all capitalize
                          ${form.allergies.includes(alg)
                            ? 'bg-red-50 border-red-300 text-red-600'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300'}`}
                      >
                        {alg}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <h2 className="text-xl font-bold text-slate-800 mb-3">Regional Food</h2>
                  <select
                    className="w-full p-4 bg-slate-50 border-2 border-slate-200 rounded-xl font-medium text-slate-700 outline-none focus:border-brand-500 appearance-none transition-all"
                    value={form.region}
                    onChange={e => setForm(prev => ({ ...prev, region: e.target.value }))}
                  >
                    <option value="North">North Indian</option>
                    <option value="South">South Indian</option>
                    <option value="All">Mix of Both</option>
                  </select>
                </div>

                <button
                  onClick={submitProfile}
                  disabled={submitting}
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-4 rounded-xl transition-all disabled:opacity-50 flex justify-center items-center gap-2"
                >
                  {submitting ? 'Generating AI Plan...' : 'Generate My Plan ✨'}
                </button>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
