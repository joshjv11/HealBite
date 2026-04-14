import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import axios from 'axios';
import {
  Volume2, PlayCircle, Search, Loader2, RefreshCw,
  Activity, CheckCircle, Trash2, Mic, MicOff, FileText,
  ChefHat, Flame, Beef, ShieldCheck, HeartPulse, ChevronRight,
  Upload, TrendingUp, TrendingDown, Minus, Bot, Clipboard,
} from 'lucide-react';
import { speakText } from './utils';
import toast, { Toaster } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';

const TOAST_STYLE = {
  style: {
    background: '#1e201e', color: '#e2e3df',
    borderRadius: '12px', fontWeight: 600, fontSize: '14px',
    border: '1px solid #404944',
  },
};

const API = 'http://127.0.0.1:8000';

function bmiRing(bmi) {
  if (bmi < 18.5) return { label: 'Underweight', cls: 'text-primary',  pct: 30 };
  if (bmi < 25)   return { label: 'Healthy',     cls: 'text-primary',  pct: 75 };
  if (bmi < 30)   return { label: 'Overweight',  cls: 'text-tertiary', pct: 48 };
                  return { label: 'Obese',        cls: 'text-error',    pct: 22 };
}

const CAT = {
  'Small Meal':   { label: 'Light', icon: '🌅', tag: 'bg-primary/20 text-primary border-primary/20' },
  'Avg Meal':     { label: 'Main',  icon: '☀️', tag: 'bg-surface-container-highest text-on-surface border-outline-variant/20' },
  'Tiny/Craving': { label: 'Snack', icon: '🌙', tag: 'bg-tertiary/20 text-tertiary border-tertiary/20' },
};

const CARD_GRADS = [
  'from-primary-container/80 to-surface-container-lowest',
  'from-tertiary-container/60 to-surface-container-lowest',
  'from-surface-container-high to-surface-container-lowest',
  'from-primary-container/50 to-surface-container-low',
  'from-tertiary-container/40 to-surface-container-lowest',
  'from-surface-container-highest to-surface-container-lowest',
];

const TABS = [
  { id: 'medical', label: 'Command Center', icon: '🛡️' },
  { id: 'plan',    label: 'Weekly Plan',    icon: '🍲' },
  { id: 'tracker', label: 'Journal',        icon: '📊' },
  { id: 'pantry',  label: 'Pantry',         icon: '🧊' },
];

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
  const [user, setUser]           = useState(initialUser);
  const [activeTab, setActiveTab] = useState('medical');

  // Stateful weekly plan
  const [weeklyPlan, setWeeklyPlan]     = useState(null);
  const [loadingMeals, setLoadingMeals] = useState(true);
  const [selectedDay, setSelectedDay]   = useState(
    new Date().toLocaleString('en-us', { weekday: 'long' })
  );

  // Craving / suggest (Pantry-adjacent quick search)
  const [craving, setCraving]         = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [suggestSrc, setSuggestSrc]   = useState('');
  const [searching, setSearching]     = useState(false);

  // Tracker
  const [trackerStats, setTrackerStats] = useState({ total_cal: 0, total_pro: 0, eaten_meals: [] });

  // Pantry
  const [pantryInput, setPantryInput]     = useState('');
  const [pantryResult, setPantryResult]   = useState(null);
  const [loadingPantry, setLoadingPantry] = useState(false);
  const [loggingPantry, setLoggingPantry] = useState(false);
  const [isListeningPantry, setIsListeningPantry] = useState(false);
  const pantryRecRef = useRef(null);

  // Medical Vault
  const [reportFile, setReportFile]         = useState(null);
  const [previewUrl, setPreviewUrl]         = useState(null);
  const [loadingReport, setLoadingReport]   = useState(false);
  const [medicalHistory, setMedicalHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [selectedMetric, setSelectedMetric] = useState('Health Score');
  const fileInputRef = useRef(null);

  // Doctor's Briefing
  const [briefing, setBriefing]             = useState('');
  const [loadingBriefing, setLoadingBriefing] = useState(false);

  // Support both old ('Hindi'/'English') and new BCP-47 ('hi-IN'/'en-IN') stored values
  const LEGACY_LANG_MAP = { 'Hindi': 'hi-IN', 'English': 'en-IN' };
  const lang = user.language?.includes('-')
    ? user.language
    : LEGACY_LANG_MAP[user.language] || 'en-IN';

  const ring = bmiRing(user.bmi);
  const R    = 58;
  const circ = 2 * Math.PI * R;

  const today = new Date().toLocaleDateString(lang, {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  // ── Auto-greeting (Audio-first for low-literacy users) ──
  useEffect(() => {
    const GREETINGS = {
      'hi-IN': `नमस्ते ${user.name.split(' ')[0]}, आपका स्वागत है।`,
      'mr-IN': `नमस्कार ${user.name.split(' ')[0]}, तुमचे स्वागत आहे।`,
      'ta-IN': `வணக்கம் ${user.name.split(' ')[0]}`,
      'bn-IN': `নমস্কার ${user.name.split(' ')[0]}`,
      'gu-IN': `નમસ્તે ${user.name.split(' ')[0]}`,
      'en-IN': `Welcome back, ${user.name.split(' ')[0]}`,
    };
    const text = GREETINGS[lang] || GREETINGS['en-IN'];
    const timer = setTimeout(() => speakText(text, lang), 1500);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Data fetching ──
  const fetchPlan = useCallback(async (forceRefresh = false) => {
    setLoadingMeals(true);
    try {
      const res = await axios.get(`${API}/api/meals/${user.id}`, {
        params: { force_refresh: forceRefresh },
      });
      setWeeklyPlan(res.data.plan?.plan_data || null);
      if (res.data.user) setUser(res.data.user);
      if (forceRefresh) toast.success('New 7-day plan generated!', { duration: 4000, ...TOAST_STYLE });
    } catch {
      toast.error('Failed to load meal plan.', TOAST_STYLE);
    } finally {
      setLoadingMeals(false);
    }
  }, [user.id]);

  const fetchLogs = useCallback(() => {
    axios.get(`${API}/api/today-log/${user.id}`)
      .then(res => setTrackerStats(res.data))
      .catch(console.error);
  }, [user.id]);

  const fetchMedicalHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await axios.get(`${API}/api/medical-history/${user.id}`);
      setMedicalHistory(res.data.reports || []);
    } catch {
      toast.error('Could not fetch medical vault.', TOAST_STYLE);
    } finally {
      setLoadingHistory(false);
    }
  }, [user.id]);

  useEffect(() => { fetchPlan(); fetchLogs(); fetchMedicalHistory(); }, [fetchPlan, fetchLogs, fetchMedicalHistory]);

  // ── Actions ──
  const logMeal = async (meal) => {
    try {
      const res = await axios.post(`${API}/api/log-meal/`, {
        user_id: user.id, meal_name: meal.name,
        calories: meal.calories, protein: meal.protein,
      });
      setTrackerStats(res.data);
      toast.success(`Logged: ${meal.name}`, TOAST_STYLE);
      return true;
    } catch {
      toast.error('Failed to log meal.', TOAST_STYLE);
      return false;
    }
  };

  const undoLog = async (mealName) => {
    try {
      const res = await axios.delete(`${API}/api/log-meal/${user.id}/${encodeURIComponent(mealName)}`);
      setTrackerStats(res.data);
      toast('Removed from log.', { icon: '🗑️', ...TOAST_STYLE });
    } catch { toast.error('Failed to remove log.', TOAST_STYLE); }
  };

  const findSuggestions = async () => {
    if (!craving.trim()) return;
    setSearching(true);
    setSuggestions([]);
    setSuggestSrc('');
    try {
      const res = await axios.post(`${API}/api/suggest/`, { prompt: craving, allergies: user.allergies || [], language: lang });
      setSuggestions(res.data.suggestions || []);
      setSuggestSrc(res.data.source || '');
    } catch { toast.error("Couldn't get suggestions.", TOAST_STYLE); }
    finally { setSearching(false); }
  };


  const cookFromPantry = async () => {
    if (!pantryInput.trim()) return toast.error('Enter some ingredients.', TOAST_STYLE);
    setLoadingPantry(true);
    setPantryResult(null);
    try {
      const res = await axios.post(`${API}/api/pantry/`, {
        ingredients: pantryInput, allergies: user.allergies || [], target_cal: user.target_cal, language: lang,
      });
      setPantryResult(res.data);
      if (res.data.source === 'fallback') {
        toast('AI offline — showing our best offline recipe match.', { icon: '📖', ...TOAST_STYLE });
      }
      speakText(`Recipe ready: ${res.data.name}`, lang);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Pantry chef failed.', TOAST_STYLE);
    }
    setLoadingPantry(false);
  };

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
    rec.lang    = lang;
    rec.onstart  = () => setIsListeningPantry(true);
    rec.onresult = e => setPantryInput(e.results[0][0].transcript);
    rec.onerror  = () => setIsListeningPantry(false);
    rec.onend    = () => setIsListeningPantry(false);
    rec.start();
  };

  // Revoke previous object URL whenever previewUrl changes to avoid memory leaks
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return toast.error('File is too large. Max 10MB.', TOAST_STYLE);
    setReportFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const uploadReport = async () => {
    if (!reportFile) return toast.error('Select an image first.', TOAST_STYLE);
    setLoadingReport(true);
    const fd = new FormData();
    fd.append('file', reportFile);
    fd.append('user_id', user.id);
    try {
      const res = await axios.post(`${API}/api/scan-report/`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Clinical profile updated! Regenerating your meal plan…', { duration: 5000, ...TOAST_STYLE });
      if (res.data.user) setUser(res.data.user);
      setReportFile(null);
      setPreviewUrl(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      // Sequential — guarantee history is in state before the plan generation reads the new directive
      await fetchMedicalHistory();
      await fetchPlan(true);
    } catch (err) {
      const detail = err.response?.data?.detail || 'Failed to scan report.';
      const isQuota = err.response?.status === 503 || detail.includes('quota');
      if (isQuota) {
        toast.error('⚠ Gemini API quota is 0. Get a valid key from aistudio.google.com/apikey', { duration: 8000, ...TOAST_STYLE });
      } else {
        toast.error(detail, TOAST_STYLE);
      }
    } finally {
      setLoadingReport(false);
    }
  };

  const generateBriefing = async () => {
    setLoadingBriefing(true);
    try {
      const res = await axios.get(`${API}/api/doctor-briefing/${user.id}`);
      setBriefing(res.data.briefing_markdown || '');
      toast.success('Clinical summary generated.', TOAST_STYLE);
    } catch {
      toast.error('Failed to generate briefing.', TOAST_STYLE);
    } finally {
      setLoadingBriefing(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() =>
      toast.success('Copied to clipboard!', TOAST_STYLE)
    );
  };

  // ── Chart data derived from medical history ──
  // All unique metric names across every report in the vault
  const availableMetrics = useMemo(() => {
    const nameSet = new Set(['Health Score']);
    medicalHistory.forEach(report => {
      const markers = [
        ...(report.extracted_data?.latest_markers || []),
        ...(report.data?.abnormal_markers || []),
        ...(report.data?.normal_markers   || []),
      ];
      markers.forEach(m => { if (m.name) nameSet.add(m.name); });
    });
    return Array.from(nameSet);
  }, [medicalHistory]);

  // Chart data filtered to the currently selected metric
  const chartData = useMemo(() => {
    if (medicalHistory.length === 0) return [];
    return [...medicalHistory].reverse().map(report => {
      const allMarkers = [
        ...(report.extracted_data?.latest_markers || []),
        ...(report.data?.abnormal_markers || []),
        ...(report.data?.normal_markers   || []),
      ];
      let value = null;
      if (selectedMetric === 'Health Score') {
        value = report.extracted_data?.overall_health_score
          ?? report.data?.overall_health_score
          ?? null;
      } else {
        const found = allMarkers.find(m => m.name === selectedMetric);
        if (found?.value != null) {
          // Handles compound values like "140/90" — plots the leading number (systolic, etc.)
          const parsed = parseFloat(String(found.value).split('/')[0]);
          value = isNaN(parsed) ? null : parsed;
        }
      }
      return { date: report.upload_date.split(',')[0], value };
    });
  }, [medicalHistory, selectedMetric]);

  const calPct       = Math.min((trackerStats.total_cal / user.target_cal) * 100, 100);
  const latestReport = medicalHistory[0];
  const hasDirective = user.clinical_profile?.master_directive
    || user.master_clinical_directive
    || latestReport?.data?.clinical_directive
    || user.clinical_data?.clinical_directive;

  return (
    <div className="bg-background text-on-surface font-body min-h-screen">
      <Toaster position="top-center" toastOptions={TOAST_STYLE} />

      {/* ══════════ TOP NAV ══════════ */}
      <nav className="fixed top-0 w-full z-50 bg-surface-container-lowest/70 backdrop-blur-xl border-b border-outline-variant/10 flex justify-between items-center px-6 py-4">
        <div className="flex items-center gap-8">
          <span className="font-headline text-2xl italic text-on-surface tracking-tight">HealBite</span>
          <div className="hidden md:flex gap-6">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className={`font-label text-sm transition-colors ${activeTab === t.id ? 'text-primary font-semibold' : 'text-on-surface-variant hover:text-on-surface'}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {hasDirective && (
            <div className="hidden md:flex items-center gap-1.5 bg-primary/10 border border-primary/30 text-primary px-3 py-1.5 rounded-full text-[10px] font-label font-bold uppercase tracking-widest">
              <ShieldCheck size={13} /> Clinical Guard Active
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
            className="mt-4 inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2.5 rounded-xl text-xs font-label font-bold border border-primary/30 shadow-lg shadow-primary/5"
          >
            <ShieldCheck size={14} /> Clinical guard active — AI meals are clinically adapted.
          </motion.div>
        )}
      </header>

      {/* ══════════ TABS ══════════ */}
      <div className="flex gap-2 px-6 mb-8 max-w-5xl mx-auto overflow-x-auto pb-1 no-scrollbar">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-label text-sm uppercase tracking-widest whitespace-nowrap transition-all border flex-shrink-0 ${
              activeTab === t.id
                ? 'bg-primary-container border-primary/40 text-primary'
                : 'bg-surface-container border-outline-variant/20 text-on-surface-variant hover:bg-surface-container-high'
            }`}>
            <span className="text-base">{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      <main className="px-6 max-w-5xl mx-auto pb-32">
        <AnimatePresence mode="wait">

          {/* ═══════════════ TAB: WEEKLY PLAN ═══════════════ */}
          {activeTab === 'plan' && (
            <motion.div key="plan" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>

              {/* Header row */}
              <div className="flex justify-between items-center mb-6 border-b border-outline-variant/10 pb-4">
                <div>
                  <h2 className="font-headline text-3xl italic text-on-surface">Your 7-Day Clinical Plan</h2>
                  <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant mt-1">
                    Plan is fixed for 7 days · refreshes automatically after expiry
                  </p>
                </div>
                <button
                  onClick={() => {
                    if (window.confirm('Generate a completely new 7-day plan? Your current plan will be replaced.')) {
                      fetchPlan(true);
                    }
                  }}
                  disabled={loadingMeals}
                  className="text-primary hover:text-primary-fixed transition-colors flex items-center gap-1.5 font-label text-xs uppercase tracking-widest flex-shrink-0">
                  <RefreshCw size={14} className={loadingMeals ? 'animate-spin' : ''} /> New Plan
                </button>
              </div>

              {loadingMeals ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {[...Array(3)].map((_, i) => <MealSkeleton key={i} />)}
                </div>
              ) : !weeklyPlan?.days ? (
                <div className="text-center py-20 border border-outline-variant/10 rounded-2xl bg-surface-container-low">
                  <p className="font-headline text-2xl italic text-on-surface-variant mb-2">No plan found.</p>
                  <p className="font-label text-xs text-on-surface-variant/40 mb-6">Check backend connection.</p>
                  <button onClick={() => fetchPlan(true)} className="font-label text-sm text-primary hover:underline">Generate Plan</button>
                </div>
              ) : (
                <>
                  {/* Day selector strip */}
                  <div className="flex gap-2 mb-8 overflow-x-auto no-scrollbar pb-1">
                    {weeklyPlan.days.map(dayObj => (
                      <button
                        key={dayObj.day}
                        onClick={() => setSelectedDay(dayObj.day)}
                        className={`py-2.5 px-5 rounded-full font-label text-xs uppercase tracking-widest border flex-shrink-0 transition-all ${
                          selectedDay === dayObj.day
                            ? 'bg-primary-container text-primary border-primary/30 shadow-md'
                            : 'bg-surface-container text-on-surface-variant border-outline-variant/10 hover:border-primary/20'
                        }`}>
                        {dayObj.day.slice(0, 3)}
                      </button>
                    ))}
                  </div>

                  {/* Meal cards for selected day */}
                  {(() => {
                    const dayMeals = weeklyPlan.days.find(d => d.day === selectedDay)?.meals || [];
                    return (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {dayMeals.map((meal, idx) => {
                          const style  = CAT[meal.category] || CAT['Avg Meal'];
                          const grad   = CARD_GRADS[idx % CARD_GRADS.length];
                          const ytUrl  = `https://www.youtube.com/results?search_query=${encodeURIComponent(meal.youtube_query || meal.name + ' recipe')}`;
                          const pctDay = Math.round((meal.calories / user.target_cal) * 100);
                          return (
                            <motion.div key={`${selectedDay}-${idx}`}
                              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.4, delay: idx * 0.08, ease: [0.16, 1, 0.3, 1] }}
                              className="group">
                              <div className={`relative aspect-[3/4] overflow-hidden rounded-xl mb-5 shadow-2xl bg-gradient-to-br ${grad} flex items-center justify-center`}>
                                <span className="text-[7rem] select-none transition-transform duration-700 group-hover:scale-110 leading-none">{meal.emoji || '🍽️'}</span>
                                <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/20 to-transparent" />
                                <div className="absolute inset-0 bg-gradient-to-b from-surface-container-lowest/30 to-transparent" />
                                <a href={ytUrl} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                                  className="absolute top-5 right-5 bg-surface-container-lowest/60 backdrop-blur-md p-2.5 rounded-full border border-white/10 text-on-surface flex items-center justify-center transition-all group-hover:scale-110 group-hover:bg-primary/80 group-hover:text-on-primary">
                                  <PlayCircle size={18} />
                                </a>
                                <button onClick={e => { e.stopPropagation(); speakText(meal.name, lang); }}
                                  className="absolute top-5 left-5 bg-surface-container-lowest/60 backdrop-blur-md p-2.5 rounded-full border border-white/10 text-on-surface-variant flex items-center justify-center hover:text-primary transition-all">
                                  <Volume2 size={16} />
                                </button>
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

                              <h3 className="font-headline text-2xl italic mb-1.5 group-hover:text-primary transition-colors leading-tight text-on-surface">{meal.name}</h3>
                              <p className="text-on-surface-variant font-label text-[10px] uppercase tracking-widest mb-3">
                                {selectedDay} · {meal.category}
                              </p>

                              {/* Clinical reasoning block */}
                              {meal.clinical_reasoning ? (
                                <div className="mb-4 rounded-xl bg-primary/5 border border-primary/15 overflow-hidden">
                                  {meal.clinical_problem && (
                                    <div className="flex items-center gap-1.5 px-3 py-2 bg-primary/10 border-b border-primary/15">
                                      <ShieldCheck size={11} className="text-primary flex-shrink-0" />
                                      <p className="font-label text-[10px] font-bold uppercase tracking-widest text-primary truncate">
                                        {meal.clinical_problem}
                                      </p>
                                    </div>
                                  )}
                                  <div className="flex gap-2 items-start px-3 py-2.5">
                                    {!meal.clinical_problem && <ShieldCheck size={12} className="text-primary flex-shrink-0 mt-0.5" />}
                                    <p className="font-label text-[11px] text-primary/90 leading-relaxed">{meal.clinical_reasoning}</p>
                                  </div>
                                </div>
                              ) : meal.reasoning ? (
                                <p className="font-label text-[11px] text-on-surface-variant leading-relaxed mb-4 opacity-75">{meal.reasoning}</p>
                              ) : null}

                              <div className="flex items-center gap-4 text-xs font-label text-on-surface-variant mb-4">
                                <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 bg-primary rounded-full inline-block" />{meal.calories} kcal</span>
                                <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 bg-tertiary rounded-full inline-block" />{meal.protein}g Protein</span>
                              </div>
                              <div className="flex flex-col gap-2">
                                {/* Prominent Listen button for low-literacy / regional language users */}
                                <button onClick={e => { e.stopPropagation(); speakText(meal.name, lang); }}
                                  className="w-full bg-tertiary/10 hover:bg-tertiary/20 text-tertiary border border-tertiary/30 py-3.5 rounded-xl font-label font-bold text-sm uppercase tracking-widest flex justify-center items-center gap-2.5 transition-all">
                                  <Volume2 size={18} /> सुनिए · Listen
                                </button>
                                <button onClick={() => logMeal(meal)}
                                  className="w-full bg-surface-container border border-outline-variant/30 hover:border-primary/50 hover:bg-primary-container/20 text-on-surface py-3 rounded-xl font-label text-sm uppercase tracking-wider flex justify-center items-center gap-2 transition-all">
                                  <CheckCircle size={15} className="text-primary" /> Log this meal
                                </button>
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </>
              )}
            </motion.div>
          )}

          {/* ═══════════════ TAB: JOURNAL (TRACKER) ═══════════════ */}
          {activeTab === 'tracker' && (
            <motion.div key="tracker" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="max-w-xl mx-auto">

              <div className="bg-surface-container-low border border-outline-variant/20 rounded-3xl p-8 mb-6 shadow-xl">
                <h2 className="font-headline text-3xl italic mb-8 text-center text-on-surface">Metabolic Journal</h2>

                <div className="relative w-56 h-56 mx-auto mb-8">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 144 144">
                    <circle cx="72" cy="72" r={R} fill="none" stroke="#282a28" strokeWidth="7" />
                    <circle cx="72" cy="72" r={R} fill="none" stroke="#95d3ba" strokeWidth="7"
                      strokeLinecap="round" strokeDasharray={circ}
                      strokeDashoffset={circ - (circ * calPct) / 100}
                      className="transition-all duration-1000 ease-out" />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="font-label text-5xl font-bold text-primary">{trackerStats.total_cal}</span>
                    <span className="font-label text-[10px] text-on-surface-variant uppercase tracking-widest mt-1">/ {user.target_cal} kcal</span>
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

              <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-4 px-1">Today's log</p>
              <div className="space-y-2">
                {trackerStats.eaten_meals?.length === 0 && (
                  <p className="font-label text-sm text-on-surface-variant px-1">No meals logged yet. Head to Weekly Plan and tap "Log this meal".</p>
                )}
                <AnimatePresence>
                  {trackerStats.eaten_meals?.map((entry, i) => (
                    <motion.div key={entry.id || i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}
                      className="flex justify-between items-center bg-surface-container p-4 rounded-2xl border border-outline-variant/10">
                      <div>
                        <p className="font-label font-bold text-on-surface text-sm">{entry.name}</p>
                        <p className="font-label text-[10px] text-primary uppercase tracking-wider">{entry.calories} kcal</p>
                      </div>
                      <button onClick={() => undoLog(entry.name)}
                        className="text-error/60 hover:text-error bg-error/10 hover:bg-error/20 p-2.5 rounded-xl transition-all">
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
                    <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant mt-1">Describe what's in your fridge</p>
                  </div>
                </div>

                <div className="relative mb-4">
                  <textarea value={pantryInput} onChange={e => setPantryInput(e.target.value)}
                    placeholder="e.g. I have 2 eggs, leftover rice, an onion and some spinach…" rows={3}
                    className="w-full bg-surface-container p-5 pr-14 rounded-2xl text-on-surface outline-none focus:border-tertiary/50 border border-outline-variant/30 font-label placeholder:text-on-surface-variant/30 leading-relaxed" />
                  <button onClick={handleListenPantry}
                    className={`absolute right-4 top-4 p-2.5 rounded-full transition-all ${
                      isListeningPantry ? 'mic-active' : 'bg-surface-container-high text-on-surface-variant hover:text-tertiary'
                    }`}>
                    {isListeningPantry ? <MicOff size={17} /> : <Mic size={17} />}
                  </button>
                </div>

                <button onClick={cookFromPantry} disabled={loadingPantry || !pantryInput.trim()}
                  className="w-full bg-tertiary text-on-tertiary font-label uppercase tracking-widest text-sm font-bold py-4 rounded-xl flex justify-center items-center gap-2 disabled:opacity-50 hover:bg-tertiary-fixed transition-colors">
                  {loadingPantry ? <><Loader2 size={17} className="animate-spin" /> Cooking up ideas…</> : 'Generate Recipe'}
                </button>

                {pantryResult && (
                  <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                    className="mt-8 bg-surface-container-highest p-6 rounded-2xl border border-tertiary/20">
                    <div className="flex items-start justify-between">
                      <span className="text-5xl drop-shadow-lg">{pantryResult.emoji}</span>
                      {pantryResult.source === 'fallback' && (
                        <span className="font-label text-[10px] text-tertiary bg-tertiary/10 px-2.5 py-1 rounded-full border border-tertiary/20 uppercase tracking-widest">offline recipe</span>
                      )}
                    </div>
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
                    <button
                      disabled={loggingPantry}
                      onClick={async () => {
                        setLoggingPantry(true);
                        const ok = await logMeal({
                          name: pantryResult.name,
                          calories: pantryResult.calories,
                          protein: pantryResult.protein,
                        });
                        setLoggingPantry(false);
                        if (ok) setActiveTab('tracker');
                      }}
                      className="mt-5 w-full bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 py-3.5 rounded-xl font-label font-bold text-sm uppercase tracking-widest flex justify-center items-center gap-2.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                      {loggingPantry
                        ? <><Loader2 size={16} className="animate-spin" /> Logging…</>
                        : <><CheckCircle size={16} /> Log to Journal</>
                      }
                    </button>
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}

          {/* ═══════════════ TAB: CLINICAL COMMAND CENTER ═══════════════ */}
          {activeTab === 'medical' && (
            <motion.div key="medical" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="space-y-6">

              {/* 0. DOCTOR'S BRIEFING */}
              <div className="bg-surface-container-low p-6 rounded-3xl border border-tertiary/20 shadow-lg">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="flex-1">
                    <h3 className="font-headline text-2xl italic text-on-surface mb-1 flex items-center gap-2">
                      <Bot size={22} className="text-tertiary flex-shrink-0" /> Doctor's Briefing AI
                    </h3>
                    <p className="font-label text-xs text-on-surface-variant leading-relaxed">
                      Generate a concise, one-page clinical summary of your entire health profile to make your next doctor's visit more effective.
                    </p>
                  </div>
                  <button
                    onClick={generateBriefing}
                    disabled={loadingBriefing}
                    className="flex-shrink-0 bg-tertiary text-on-tertiary font-label uppercase tracking-widest text-xs font-bold py-3 px-5 rounded-xl flex items-center gap-2 disabled:opacity-50 hover:brightness-110 transition-all">
                    {loadingBriefing ? <><Loader2 size={14} className="animate-spin" /> Generating…</> : 'Generate Summary'}
                  </button>
                </div>

                {briefing && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    className="mt-5 bg-surface-container p-5 rounded-2xl border border-outline-variant/10">
                    <pre className="whitespace-pre-wrap font-sans text-xs text-on-surface-variant leading-relaxed">
                      {briefing}
                    </pre>
                    <button
                      onClick={() => copyToClipboard(briefing)}
                      className="mt-4 text-primary font-label text-[10px] uppercase tracking-widest flex items-center gap-1.5 hover:underline">
                      <Clipboard size={12} /> Copy to Clipboard
                    </button>
                  </motion.div>
                )}
              </div>

              {/* 1. HOLISTIC PATIENT BANNER */}
              <div className="bg-surface-container-low p-6 rounded-3xl border border-primary/20 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-5 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-primary rounded-l-3xl" />
                <div className="pl-2">
                  <h2 className="font-headline text-3xl italic text-on-surface mb-2">Patient Profile</h2>
                  <div className="flex flex-wrap gap-4 font-label text-sm text-on-surface-variant">
                    <span>Target: <strong className="text-primary">{user.target_cal} kcal</strong></span>
                    <span>Protein: <strong className="text-primary">{user.target_protein}g</strong></span>
                    {user.bmi && <span>BMI: <strong className="text-primary">{user.bmi}</strong></span>}
                    {user.allergies?.length > 0 && (
                      <span>Avoid: <strong className="text-error uppercase">{user.allergies.join(', ')}</strong></span>
                    )}
                  </div>
                </div>

                {/* Chronic Conditions Pills */}
                <div className="flex flex-wrap gap-2 justify-start md:justify-end">
                  {user.clinical_profile?.chronic_conditions?.length > 0
                    ? user.clinical_profile.chronic_conditions.map((cond, i) => (
                        <span key={i} className="bg-error/10 border border-error/30 text-error px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5">
                          <Activity size={12} /> {cond}
                        </span>
                      ))
                    : (
                      <span className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant/50 italic">
                        No chronic conditions on record
                      </span>
                    )
                  }
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                {/* ── LEFT COLUMN: Upload + Vital Biomarkers Grid ── */}
                <div className="lg:col-span-5 space-y-6">

                  {/* Compact Upload Zone */}
                  <div className="bg-surface-container p-5 rounded-3xl border-2 border-dashed border-primary/20 hover:border-primary/50 transition-colors relative group text-center">
                    <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp"
                      onChange={handleFileChange}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20" />
                    <Upload size={28} className="mx-auto text-primary/50 mb-2.5 group-hover:scale-110 group-hover:text-primary transition-all" />
                    <p className="font-label font-bold text-on-surface text-sm">
                      {reportFile ? reportFile.name : 'Upload New Lab Report'}
                    </p>
                    <p className="font-label text-[10px] text-on-surface-variant uppercase tracking-widest mt-1">
                      {reportFile ? 'File ready — click below to process' : 'JPG · PNG · WEBP · Max 10 MB'}
                    </p>

                    {reportFile && (
                      <button onClick={(e) => { e.stopPropagation(); uploadReport(); }}
                        disabled={loadingReport}
                        className="mt-4 w-full bg-primary text-on-primary font-label uppercase tracking-widest text-xs font-bold py-3 rounded-xl flex justify-center items-center gap-2 disabled:opacity-50 hover:brightness-110 transition-all z-30 relative">
                        {loadingReport
                          ? <><Loader2 size={15} className="animate-spin" /> Merging Profile…</>
                          : <><Activity size={15} /> Process &amp; Update Profile</>}
                      </button>
                    )}
                    <style>{`@keyframes scanLine { 0% { top: 0%; } 50% { top: calc(100% - 2px); } 100% { top: 0%; } }`}</style>
                  </div>

                  {/* Vital Biomarkers Bento Grid */}
                  {user.clinical_profile?.latest_markers?.length > 0 ? (
                    <div className="bg-surface-container-low p-6 rounded-3xl border border-outline-variant/10 shadow-lg">
                      <div className="flex justify-between items-center mb-5">
                        <h3 className="font-headline text-2xl italic text-on-surface">Vital Biomarkers</h3>
                        <span className="font-label text-[9px] uppercase tracking-widest text-on-surface-variant">Aggregated Profile</span>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        {user.clinical_profile.latest_markers.map((marker, i) => {
                          const status = marker.status?.toLowerCase() || '';
                          const isAbnormal = status === 'abnormal' || status === 'high' || status === 'low';
                          const TrendIcon = marker.trend === 'up' ? TrendingUp : marker.trend === 'down' ? TrendingDown : Minus;
                          const trendColor = isAbnormal
                            ? (marker.trend === 'down' && status === 'high') || (marker.trend === 'up' && status === 'low')
                              ? 'text-primary' : 'text-error'
                            : 'text-on-surface-variant';

                          return (
                            <div key={i} className={`p-4 rounded-2xl border transition-colors ${
                              isAbnormal
                                ? 'col-span-2 bg-error/5 border-error/25 hover:bg-error/8'
                                : 'bg-surface-container border-outline-variant/10 hover:border-primary/20'
                            }`}>
                              <div className="flex justify-between items-start mb-2">
                                <p className="font-label text-[9px] uppercase tracking-widest text-on-surface-variant font-bold truncate pr-2">{marker.name}</p>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  {marker.trend && <TrendIcon size={10} className={trendColor} />}
                                  <span className={`text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-md ${
                                    isAbnormal ? 'bg-error text-on-error' : 'bg-primary/15 text-primary'
                                  }`}>
                                    {marker.status || 'Normal'}
                                  </span>
                                </div>
                              </div>
                              <p className={`font-headline text-2xl italic leading-none ${isAbnormal ? 'text-error' : 'text-on-surface'}`}>
                                {marker.value}{' '}
                                <span className="text-[10px] font-sans not-italic text-on-surface-variant">{marker.unit}</span>
                              </p>
                              {isAbnormal && marker.description && (
                                <p className="mt-2.5 text-[10px] font-label text-error/80 leading-relaxed border-t border-error/10 pt-2">
                                  {marker.description}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    !loadingHistory && (
                      <div className="bg-surface-container-low p-8 rounded-3xl border border-outline-variant/10 text-center opacity-50">
                        <HeartPulse size={36} className="mx-auto mb-3 text-on-surface-variant" />
                        <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">No biomarker data yet</p>
                        <p className="font-label text-[10px] text-on-surface-variant mt-1">Upload a lab report to populate your profile</p>
                      </div>
                    )
                  )}
                </div>

                {/* ── RIGHT COLUMN: Protocols + Graph + Vault ── */}
                <div className="lg:col-span-7 space-y-6">

                  {/* Active AI Protocols */}
                  {user.clinical_profile?.ai_protocols?.length > 0 && (
                    <div className="bg-primary/8 p-6 rounded-3xl border border-primary/20 shadow-lg">
                      <h3 className="font-headline text-xl italic text-primary mb-4 flex items-center gap-2">
                        <ShieldCheck size={18} /> Active Clinical Protocols
                      </h3>
                      <ul className="space-y-3">
                        {user.clinical_profile.ai_protocols.map((protocol, i) => (
                          <li key={i} className="flex items-start gap-3 font-label text-sm text-on-surface leading-relaxed">
                            <div className="mt-1.5 w-1.5 h-1.5 bg-primary rounded-full flex-shrink-0" />
                            {protocol}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Dynamic Longitudinal Graph */}
                  <div className="bg-surface-container-low p-6 rounded-3xl border border-outline-variant/10 shadow-lg h-[300px] flex flex-col">
                    <div className="flex justify-between items-center mb-4 gap-3">
                      <h3 className="font-headline text-2xl italic text-on-surface flex-shrink-0">Longitudinal Trends</h3>
                      {availableMetrics.length > 0 && (
                        <select
                          value={selectedMetric}
                          onChange={e => setSelectedMetric(e.target.value)}
                          className="bg-surface-container text-[10px] font-label text-on-surface-variant p-2 rounded-xl border border-outline-variant/20 outline-none cursor-pointer hover:border-primary/40 transition-colors max-w-[180px] truncate">
                          {availableMetrics.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                      )}
                    </div>

                    {medicalHistory.length === 0 ? (
                      <div className="flex-1 flex flex-col items-center justify-center text-center opacity-40">
                        <HeartPulse size={32} className="mb-3" />
                        <p className="font-label text-xs uppercase tracking-widest">Upload a report to see your trend graph</p>
                      </div>
                    ) : (
                      <div className="flex-1 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#282a28" vertical={false} />
                            <XAxis dataKey="date" stroke="#89938d" fontSize={10} tickLine={false} axisLine={false} dy={10} />
                            <YAxis stroke="#89938d" fontSize={10} tickLine={false} axisLine={false} dx={-10} />
                            <Tooltip
                              contentStyle={{ backgroundColor: '#1e201e', border: '1px solid #404944', borderRadius: '12px', fontSize: '12px', color: '#e2e3df' }}
                              itemStyle={{ color: '#95d3ba', fontWeight: 'bold' }}
                            />
                            <Line
                              type="monotone"
                              name={selectedMetric}
                              dataKey="value"
                              stroke="#95d3ba"
                              strokeWidth={3}
                              dot={{ r: 4, fill: '#1e201e', strokeWidth: 2, stroke: '#95d3ba' }}
                              activeDot={{ r: 6 }}
                              connectNulls
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>

                  {/* Secured Document Vault */}
                  <div className="bg-surface-container-low p-6 rounded-3xl border border-outline-variant/10 shadow-lg">
                    <h3 className="font-label text-xs uppercase tracking-widest text-on-surface-variant mb-4">Secured Document Vault</h3>
                    <div className="space-y-3 max-h-[260px] overflow-y-auto pr-1">
                      {loadingHistory ? (
                        <Loader2 className="animate-spin text-primary mx-auto my-10 block" />
                      ) : medicalHistory.length === 0 ? (
                        <p className="text-sm font-label text-on-surface-variant italic text-center my-10">Vault is empty. Upload your first report above.</p>
                      ) : (
                        medicalHistory.map((doc, i) => {
                          const docName    = doc.document_name || doc.data?.report_type || 'Clinical Document';
                          const score      = doc.extracted_data?.overall_health_score ?? doc.data?.overall_health_score;
                          const scoreColor = score != null && score > 70 ? 'text-primary' : 'text-error';
                          return (
                            <a href={doc.file_url} target="_blank" rel="noreferrer" key={i}
                              className="flex items-center gap-4 p-4 bg-surface-container rounded-2xl border border-outline-variant/10 hover:border-primary/30 transition-colors group cursor-pointer">
                              <div className="w-12 h-12 bg-surface-container-high rounded-xl overflow-hidden flex-shrink-0 border border-outline-variant/20 group-hover:border-primary/50 transition-colors">
                                <img src={doc.file_url} alt="doc" className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-label font-bold text-sm text-on-surface truncate">{docName}</p>
                                <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant mt-0.5">{doc.upload_date}</p>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <span className={`text-xl font-headline italic ${scoreColor}`}>
                                  {score ?? '--'}
                                </span>
                                <p className="font-label text-[8px] uppercase tracking-widest text-on-surface-variant">Score</p>
                              </div>
                              <ChevronRight size={16} className="text-on-surface-variant group-hover:text-primary ml-1 flex-shrink-0" />
                            </a>
                          );
                        })
                      )}
                    </div>
                  </div>

                </div>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* ══════════ BOTTOM NAV (mobile) ══════════ */}
      <footer className="fixed bottom-0 left-0 w-full flex justify-around items-center px-4 pb-6 pt-3 bg-surface-container-lowest/85 backdrop-blur-lg rounded-t-3xl z-50 shadow-[0_-10px_40px_rgba(0,0,0,0.6)] md:hidden">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`flex flex-col items-center p-2 rounded-xl transition-all ${activeTab === t.id ? 'text-primary' : 'text-on-surface-variant'}`}>
            <span className="text-xl">{t.icon}</span>
            <span className="font-label uppercase tracking-widest text-[9px] mt-1">{t.label}</span>
          </button>
        ))}
      </footer>

      {/* ══════════ FAB (desktop) ══════════ */}
      <button
        onClick={() => { if (window.confirm('Generate a completely new 7-day plan? Your current plan will be replaced.')) fetchPlan(true); }}
        disabled={loadingMeals}
        title="Generate new 7-day plan"
        className="fixed bottom-10 right-10 hidden md:flex items-center justify-center w-16 h-16 bg-gradient-to-tr from-tertiary to-tertiary-container rounded-full text-on-tertiary shadow-2xl shadow-black/40 hover:scale-110 transition-transform z-50 disabled:opacity-50">
        <RefreshCw size={24} className={loadingMeals ? 'animate-spin' : ''} />
      </button>
    </div>
  );
}
