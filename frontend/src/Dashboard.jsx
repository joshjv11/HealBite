import React, { useEffect, useState, useRef, useCallback } from 'react';
import axios from 'axios';
import {
  Volume2, PlayCircle, Search, Loader2, RefreshCw,
  Activity, CheckCircle, Trash2, Mic, MicOff, FileText,
  ChefHat, Flame, Beef,
} from 'lucide-react';
import { speakText } from './utils';
import toast, { Toaster } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';

const TOAST_STYLE = {
  style: {
    background: '#1e201e', color: '#e2e3df',
    borderRadius: '12px', fontWeight: 600, fontSize: '14px',
    border: '1px solid #404944',
  },
};

const API = 'http://127.0.0.1:8000';

/* ── BMI ring ── */
function bmiRing(bmi) {
  if (bmi < 18.5) return { label: 'Underweight', cls: 'text-primary',  pct: 30 };
  if (bmi < 25)   return { label: 'Healthy',     cls: 'text-primary',  pct: 75 };
  if (bmi < 30)   return { label: 'Overweight',  cls: 'text-tertiary', pct: 48 };
                  return { label: 'Obese',        cls: 'text-error',    pct: 22 };
}

/* ── Category pill styles ── */
const CAT = {
  'Small Meal':   { label: 'Light', icon: '🌅', tag: 'bg-primary/20 text-primary border-primary/20'           },
  'Avg Meal':     { label: 'Main',  icon: '☀️', tag: 'bg-surface-container-highest text-on-surface border-outline-variant/20' },
  'Tiny/Craving': { label: 'Snack', icon: '🌙', tag: 'bg-tertiary/20 text-tertiary border-tertiary/20'        },
};

const CARD_GRADS = [
  'from-primary-container/80 to-surface-container-lowest',
  'from-tertiary-container/60 to-surface-container-lowest',
  'from-surface-container-high to-surface-container-lowest',
  'from-primary-container/50 to-surface-container-low',
  'from-tertiary-container/40 to-surface-container-lowest',
  'from-surface-container-highest to-surface-container-lowest',
];

/* ── Tab config ── */
const TABS = [
  { id: 'plan',    label: 'Provisions', icon: '🍲' },
  { id: 'tracker', label: 'Journal',    icon: '📊' },
  { id: 'pantry',  label: 'Pantry',     icon: '🧊' },
  { id: 'medical', label: 'Clinical',   icon: '🩸' },
];

/* ── Meal skeleton ── */
function MealSkeleton() {
  return (
    <div className="bg-surface-container-low p-6 rounded-3xl border border-outline-variant/20">
      <div className="w-16 h-16 bg-surface-container-high rounded-2xl animate-pulse mb-4" />
      <div className="h-7 bg-surface-container-high rounded-lg animate-pulse w-3/4 mb-2" />
      <div className="h-4 bg-surface-container-high rounded animate-pulse w-1/2 mb-6" />
      <div className="h-12 bg-surface-container-high rounded-xl animate-pulse" />
    </div>
  );
}

export default function Dashboard({ user: initialUser }) {
  const [user, setUser]         = useState(initialUser);
  const [activeTab, setActiveTab] = useState('plan');

  /* Plan state */
  const [meals, setMeals]           = useState([]);
  const [loadingMeals, setLoadingMeals] = useState(true);
  const [visibleMeals, setVisibleMeals] = useState([]);

  /* Craving engine state */
  const [craving, setCraving]       = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [suggestSrc, setSuggestSrc] = useState('');
  const [searching, setSearching]   = useState(false);
  const cravingRef = useRef(null);

  /* Tracker state */
  const [trackerStats, setTrackerStats] = useState({ total_cal: 0, total_pro: 0, eaten_meals: [] });

  /* Pantry state */
  const [pantryInput, setPantryInput]   = useState('');
  const [pantryResult, setPantryResult] = useState(null);
  const [loadingPantry, setLoadingPantry] = useState(false);
  const [isListeningPantry, setIsListeningPantry] = useState(false);
  const pantryRecRef = useRef(null);

  /* Medical state */
  const [reportFile, setReportFile]   = useState(null);
  const [previewUrl, setPreviewUrl]   = useState(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const fileInputRef = useRef(null);

  const isHindi = user.language === 'Hindi';
  const lang    = isHindi ? 'hi-IN' : 'en-IN';
  const ring    = bmiRing(user.bmi);
  const R       = 58;
  const circ    = 2 * Math.PI * R;

  const today = new Date().toLocaleDateString(isHindi ? 'hi-IN' : 'en-IN', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  /* ── Fetch meals ── */
  const fetchMeals = useCallback(() => {
    setLoadingMeals(true);
    setMeals([]);
    setVisibleMeals([]);
    axios.get(`${API}/api/meals/${user.id}`)
      .then(res => {
        const list = res.data.meals || [];
        setMeals(list);
        list.forEach((_, i) => setTimeout(() => setVisibleMeals(prev => [...prev, i]), i * 110));
      })
      .catch(() => toast.error('Failed to load provisions.', TOAST_STYLE))
      .finally(() => setLoadingMeals(false));
  }, [user.id]);

  /* ── Fetch logs ── */
  const fetchLogs = useCallback(() => {
    axios.get(`${API}/api/today-log/${user.id}`)
      .then(res => setTrackerStats(res.data))
      .catch(console.error);
  }, [user.id]);

  useEffect(() => { fetchMeals(); fetchLogs(); }, [fetchMeals, fetchLogs]);

  /* ── Log a meal ── */
  const logMeal = async (meal) => {
    try {
      const res = await axios.post(`${API}/api/log-meal/`, {
        user_id: user.id, meal_name: meal.name,
        calories: meal.calories, protein: meal.protein,
      });
      setTrackerStats(res.data);
      toast.success(`Logged: ${meal.name}`, TOAST_STYLE);
    } catch { toast.error('Failed to log meal.', TOAST_STYLE); }
  };

  /* ── Undo a log ── */
  const undoLog = async (mealName) => {
    try {
      const res = await axios.delete(
        `${API}/api/log-meal/${user.id}/${encodeURIComponent(mealName)}`
      );
      setTrackerStats(res.data);
      toast('Removed from log.', { icon: '🗑️', ...TOAST_STYLE });
    } catch { toast.error('Failed to remove log.', TOAST_STYLE); }
  };

  /* ── Suggest engine ── */
  const findSuggestions = async () => {
    if (!craving.trim()) { cravingRef.current?.focus(); return; }
    setSearching(true);
    setSuggestions([]);
    setSuggestSrc('');
    try {
      const res = await axios.post(`${API}/api/suggest/`, {
        prompt: craving, allergies: user.allergies || [],
      });
      setSuggestions(res.data.suggestions || []);
      setSuggestSrc(res.data.source || '');
    } catch { toast.error("Couldn't get suggestions.", TOAST_STYLE); }
    finally { setSearching(false); }
  };

  /* ── Pantry chef ── */
  const cookFromPantry = async () => {
    if (!pantryInput.trim()) return toast.error('Enter some ingredients.', TOAST_STYLE);
    setLoadingPantry(true);
    setPantryResult(null);
    try {
      const res = await axios.post(`${API}/api/pantry/`, {
        ingredients: pantryInput,
        allergies: user.allergies || [],
        target_cal: user.target_cal,
      });
      setPantryResult(res.data);
      speakText(`Recipe ready: ${res.data.name}`, lang);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Pantry chef failed.', TOAST_STYLE);
    }
    setLoadingPantry(false);
  };

  /* ── Pantry voice input ── */
  const handleListenPantry = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return toast.error('Voice not supported. Use Chrome.', TOAST_STYLE);
    if (isListeningPantry && pantryRecRef.current) {
      pantryRecRef.current.abort();
      setIsListeningPantry(false);
      return;
    }
    const rec = new SR();
    pantryRecRef.current = rec;
    rec.lang = lang;
    rec.onstart  = () => setIsListeningPantry(true);
    rec.onresult = e => setPantryInput(e.results[0][0].transcript);
    rec.onerror  = () => setIsListeningPantry(false);
    rec.onend    = () => setIsListeningPantry(false);
    rec.start();
  };

  /* ── File picker ── */
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setReportFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  /* ── Upload medical report ── */
  const uploadReport = async () => {
    if (!reportFile) return toast.error('Select an image first.', TOAST_STYLE);
    setLoadingReport(true);
    const fd = new FormData();
    fd.append('file', reportFile);
    fd.append('user_id', user.id);
    try {
      const res = await axios.post(`${API}/api/scan-report/`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setUser(res.data.user);
      toast.success('Clinical profile updated. Regenerating meals…', { duration: 5000, ...TOAST_STYLE });
      setReportFile(null);
      setPreviewUrl(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      fetchMeals();
      setActiveTab('plan');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to scan report.', TOAST_STYLE);
    }
    setLoadingReport(false);
  };

  const calPct      = Math.min((trackerStats.total_cal / user.target_cal) * 100, 100);
  const hasDirective = user.clinical_data?.clinical_directive;

  return (
    <div className="bg-background text-on-surface font-body min-h-screen">
      <Toaster position="top-center" toastOptions={TOAST_STYLE} />

      {/* ══════════ TOP NAV ══════════ */}
      <nav className="fixed top-0 w-full z-50 bg-surface-container-lowest/70 backdrop-blur-xl border-b border-outline-variant/10 flex justify-between items-center px-6 py-4">
        <div className="flex items-center gap-8">
          <span className="font-headline text-2xl italic text-on-surface tracking-tight">AaharVoice</span>
          <div className="hidden md:flex gap-6">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`font-label text-sm transition-colors ${activeTab === t.id ? 'text-primary font-semibold' : 'text-on-surface-variant hover:text-on-surface'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {hasDirective && (
            <div className="hidden md:flex items-center gap-1.5 bg-error/10 border border-error/30 text-error px-3 py-1.5 rounded-full text-[10px] font-label font-bold uppercase tracking-widest">
              <Activity size={11} /> Medical Directive Active
            </div>
          )}
          <span className="material-symbols-outlined text-on-surface-variant hover:text-primary transition-colors cursor-pointer" style={{ fontSize: '28px' }}>account_circle</span>
        </div>
      </nav>

      {/* ══════════ HERO ══════════ */}
      <header className="pt-28 px-6 max-w-5xl mx-auto mb-6">
        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="font-headline text-4xl md:text-6xl italic text-on-surface tracking-tight mb-2"
        >
          Namaste, {user.name.split(' ')[0]}.
        </motion.h1>
        <p className="font-label text-xs uppercase tracking-[0.2em] text-tertiary opacity-80">{today}</p>

        {hasDirective && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="mt-4 inline-flex items-center gap-2 bg-error/10 text-error px-4 py-2.5 rounded-xl text-xs font-label font-bold border border-error/30 shadow-lg shadow-error/5"
          >
            <Activity size={14} /> Medical directive active — AI meals are clinically adapted.
          </motion.div>
        )}
      </header>

      {/* ══════════ TABS ══════════ */}
      <div className="flex gap-2 px-6 mb-8 max-w-5xl mx-auto overflow-x-auto pb-1">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-label text-sm uppercase tracking-widest whitespace-nowrap transition-all border flex-shrink-0 ${
              activeTab === t.id
                ? 'bg-primary-container border-primary/40 text-primary'
                : 'bg-surface-container border-outline-variant/20 text-on-surface-variant hover:bg-surface-container-high'
            }`}
          >
            <span className="text-base">{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      <main className="px-6 max-w-5xl mx-auto pb-32">
        <AnimatePresence mode="wait">

          {/* ═══════════════ TAB: PROVISIONS ═══════════════ */}
          {activeTab === 'plan' && (
            <motion.div key="plan" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>

              {/* Stat row */}
              <div className="grid grid-cols-3 gap-4 mb-8">
                <div className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/10 border-b-2 border-b-primary/30 text-center">
                  <span className="font-label font-bold text-2xl text-primary">{user.target_cal}</span>
                  <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant mt-0.5">kcal goal</p>
                </div>
                <div className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/10 border-b-2 border-b-tertiary/30 text-center">
                  <span className="font-label font-bold text-2xl text-tertiary">{user.target_protein}g</span>
                  <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant mt-0.5">protein</p>
                </div>
                <div className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/10 border-b-2 border-b-outline-variant/30 text-center">
                  <span className={`font-label font-bold text-2xl ${ring.cls}`}>{user.bmi}</span>
                  <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant mt-0.5">{ring.label}</p>
                </div>
              </div>

              {/* Craving engine */}
              <div className="mb-10">
                <div className="relative max-w-2xl">
                  <div className="absolute -inset-1 bg-gradient-to-r from-primary/25 to-tertiary/25 rounded-2xl blur-lg opacity-20 pointer-events-none" />
                  <div className="relative bg-surface-container-lowest border border-outline-variant/15 border-b-2 border-b-outline-variant/30 px-6 py-4 rounded-2xl flex items-start gap-3">
                    <span className="material-symbols-outlined text-tertiary mt-1 flex-shrink-0" style={{ fontSize: '26px' }}>restaurant_menu</span>
                    <textarea
                      ref={cravingRef}
                      rows={2}
                      className="bg-transparent border-none outline-none text-lg font-headline italic w-full text-on-surface placeholder:text-on-surface-variant/30 leading-snug"
                      value={craving}
                      onChange={e => setCraving(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && e.ctrlKey && findSuggestions()}
                      placeholder="What does your soul crave today?"
                    />
                    <button
                      onClick={findSuggestions}
                      disabled={searching}
                      className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 transition-all disabled:opacity-50 mt-0.5"
                    >
                      {searching ? <Loader2 size={17} className="animate-spin" /> : <Search size={17} />}
                    </button>
                  </div>
                </div>

                {suggestions.length > 0 && (
                  <div className="mt-5 max-w-2xl">
                    <div className="flex items-center justify-between mb-3">
                      <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">Here's what we suggest</p>
                      {suggestSrc === 'fallback' && (
                        <span className="font-label text-[10px] text-tertiary bg-tertiary/10 px-2.5 py-1 rounded-full border border-tertiary/20">offline picks</span>
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {suggestions.map((s, idx) => (
                        <motion.div
                          key={idx}
                          initial={{ opacity: 0, y: 14 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.1 }}
                          className="bg-surface-container-low rounded-xl p-5 border border-outline-variant/20 hover:border-primary/30 transition-all"
                        >
                          <div className="text-3xl mb-2">{s.emoji}</div>
                          <h4 className="font-headline text-lg italic text-on-surface leading-tight mb-2">{s.name}</h4>
                          <p className="font-label text-xs text-on-surface-variant leading-relaxed mb-3">{s.reasoning}</p>
                          <div className="flex flex-wrap gap-3 items-center">
                            <span className="font-label text-[10px] uppercase tracking-wider text-primary flex items-center gap-1"><Flame size={10} /> {s.calories} kcal</span>
                            <span className="font-label text-[10px] uppercase tracking-wider text-tertiary flex items-center gap-1"><Beef size={10} /> {s.protein}g</span>
                            <a href={`https://www.youtube.com/results?search_query=${encodeURIComponent(s.youtube_query || s.name + ' recipe')}`} target="_blank" rel="noreferrer" className="font-label text-[10px] text-on-surface-variant hover:text-primary flex items-center gap-1 transition-colors">
                              <PlayCircle size={10} /> Watch
                            </a>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Meal grid header */}
              <div className="flex justify-between items-baseline mb-8 border-b border-outline-variant/10 pb-4">
                <h2 className="font-headline text-3xl italic text-on-surface">Curated Provisions</h2>
                <button onClick={fetchMeals} className="text-primary hover:text-primary-fixed transition-colors flex items-center gap-1.5 font-label text-xs uppercase tracking-widest">
                  <RefreshCw size={14} className={loadingMeals ? 'animate-spin' : ''} /> Refresh
                </button>
              </div>

              {/* Meal cards */}
              {loadingMeals ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {[...Array(6)].map((_, i) => <MealSkeleton key={i} />)}
                </div>
              ) : meals.length === 0 ? (
                <div className="text-center py-20 border border-outline-variant/10 rounded-2xl bg-surface-container-low">
                  <p className="font-headline text-2xl italic text-on-surface-variant mb-2">No provisions found.</p>
                  <p className="font-label text-xs text-on-surface-variant/40 mb-6">Check backend connection.</p>
                  <button onClick={fetchMeals} className="font-label text-sm text-primary hover:underline">Retry</button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {meals.map((meal, idx) => {
                    const style  = CAT[meal.category] || CAT['Avg Meal'];
                    const grad   = CARD_GRADS[idx % CARD_GRADS.length];
                    const ytUrl  = `https://www.youtube.com/results?search_query=${encodeURIComponent(meal.youtube_query || meal.name + ' recipe')}`;
                    const isVis  = visibleMeals.includes(idx);
                    const pctDay = Math.round((meal.calories / user.target_cal) * 100);
                    return (
                      <motion.div
                        key={meal.id || idx}
                        initial={{ opacity: 0, y: 20 }}
                        animate={isVis ? { opacity: 1, y: 0 } : {}}
                        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                        className="group"
                      >
                        {/* Portrait card */}
                        <div className={`relative aspect-[3/4] overflow-hidden rounded-xl mb-5 shadow-2xl bg-gradient-to-br ${grad} flex items-center justify-center`}>
                          <span className="text-[7rem] select-none transition-transform duration-700 group-hover:scale-110 leading-none">
                            {meal.emoji || '🍽️'}
                          </span>
                          <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/20 to-transparent" />
                          <div className="absolute inset-0 bg-gradient-to-b from-surface-container-lowest/30 to-transparent" />

                          {/* YouTube button */}
                          <a
                            href={ytUrl} target="_blank" rel="noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="absolute top-5 right-5 bg-surface-container-lowest/60 backdrop-blur-md p-2.5 rounded-full border border-white/10 text-on-surface flex items-center justify-center transition-all group-hover:scale-110 group-hover:bg-primary/80 group-hover:text-on-primary"
                          >
                            <PlayCircle size={18} />
                          </a>

                          {/* Voice button */}
                          <button
                            onClick={e => { e.stopPropagation(); speakText(meal.name, lang); }}
                            className="absolute top-5 left-5 bg-surface-container-lowest/60 backdrop-blur-md p-2.5 rounded-full border border-white/10 text-on-surface-variant flex items-center justify-center hover:text-primary transition-all"
                          >
                            <Volume2 size={16} />
                          </button>

                          {/* Tags */}
                          <div className="absolute bottom-5 left-5 right-5 flex gap-2 flex-wrap">
                            <span className={`text-[10px] font-label uppercase tracking-widest px-3 py-1 rounded-full backdrop-blur-sm border ${style.tag}`}>
                              {style.icon} {style.label}
                            </span>
                            {pctDay > 0 && (
                              <span className="bg-surface-container-lowest/50 text-on-surface-variant text-[10px] font-label uppercase tracking-widest px-3 py-1 rounded-full backdrop-blur-sm border border-outline-variant/20">
                                {pctDay}% daily
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Caption */}
                        <h3 className="font-headline text-2xl italic mb-1.5 group-hover:text-primary transition-colors leading-tight text-on-surface">
                          {meal.name}
                        </h3>
                        <p className="text-on-surface-variant font-label text-[10px] uppercase tracking-widest mb-4">
                          Provision {String(idx + 1).padStart(2, '0')} · {meal.category}
                        </p>
                        <div className="flex items-center gap-4 text-xs font-label text-on-surface-variant mb-4">
                          <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 bg-primary rounded-full inline-block" />{meal.calories} kcal</span>
                          <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 bg-tertiary rounded-full inline-block" />{meal.protein}g Protein</span>
                        </div>

                        {/* Log button */}
                        <button
                          onClick={() => logMeal(meal)}
                          className="w-full bg-surface-container border border-outline-variant/30 hover:border-primary/50 hover:bg-primary-container/20 text-on-surface py-3 rounded-xl font-label text-sm uppercase tracking-wider flex justify-center items-center gap-2 transition-all"
                        >
                          <CheckCircle size={15} className="text-primary" /> Log this meal
                        </button>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}

          {/* ═══════════════ TAB: JOURNAL (TRACKER) ═══════════════ */}
          {activeTab === 'tracker' && (
            <motion.div key="tracker" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="max-w-xl mx-auto">

              {/* Ring card */}
              <div className="bg-surface-container-low border border-outline-variant/20 rounded-3xl p-8 mb-6 shadow-xl">
                <h2 className="font-headline text-3xl italic mb-8 text-center text-on-surface">Metabolic Journal</h2>

                <div className="relative w-56 h-56 mx-auto mb-8">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 144 144">
                    <circle cx="72" cy="72" r={R} fill="none" stroke="#282a28" strokeWidth="7" />
                    <circle
                      cx="72" cy="72" r={R} fill="none" stroke="#95d3ba" strokeWidth="7"
                      strokeLinecap="round"
                      strokeDasharray={circ}
                      strokeDashoffset={circ - (circ * calPct) / 100}
                      className="transition-all duration-1000 ease-out"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="font-label text-5xl font-bold text-primary">{trackerStats.total_cal}</span>
                    <span className="font-label text-[10px] text-on-surface-variant uppercase tracking-widest mt-1">
                      / {user.target_cal} kcal
                    </span>
                  </div>
                </div>

                <div className="flex justify-around border-t border-outline-variant/10 pt-6">
                  <div className="text-center">
                    <p className="text-tertiary text-2xl font-bold font-label">{trackerStats.total_pro}g</p>
                    <p className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest">Protein</p>
                  </div>
                  <div className="text-center">
                    <p className={`text-2xl font-bold font-label ${user.target_cal - trackerStats.total_cal < 0 ? 'text-error' : 'text-on-surface'}`}>
                      {Math.max(user.target_cal - trackerStats.total_cal, 0)}
                    </p>
                    <p className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest">Remaining</p>
                  </div>
                </div>
              </div>

              {/* Log list */}
              <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-4 px-1">
                Today's log
              </p>
              <div className="space-y-2">
                {trackerStats.eaten_meals?.length === 0 && (
                  <p className="font-label text-sm text-on-surface-variant px-1">No meals logged yet. Head to Provisions and tap "Log this meal".</p>
                )}
                <AnimatePresence>
                  {trackerStats.eaten_meals?.map((entry, i) => (
                    <motion.div
                      key={entry.id || i}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      className="flex justify-between items-center bg-surface-container p-4 rounded-2xl border border-outline-variant/10"
                    >
                      <div>
                        <p className="font-label font-bold text-on-surface text-sm">{entry.name}</p>
                        <p className="font-label text-[10px] text-primary uppercase tracking-wider">{entry.calories} kcal</p>
                      </div>
                      <button
                        onClick={() => undoLog(entry.name)}
                        className="text-error/60 hover:text-error bg-error/10 hover:bg-error/20 p-2.5 rounded-xl transition-all"
                        title="Remove from log"
                      >
                        <Trash2 size={15} />
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </motion.div>
          )}

          {/* ═══════════════ TAB: PANTRY CHEF ═══════════════ */}
          {activeTab === 'pantry' && (
            <motion.div key="pantry" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="max-w-xl mx-auto">

              <div className="bg-surface-container-low p-8 rounded-3xl border border-outline-variant/20 shadow-xl">
                <div className="flex items-center gap-4 mb-8">
                  <div className="p-4 bg-tertiary/10 text-tertiary rounded-2xl border border-tertiary/20">
                    <ChefHat size={28} />
                  </div>
                  <div>
                    <h2 className="font-headline text-3xl italic text-on-surface">Pantry Chef</h2>
                    <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant mt-1">
                      Describe what's in your fridge
                    </p>
                  </div>
                </div>

                <div className="relative mb-4">
                  <textarea
                    value={pantryInput}
                    onChange={e => setPantryInput(e.target.value)}
                    placeholder="e.g. I have 2 eggs, leftover rice, an onion and some spinach…"
                    rows={3}
                    className="w-full bg-surface-container p-5 pr-14 rounded-2xl text-on-surface outline-none focus:border-tertiary/50 border border-outline-variant/30 font-label placeholder:text-on-surface-variant/30 leading-relaxed"
                  />
                  <button
                    onClick={handleListenPantry}
                    className={`absolute right-4 top-4 p-2.5 rounded-full transition-all ${
                      isListeningPantry
                        ? 'mic-active'
                        : 'bg-surface-container-high text-on-surface-variant hover:text-tertiary'
                    }`}
                  >
                    {isListeningPantry ? <MicOff size={17} /> : <Mic size={17} />}
                  </button>
                </div>

                <button
                  onClick={cookFromPantry}
                  disabled={loadingPantry || !pantryInput.trim()}
                  className="w-full bg-tertiary text-on-tertiary font-label uppercase tracking-widest text-sm font-bold py-4 rounded-xl flex justify-center items-center gap-2 disabled:opacity-50 hover:bg-tertiary-fixed transition-colors"
                >
                  {loadingPantry ? <><Loader2 size={17} className="animate-spin" /> Cooking up ideas…</> : 'Generate Recipe'}
                </button>

                {pantryResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-8 bg-surface-container-highest p-6 rounded-2xl border border-tertiary/20"
                  >
                    <span className="text-5xl drop-shadow-lg">{pantryResult.emoji}</span>
                    <h3 className="font-headline text-2xl italic text-tertiary mt-4 mb-2">{pantryResult.name}</h3>
                    <p className="font-label text-sm text-on-surface-variant mb-5 leading-relaxed">{pantryResult.instructions}</p>
                    <div className="flex gap-3 flex-wrap">
                      <span className="font-label text-[10px] uppercase tracking-wider text-primary flex items-center gap-1.5 bg-surface px-3 py-2 rounded-xl border border-outline-variant/10">
                        <Flame size={12} /> {pantryResult.calories} kcal
                      </span>
                      <span className="font-label text-[10px] uppercase tracking-wider text-tertiary flex items-center gap-1.5 bg-surface px-3 py-2 rounded-xl border border-outline-variant/10">
                        <Beef size={12} /> {pantryResult.protein}g protein
                      </span>
                    </div>
                    {pantryResult.missing_basics && (
                      <p className="font-label text-[10px] text-on-surface-variant mt-4 uppercase tracking-widest">
                        You may need: {pantryResult.missing_basics}
                      </p>
                    )}
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}

          {/* ═══════════════ TAB: CLINICAL LAB ═══════════════ */}
          {activeTab === 'medical' && (
            <motion.div key="medical" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="max-w-xl mx-auto">

              <div className="bg-surface-container-low p-8 rounded-3xl border border-error/20 shadow-xl relative overflow-hidden">
                {/* Red top stripe */}
                <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-error/40 via-error to-error/40" />

                <h2 className="font-headline text-3xl italic text-error mb-2">Clinical Lab</h2>
                <p className="font-label text-xs text-on-surface-variant mb-8 leading-relaxed">
                  Upload a Lipid Profile or Blood Report. Gemini Vision will extract metabolic markers and{' '}
                  <span className="text-on-surface font-semibold">rewrite your entire diet plan</span> around them.
                </p>

                {/* Drop zone */}
                <div className="relative border-2 border-dashed border-error/25 rounded-2xl text-center hover:bg-surface-container transition-colors mb-6 overflow-hidden group cursor-pointer">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleFileChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                  />

                  {previewUrl ? (
                    <div className="relative h-52 w-full">
                      <img src={previewUrl} alt="Report preview" className="w-full h-full object-cover" />

                      {/* Scanning laser line */}
                      {loadingReport && (
                        <div
                          className="absolute left-0 w-full h-0.5 bg-error shadow-[0_0_12px_#ffb4ab] z-30"
                          style={{ animation: 'scanLine 1.8s linear infinite' }}
                        />
                      )}

                      {/* Dim overlay */}
                      <div className="absolute inset-0 bg-surface/50 flex items-center justify-center z-10">
                        {loadingReport ? (
                          <div className="text-center">
                            <Loader2 size={32} className="animate-spin text-error mx-auto mb-2" />
                            <p className="font-label text-xs text-error uppercase tracking-widest">Extracting clinical data…</p>
                          </div>
                        ) : (
                          <span className="font-label text-xs font-bold text-on-surface bg-surface-container-highest/90 px-4 py-2 rounded-lg backdrop-blur-md">
                            Tap to change image
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="py-12">
                      <FileText size={40} className="mx-auto text-error/50 mb-4 group-hover:scale-110 transition-transform" />
                      <p className="font-label font-bold text-on-surface text-sm">Tap to upload report (JPG / PNG)</p>
                      <p className="font-label text-[10px] text-on-surface-variant mt-2 uppercase tracking-widest">Max 5 MB</p>
                    </div>
                  )}
                </div>

                {/* Scanning keyframe */}
                <style>{`
                  @keyframes scanLine {
                    0%   { top: 0%; }
                    50%  { top: calc(100% - 2px); }
                    100% { top: 0%; }
                  }
                `}</style>

                <button
                  onClick={uploadReport}
                  disabled={loadingReport || !reportFile}
                  className="w-full bg-error text-on-error font-label uppercase tracking-widest text-sm font-bold py-4 rounded-xl flex justify-center items-center gap-2 disabled:opacity-50 hover:bg-error-container hover:text-on-error-container transition-colors mb-2"
                >
                  {loadingReport ? (
                    <><Loader2 size={17} className="animate-spin" /> Extracting clinical data…</>
                  ) : 'Scan & Adapt Diet'}
                </button>

                {/* Previous scan results */}
                {user.clinical_data?.markers && Object.keys(user.clinical_data.markers).length > 0 && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="mt-8 pt-8 border-t border-outline-variant/20"
                  >
                    <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-4 flex items-center gap-2">
                      <Activity size={13} className="text-primary" /> Latest Lab Results
                    </p>

                    <div className="grid grid-cols-2 gap-3 mb-6">
                      {Object.entries(user.clinical_data.markers).map(([key, data]) => {
                        if (!data?.value) return null;
                        const isBad = data.status && data.status.toLowerCase() !== 'normal';
                        return (
                          <div key={key} className={`p-4 rounded-xl border ${isBad ? 'bg-error/10 border-error/30' : 'bg-primary/10 border-primary/20'}`}>
                            <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant font-bold truncate mb-1">
                              {key.replace(/_/g, ' ')}
                            </p>
                            <p className={`font-headline text-2xl italic ${isBad ? 'text-error' : 'text-primary'}`}>
                              {data.value} <span className="text-[10px] font-sans not-italic text-on-surface-variant">{data.unit}</span>
                            </p>
                            <p className={`font-label text-[10px] uppercase tracking-wider font-bold mt-1 ${isBad ? 'text-error' : 'text-primary'}`}>
                              {data.status}
                            </p>
                          </div>
                        );
                      })}
                    </div>

                    {user.clinical_data.clinical_directive && (
                      <div className="bg-error/10 p-5 rounded-2xl border border-error/20">
                        <p className="font-label text-[10px] text-error uppercase tracking-widest font-bold mb-2 flex items-center gap-1.5">
                          <Activity size={11} /> AI Diet Directive
                        </p>
                        <p className="font-label text-sm text-on-surface leading-relaxed">
                          {user.clinical_data.clinical_directive}
                        </p>
                      </div>
                    )}
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* ══════════ BOTTOM NAV (mobile) ══════════ */}
      <footer className="fixed bottom-0 left-0 w-full flex justify-around items-center px-4 pb-6 pt-3 bg-surface-container-lowest/85 backdrop-blur-lg rounded-t-3xl z-50 shadow-[0_-10px_40px_rgba(0,0,0,0.6)] md:hidden">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex flex-col items-center p-2 rounded-xl transition-all ${
              activeTab === t.id ? 'text-primary' : 'text-on-surface-variant'
            }`}
          >
            <span className="text-xl">{t.icon}</span>
            <span className="font-label uppercase tracking-widest text-[9px] mt-1">{t.label}</span>
          </button>
        ))}
      </footer>

      {/* ══════════ FAB (desktop) ══════════ */}
      <button
        onClick={fetchMeals}
        disabled={loadingMeals}
        title="Regenerate provisions"
        className="fixed bottom-10 right-10 hidden md:flex items-center justify-center w-16 h-16 bg-gradient-to-tr from-tertiary to-tertiary-container rounded-full text-on-tertiary shadow-2xl shadow-black/40 hover:scale-110 transition-transform z-50 disabled:opacity-50"
      >
        <RefreshCw size={24} className={loadingMeals ? 'animate-spin' : ''} />
      </button>
    </div>
  );
}
