import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import axios from 'axios';
import {
  Volume2, PlayCircle, Loader2, RefreshCw,
  Activity, CheckCircle, Trash2, Mic, MicOff, FileText,
  ChefHat, Flame, Beef, ShieldCheck, HeartPulse, ChevronRight,
  Upload, TrendingUp, TrendingDown, Minus, Bot, Clipboard,
  MessageSquare, X,
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

// ── Biomarker danger classification ───────────────────────────
// Returns 0 (normal) → 4 (critical) based on marker status + trend direction.
const getDangerLevel = (marker) => {
  const s = (marker.status || '').toLowerCase().trim();
  const t = (marker.trend  || '').toLowerCase().trim();
  if (!s || s === 'normal') return 0;
  if (s === 'critical' || s.includes('very high') || s.includes('very low') ||
      s.includes('severe') || s.includes('danger')) return 4;
  // Worsening direction makes a high/low marker one tier more dangerous
  const worseningHigh = (s === 'high' || s.includes('elevated') || s === 'abnormal') && t === 'up';
  const worseningLow  = s === 'low' && t === 'down';
  if (worseningHigh || worseningLow) return 3;
  if (s === 'high' || s === 'low' || s === 'abnormal' || s.includes('elevated')) return 2;
  if (s.includes('borderline') || s.includes('slightly') || s.includes('mild')) return 1;
  return 2; // any other non-normal defaults to moderate
};

// Per-level visual config — every class is a complete literal string so Tailwind JIT picks them up.
const DANGER_CONFIG = [
  { // 0 — Normal
    span:  false,
    card:  'bg-surface-container border-outline-variant/10 hover:border-primary/20',
    strip: 'bg-primary/50',
    badge: 'bg-primary/15 text-primary',
    val:   'text-on-surface',
    desc:  'text-on-surface-variant',
    label: 'Normal',
    pulse: false,
  },
  { // 1 — Borderline  (gold / tertiary)
    span:  true,
    card:  'bg-[#1e1500]/80 border-tertiary/50 hover:bg-[#1e1500]',
    strip: 'bg-tertiary',
    badge: 'bg-tertiary/20 text-tertiary border border-tertiary/40',
    val:   'text-tertiary',
    desc:  'text-tertiary/75',
    label: 'Borderline',
    pulse: false,
  },
  { // 2 — Abnormal  (orange)
    span:  true,
    card:  'bg-[#1a0800]/80 border-[#f97316]/45 hover:bg-[#1a0800]',
    strip: 'bg-[#f97316]',
    badge: 'bg-[#f97316]/20 text-[#f97316] border border-[#f97316]/40',
    val:   'text-[#f97316]',
    desc:  'text-[#f97316]/75',
    label: 'Abnormal',
    pulse: false,
  },
  { // 3 — High Risk  (bright error pink-red, worsening trend)
    span:  true,
    card:  'bg-error-container/25 border-error/55 hover:bg-error-container/35',
    strip: 'bg-error',
    badge: 'bg-error/20 text-error border border-error/50',
    val:   'text-error',
    desc:  'text-error/80',
    label: 'High Risk',
    pulse: false,
  },
  { // 4 — Critical  (deep crimson + pulsing dot)
    span:  true,
    card:  'bg-error-container/50 border-error/80 shadow-lg shadow-error-container/50 hover:bg-error-container/60',
    strip: 'bg-error',
    badge: 'bg-error text-on-error border border-error',
    val:   'text-error',
    desc:  'text-error/90',
    label: 'CRITICAL',
    pulse: true,
  },
];

const FEEDBACK_MAX = 2000;

function FeedbackModal({ user, onClose }) {
  const [feedbackType, setFeedbackType] = useState('General Comment');
  const [message, setMessage]           = useState('');
  const [submitting, setSubmitting]     = useState(false);

  // Close on Escape key
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!message.trim()) { toast.error('Please enter a message before submitting.'); return; }
    setSubmitting(true);
    try {
      const res = await axios.post(`${API}/api/feedback/`, {
        user_id: user._id || user.id || null,
        name: user.name || 'Anonymous',
        feedback_type: feedbackType,
        message: message.trim(),
      });
      toast.success(res.data.message);
      setMessage('');
      onClose();
    } catch {
      toast.error('Could not submit feedback. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.92, y: 24 }}
        animate={{ scale: 1,    y: 0  }}
        exit={{ scale: 0.92,    y: 24 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        className="w-full max-w-lg bg-surface-container-high rounded-3xl border border-outline-variant/30 shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-8">
          {/* Header */}
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="font-headline text-2xl italic text-on-surface">Share Your Feedback</h2>
              <p className="font-label text-sm text-on-surface-variant mt-1">Help us make PoshanPal better for you.</p>
            </div>
            <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface transition-colors mt-1">
              <X size={22} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Type selector */}
            <div>
              <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-2">Feedback Type</p>
              <div className="grid grid-cols-3 gap-2">
                {['Bug Report', 'Feature Request', 'General Comment'].map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setFeedbackType(type)}
                    className={`py-2.5 px-2 rounded-xl text-[11px] font-bold font-label tracking-wide transition-all border ${
                      feedbackType === type
                        ? 'bg-primary/20 text-primary border-primary/40'
                        : 'bg-surface-container border-outline-variant/20 text-on-surface-variant hover:border-outline-variant/50'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            {/* Message */}
            <div>
              <div className="flex justify-between items-baseline mb-2">
                <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">Your Message</p>
                <span className={`font-label text-[10px] tabular-nums ${message.length >= FEEDBACK_MAX ? 'text-error' : 'text-on-surface-variant/60'}`}>
                  {message.length}/{FEEDBACK_MAX}
                </span>
              </div>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value.slice(0, FEEDBACK_MAX))}
                maxLength={FEEDBACK_MAX}
                rows={5}
                placeholder="Tell us what you think…"
                className="w-full bg-surface-container p-4 rounded-xl text-on-surface text-sm font-label leading-relaxed resize-none outline-none border border-outline-variant/30 focus:border-primary/50 transition-colors placeholder:text-on-surface-variant/40"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-primary text-on-primary font-label uppercase tracking-widest text-xs font-bold py-4 rounded-xl flex justify-center items-center gap-2 disabled:opacity-50 hover:brightness-110 transition-all"
            >
              {submitting ? <><Loader2 size={15} className="animate-spin" /> Submitting…</> : 'Submit Feedback'}
            </button>
          </form>
        </div>
      </motion.div>
    </motion.div>
  );
}

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
  const [activeTab, setActiveTab]       = useState('medical');
  const [isFeedbackOpen, setFeedbackOpen] = useState(false);

  // Stateful weekly plan
  const [weeklyPlan, setWeeklyPlan]     = useState(null);
  const [loadingMeals, setLoadingMeals] = useState(true);
  const [selectedDay, setSelectedDay]   = useState(
    new Date().toLocaleString('en-us', { weekday: 'long' })
  );

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
  const [reportFile, setReportFile]           = useState(null);
  const [previewUrl, setPreviewUrl]           = useState(null);
  const [loadingReport, setLoadingReport]     = useState(false);
  const [medicalHistory, setMedicalHistory]   = useState([]);
  const [loadingHistory, setLoadingHistory]   = useState(true);
  const [refreshingHistory, setRefreshingHistory] = useState(false);
  const [selectedMetric, setSelectedMetric]   = useState('Health Score');
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
    const firstName = user.name.split(' ')[0];
    const GREETINGS = {
      'hi-IN': {
        text:     `नमस्ते ${firstName}! PoshanPal में आपका स्वागत है। आपका भोजन योजना तैयार है।`,
        fallback: `Namaste ${firstName}! Welcome back to PoshanPal. Your meal plan is ready.`,
      },
      'mr-IN': {
        text:     `नमस्कार ${firstName}! PoshanPal मध्ये आपले स्वागत आहे। आपली जेवणाची योजना तयार आहे।`,
        fallback: `Namaskar ${firstName}! Welcome back to PoshanPal. Your meal plan is ready.`,
      },
      'ta-IN': {
        text:     `வணக்கம் ${firstName}! PoshanPal-இல் உங்களை வரவேற்கிறோம். உங்கள் உணவுத் திட்டம் தயாராக உள்ளது.`,
        fallback: `Vanakkam ${firstName}! Welcome back to PoshanPal. Your meal plan is ready.`,
      },
      'bn-IN': {
        text:     `নমস্কার ${firstName}! PoshanPal-এ আপনাকে স্বাগতম। আপনার খাবারের পরিকল্পনা তৈরি।`,
        fallback: `Namaskar ${firstName}! Welcome back to PoshanPal. Your meal plan is ready.`,
      },
      'gu-IN': {
        text:     `નમસ્તે ${firstName}! PoshanPal માં આપનું સ્વાગત છે। આપની ભોજન યોજના તૈયાર છે.`,
        fallback: `Kem chho ${firstName}! Welcome back to PoshanPal. Your meal plan is ready.`,
      },
      'en-IN': {
        text:     `Welcome back, ${firstName}! Your personalised meal plan is ready on PoshanPal.`,
        fallback: null,
      },
    };
    const g = GREETINGS[lang] || GREETINGS['en-IN'];
    const timer = setTimeout(() => speakText(g.text, lang, g.fallback), 1500);
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
      // Merge — never let the plan response wipe out clinical_profile that was
      // already set by a fresh scan-report response earlier in the same flow.
      if (res.data.user) {
        setUser(prev => ({
          ...res.data.user,
          clinical_profile: res.data.user.clinical_profile ?? prev.clinical_profile,
          master_clinical_directive:
            res.data.user.master_clinical_directive ?? prev.master_clinical_directive,
          clinical_data: res.data.user.clinical_data ?? prev.clinical_data,
        }));
      }
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

  const fetchMedicalHistory = useCallback(async (isRefresh = false) => {
    // On refresh (after upload), show a subtle spinner instead of blanking the vault
    if (isRefresh) {
      setRefreshingHistory(true);
    } else {
      setLoadingHistory(true);
    }
    try {
      const res = await axios.get(`${API}/api/medical-history/${user.id}`);
      setMedicalHistory(res.data.reports || []);
    } catch {
      toast.error('Could not fetch medical vault.', TOAST_STYLE);
    } finally {
      setLoadingHistory(false);
      setRefreshingHistory(false);
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
      speakText(`Recipe ready: ${res.data.name}`, lang, `Recipe ready: ${res.data.name}`);
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
      pantryRecRef.current = null;
      setIsListeningPantry(false);
      return;
    }
    const rec = new SR();
    pantryRecRef.current = rec;
    rec.lang             = lang;
    rec.interimResults   = false;
    rec.continuous       = false;
    rec.onstart  = () => setIsListeningPantry(true);
    rec.onresult = e => setPantryInput(e.results[0][0].transcript);
    rec.onerror  = (e) => {
      setIsListeningPantry(false);
      pantryRecRef.current = null;
      if (e.error === 'not-allowed') {
        toast.error('Microphone access denied. Allow mic in browser settings.', TOAST_STYLE);
      } else if (e.error === 'no-speech') {
        toast('No speech detected. Tap mic and try again.', { icon: '🎙️', ...TOAST_STYLE });
      } else if (e.error === 'audio-capture') {
        toast.error('No microphone found. Please connect one.', TOAST_STYLE);
      } else if (e.error === 'network') {
        toast.error('Voice needs internet. Check your connection.', TOAST_STYLE);
      } else {
        toast.error(`Voice error: ${e.error}. Please type instead.`, TOAST_STYLE);
      }
    };
    rec.onend    = () => { setIsListeningPantry(false); pantryRecRef.current = null; };
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

      // Update UI immediately with the fresh user data from the scan response
      if (res.data.user) setUser(res.data.user);
      setReportFile(null);
      setPreviewUrl(null);
      if (fileInputRef.current) fileInputRef.current.value = '';

      // Release the upload zone right away — don't keep it locked during the long plan generation
      setLoadingReport(false);

      toast.success('Clinical profile updated! Regenerating your meal plan…', { duration: 5000, ...TOAST_STYLE });

      // Refresh history with a subtle indicator (keeps existing docs visible)
      await fetchMedicalHistory(true);

      // Fire plan regeneration without awaiting — it runs in the background
      // so the medical tab stays fully interactive while Gemini works
      fetchPlan(true);
    } catch (err) {
      const detail = err.response?.data?.detail || 'Failed to scan report.';
      const isQuota = err.response?.status === 503 || detail.includes('quota');
      if (isQuota) {
        toast.error('⚠ Gemini API quota is 0. Get a valid key from aistudio.google.com/apikey', { duration: 8000, ...TOAST_STYLE });
      } else {
        toast.error(detail, TOAST_STYLE);
      }
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
      // Use "Apr 15, 14:30" as the label — unique per upload even on same day
      const [datePart, , timePart] = report.upload_date.split(/,\s*(\d{4}),?\s*/);
      const label = timePart ? `${datePart}, ${timePart}` : report.upload_date;
      return { date: label, value };
    });
  }, [medicalHistory, selectedMetric]);

  const calPct       = Math.min((trackerStats.total_cal / (user.target_cal || 1)) * 100, 100);
  const latestReport = medicalHistory[0];
  const hasDirective = user.clinical_profile?.master_directive
    || user.master_clinical_directive
    || latestReport?.data?.clinical_directive
    || user.clinical_data?.clinical_directive;

  return (
    <div className="bg-background text-on-surface font-body min-h-screen">
      <Toaster position="top-center" toastOptions={TOAST_STYLE} />

      {/* ── Feedback modal ── */}
      <AnimatePresence>
        {isFeedbackOpen && <FeedbackModal user={user} onClose={() => setFeedbackOpen(false)} />}
      </AnimatePresence>

      {/* ══════════ TOP NAV ══════════ */}
      <nav className="fixed top-0 w-full z-50 bg-surface-container-lowest/70 backdrop-blur-xl border-b border-outline-variant/10 flex justify-between items-center px-6 py-4">
        <div className="flex items-center gap-8">
          <span className="font-headline text-2xl italic text-on-surface tracking-tight">PoshanPal</span>
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
          {({
            'hi-IN': 'नमस्ते',
            'mr-IN': 'नमस्कार',
            'ta-IN': 'வணக்கம்',
            'bn-IN': 'নমস্কার',
            'gu-IN': 'નમસ્તે',
            'en-IN': 'Hello',
          }[lang] ?? 'Hello')}, {user.name.split(' ')[0]}.
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
                  <div className="flex items-center gap-3 mb-2">
                    <h2 className="font-headline text-3xl italic text-on-surface">Patient Profile</h2>
                    {(() => {
                      const markers = user.clinical_profile?.latest_markers || [];
                      if (!markers.length) return null;
                      const maxLevel = Math.max(...markers.map(getDangerLevel));
                      if (maxLevel === 0) return (
                        <span className="font-label text-[9px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full bg-primary/15 text-primary border border-primary/30">
                          All Clear
                        </span>
                      );
                      if (maxLevel === 1) return (
                        <span className="font-label text-[9px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full bg-tertiary/20 text-tertiary border border-tertiary/40">
                          Watch
                        </span>
                      );
                      if (maxLevel === 2) return (
                        <span className="font-label text-[9px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full bg-[#1a0800]/80 text-[#f97316] border border-[#f97316]/50">
                          Moderate Risk
                        </span>
                      );
                      if (maxLevel === 3) return (
                        <span className="font-label text-[9px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full bg-error-container/25 text-error border border-error/50">
                          High Risk
                        </span>
                      );
                      return (
                        <span className="font-label text-[9px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full bg-error-container/50 text-error border border-error/80 flex items-center gap-1.5">
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-error opacity-75" />
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-error" />
                          </span>
                          Critical Alert
                        </span>
                      );
                    })()}
                  </div>
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

                      {/* ── Header ── */}
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="font-headline text-2xl italic text-on-surface">Vital Biomarkers</h3>
                        <div className="flex items-center gap-2">
                          {refreshingHistory && <Loader2 size={11} className="animate-spin text-primary" />}
                          <span className="font-label text-[9px] uppercase tracking-widest text-on-surface-variant">Aggregated Profile</span>
                        </div>
                      </div>

                      {/* ── Danger summary pills ── */}
                      {(() => {
                        const counts = { 4: 0, 3: 0, 2: 0, 1: 0 };
                        user.clinical_profile.latest_markers.forEach(m => {
                          const l = getDangerLevel(m);
                          if (l > 0) counts[l] = (counts[l] || 0) + 1;
                        });
                        const total = Object.values(counts).reduce((a, b) => a + b, 0);
                        if (!total) return null;
                        return (
                          <div className="flex flex-wrap gap-2 mb-4">
                            {counts[4] > 0 && (
                              <div className="flex items-center gap-1.5 bg-error-container/50 border border-error/70 rounded-full px-3 py-1">
                                <span className="relative flex h-1.5 w-1.5">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-error opacity-75" />
                                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-error" />
                                </span>
                                <span className="font-label text-[9px] font-bold uppercase tracking-widest text-error">{counts[4]} Critical</span>
                              </div>
                            )}
                            {counts[3] > 0 && (
                              <div className="flex items-center gap-1.5 bg-error-container/25 border border-error/50 rounded-full px-3 py-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-error flex-shrink-0" />
                                <span className="font-label text-[9px] font-bold uppercase tracking-widest text-error">{counts[3]} High Risk</span>
                              </div>
                            )}
                            {counts[2] > 0 && (
                              <div className="flex items-center gap-1.5 bg-[#1a0800]/80 border border-[#f97316]/50 rounded-full px-3 py-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#f97316] flex-shrink-0" />
                                <span className="font-label text-[9px] font-bold uppercase tracking-widest text-[#f97316]">{counts[2]} Abnormal</span>
                              </div>
                            )}
                            {counts[1] > 0 && (
                              <div className="flex items-center gap-1.5 bg-[#1e1500]/80 border border-tertiary/50 rounded-full px-3 py-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-tertiary flex-shrink-0" />
                                <span className="font-label text-[9px] font-bold uppercase tracking-widest text-tertiary">{counts[1]} Borderline</span>
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* ── Marker cards — sorted most dangerous first ── */}
                      <div className="grid grid-cols-2 gap-3">
                        {[...user.clinical_profile.latest_markers]
                          .sort((a, b) => getDangerLevel(b) - getDangerLevel(a))
                          .map((marker, i) => {
                            const level = getDangerLevel(marker);
                            const cfg   = DANGER_CONFIG[level];
                            const s     = (marker.status || '').toLowerCase();
                            const t     = (marker.trend  || '').toLowerCase();
                            const isGoodTrend = (s === 'high' && t === 'down') || (s === 'low' && t === 'up');
                            const TrendIcon   = t === 'up' ? TrendingUp : t === 'down' ? TrendingDown : Minus;
                            const trendColor  = level === 0 ? 'text-on-surface-variant'
                                              : isGoodTrend ? 'text-primary'
                                              : cfg.val;
                            return (
                              <div
                                key={i}
                                className={`relative overflow-hidden rounded-2xl border transition-all duration-300 ${cfg.span ? 'col-span-2' : ''} ${cfg.card}`}
                              >
                                {/* Left severity strip */}
                                <div className={`absolute inset-y-0 left-0 w-[3px] ${cfg.strip}`} />

                                <div className="pl-4 pr-3 py-4">
                                  {/* Name + badge row */}
                                  <div className="flex justify-between items-start mb-2.5 gap-2">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      {cfg.pulse && (
                                        <span className="relative flex h-2 w-2 flex-shrink-0">
                                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-error opacity-75" />
                                          <span className="relative inline-flex rounded-full h-2 w-2 bg-error" />
                                        </span>
                                      )}
                                      <p className="font-label text-[9px] uppercase tracking-widest text-on-surface-variant font-bold truncate">
                                        {marker.name}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                      {marker.trend && (
                                        <TrendIcon size={10} className={trendColor} />
                                      )}
                                      <span className={`text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-md ${cfg.badge}`}>
                                        {cfg.label}
                                      </span>
                                    </div>
                                  </div>

                                  {/* Value */}
                                  <p className={`font-headline text-2xl italic leading-none ${cfg.val}`}>
                                    {marker.value}{' '}
                                    <span className="text-[10px] font-sans not-italic text-on-surface-variant">{marker.unit}</span>
                                  </p>

                                  {/* Description — shown for all non-normal markers */}
                                  {level > 0 && marker.description && (
                                    <p className={`mt-2.5 text-[10px] font-label leading-relaxed border-t border-white/5 pt-2 ${cfg.desc}`}>
                                      {marker.description}
                                    </p>
                                  )}
                                </div>
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
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <h3 className="font-headline text-2xl italic text-on-surface">Longitudinal Trends</h3>
                        {refreshingHistory && <Loader2 size={13} className="animate-spin text-primary" />}
                      </div>
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
                        {loadingHistory
                          ? <Loader2 size={28} className="animate-spin mb-3" />
                          : <HeartPulse size={32} className="mb-3" />
                        }
                        <p className="font-label text-xs uppercase tracking-widest">
                          {loadingHistory ? 'Loading your data…' : 'Upload a report to see your trend graph'}
                        </p>
                      </div>
                    ) : (
                      <div className="flex-1 w-full min-h-0">
                        <ResponsiveContainer width="100%" height={200}>
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
                    <div className="flex items-center gap-2 mb-4">
                      <h3 className="font-label text-xs uppercase tracking-widest text-on-surface-variant">Secured Document Vault</h3>
                      {refreshingHistory && <Loader2 size={11} className="animate-spin text-primary flex-shrink-0" />}
                    </div>
                    <div className="space-y-3 max-h-[260px] overflow-y-auto pr-1">
                      {loadingHistory && medicalHistory.length === 0 ? (
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

      {/* ══════════ FAB — Regenerate plan (desktop) ══════════ */}
      <button
        onClick={() => { if (window.confirm('Generate a completely new 7-day plan? Your current plan will be replaced.')) fetchPlan(true); }}
        disabled={loadingMeals}
        title="Generate new 7-day plan"
        className="fixed bottom-10 right-10 hidden md:flex items-center justify-center w-14 h-14 bg-gradient-to-tr from-tertiary to-tertiary-container rounded-full text-on-tertiary shadow-2xl shadow-black/40 hover:scale-110 transition-transform z-50 disabled:opacity-50">
        <RefreshCw size={22} className={loadingMeals ? 'animate-spin' : ''} />
      </button>

      {/* ══════════ FAB — Feedback (desktop) ══════════ */}
      <button
        onClick={() => setFeedbackOpen(true)}
        title="Share feedback"
        className="fixed bottom-28 right-10 hidden md:flex items-center justify-center w-14 h-14 bg-surface-container-high border border-outline-variant/40 rounded-full text-on-surface-variant shadow-xl shadow-black/30 hover:scale-110 hover:text-primary hover:border-primary/40 transition-all z-50">
        <MessageSquare size={22} />
      </button>
    </div>
  );
}
