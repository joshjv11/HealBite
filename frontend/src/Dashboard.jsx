import React, { useEffect, useState, useRef, useCallback } from 'react';
import axios from 'axios';
import { Volume2, PlayCircle, Search, Loader2, Flame, Beef, RefreshCw } from 'lucide-react';
import { speakText } from './utils';
import toast, { Toaster } from 'react-hot-toast';
import { motion } from 'framer-motion';

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

/* ── BMI ring helper ──────────────────────────────── */
function bmiRing(bmi) {
  if (bmi < 18.5) return { label: 'Underweight', colorClass: 'text-primary',  pct: 30 };
  if (bmi < 25)   return { label: 'Healthy',     colorClass: 'text-primary',  pct: 75 };
  if (bmi < 30)   return { label: 'Overweight',  colorClass: 'text-tertiary', pct: 48 };
                  return { label: 'Obese',        colorClass: 'text-error',    pct: 22 };
}

/* ── Category → visual ────────────────────────────── */
const CAT = {
  'Small Meal':   { label: 'Light', icon: '🌅', tag: 'bg-primary/20 text-primary border-primary/20'           },
  'Avg Meal':     { label: 'Main',  icon: '☀️', tag: 'bg-surface-container-highest text-on-surface border-outline-variant/20' },
  'Tiny/Craving': { label: 'Snack', icon: '🌙', tag: 'bg-tertiary/20 text-tertiary border-tertiary/20'        },
};

/* ── Gradient pool for magazine cards ─────────────── */
const CARD_GRADIENTS = [
  'from-primary-container/80 to-surface-container-lowest',
  'from-tertiary-container/60 to-surface-container-lowest',
  'from-surface-container-high to-surface-container-lowest',
  'from-primary-container/50 to-surface-container-low',
  'from-tertiary-container/40 to-surface-container-lowest',
  'from-surface-container-highest to-surface-container-lowest',
];

/* ── Magazine skeleton card ───────────────────────── */
function SkeletonCard() {
  return (
    <div className="group cursor-pointer">
      <div className="relative aspect-[3/4] overflow-hidden rounded-xl mb-6 bg-surface-container-high animate-pulse shadow-2xl" />
      <div className="space-y-3">
        <div className="h-8 bg-surface-container-high rounded-lg animate-pulse w-4/5" />
        <div className="h-3 bg-surface-container-high rounded-lg animate-pulse w-2/5" />
        <div className="flex gap-4">
          <div className="h-3 bg-surface-container-high rounded animate-pulse w-20" />
          <div className="h-3 bg-surface-container-high rounded animate-pulse w-20" />
        </div>
      </div>
    </div>
  );
}

export default function Dashboard({ user }) {
  const [meals, setMeals]               = useState([]);
  const [loading, setLoading]           = useState(true);
  const [craving, setCraving]           = useState('');
  const [suggestions, setSuggestions]   = useState([]);
  const [suggestSource, setSuggestSource] = useState('');
  const [searching, setSearching]       = useState(false);
  const [visibleMeals, setVisibleMeals] = useState([]);
  const inputRef = useRef(null);

  const ring    = bmiRing(user.bmi);
  const isHindi = user.language === 'Hindi';
  const lang    = isHindi ? 'hi-IN' : 'en-IN';

  const today = new Date().toLocaleDateString(isHindi ? 'hi-IN' : 'en-IN', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  /* ── Fetch meals ─────────────────────────────────── */
  const fetchMeals = useCallback(() => {
    setLoading(true);
    setMeals([]);
    setVisibleMeals([]);
    axios.get(`http://127.0.0.1:8000/api/meals/${user.id}`)
      .then(res => {
        const list = res.data.meals || [];
        setMeals(list);
        list.forEach((_, i) => setTimeout(() => setVisibleMeals(prev => [...prev, i]), i * 110));
      })
      .catch(() => toast.error('Failed to load meals. Is the backend running?', TOAST_STYLE))
      .finally(() => setLoading(false));
  }, [user.id]);

  useEffect(() => { fetchMeals(); }, [fetchMeals]);

  /* ── Suggest engine ──────────────────────────────── */
  const findSuggestions = async () => {
    if (!craving.trim()) { inputRef.current?.focus(); return; }
    setSearching(true);
    setSuggestions([]);
    setSuggestSource('');
    try {
      const res = await axios.post('http://127.0.0.1:8000/api/suggest/', {
        prompt: craving,
        allergies: user.allergies || [],
      });
      setSuggestions(res.data.suggestions || []);
      setSuggestSource(res.data.source || '');
    } catch {
      toast.error("Couldn't get suggestions right now. Try again.", TOAST_STYLE);
    } finally {
      setSearching(false);
    }
  };

  const playMealAudio = (meal) =>
    speakText(`For your ${meal.category}, try ${meal.name}. It has ${meal.calories} calories and ${meal.protein} grams of protein.`, lang);

  /* ── Bento ring geometry ─────────────────────────── */
  const R = 58;
  const circumference = 2 * Math.PI * R;
  const dashOffset    = circumference * (1 - ring.pct / 100);

  return (
    <div className="bg-background text-on-surface font-body min-h-screen">
      <Toaster position="top-center" toastOptions={TOAST_STYLE} />

      {/* ════════════════ TOP NAV ════════════════ */}
      <nav className="fixed top-0 w-full z-50 bg-surface-container-lowest/70 backdrop-blur-xl border-b border-outline-variant/10 flex justify-between items-center px-6 py-4 shadow-[0_0_40px_rgba(149,211,186,0.04)]">
        <div className="flex items-center gap-8">
          <span className="font-headline text-2xl italic text-on-surface tracking-tight">AaharVoice</span>
          <div className="hidden md:flex gap-6">
            <span className="font-label text-sm font-semibold text-primary">Home</span>
            <span className="font-label text-sm text-on-surface-variant cursor-pointer hover:text-on-surface transition-colors">Discover</span>
            <span className="font-label text-sm text-on-surface-variant cursor-pointer hover:text-on-surface transition-colors">Journal</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center bg-surface-container-high rounded-full px-4 py-1.5 gap-2">
            <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '18px' }}>search</span>
            <input
              className="bg-transparent border-none outline-none text-sm w-36 text-on-surface placeholder:text-on-surface-variant/40 font-label"
              placeholder="Search flavors…"
              type="text"
            />
          </div>
          <span className="material-symbols-outlined text-on-surface-variant hover:text-primary transition-colors cursor-pointer" style={{ fontSize: '28px' }}>account_circle</span>
        </div>
      </nav>

      <main className="pt-24 pb-36 px-6 max-w-7xl mx-auto">

        {/* ════════════════ HERO: TODAY'S PULSE ════════════════ */}
        <section className="mb-16">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
            <div>
              <motion.h2
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                className="font-headline text-5xl md:text-7xl font-bold tracking-tight text-on-surface leading-none mb-2 italic"
              >
                Today's Pulse
              </motion.h2>
              <p className="font-label text-xs uppercase tracking-[0.2em] text-tertiary opacity-80">
                {today} · {user.name}
              </p>
            </div>

            {/* Stat chips */}
            <div className="flex gap-3 flex-wrap">
              <div className="bg-surface-container-low p-4 rounded-xl border-b-2 border-primary/20 flex flex-col items-center min-w-[88px]">
                <span className="text-primary font-bold text-2xl font-label">{user.target_cal}</span>
                <span className="text-[10px] uppercase tracking-wider text-on-surface-variant font-label">kcal goal</span>
              </div>
              <div className="bg-surface-container-low p-4 rounded-xl border-b-2 border-tertiary/20 flex flex-col items-center min-w-[88px]">
                <span className="text-tertiary font-bold text-2xl font-label">{user.target_protein}g</span>
                <span className="text-[10px] uppercase tracking-wider text-on-surface-variant font-label">protein</span>
              </div>
              <div className={`bg-surface-container-low p-4 rounded-xl border-b-2 border-outline-variant/20 flex flex-col items-center min-w-[88px]`}>
                <span className={`font-bold text-2xl font-label ${ring.colorClass}`}>{user.bmi}</span>
                <span className="text-[10px] uppercase tracking-wider text-on-surface-variant font-label">BMI</span>
              </div>
            </div>
          </div>

          {/* ── Bento grid ── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

            {/* Calorie bar chart */}
            <div className="md:col-span-2 bg-surface-container-low rounded-xl p-6 relative overflow-hidden group border border-outline-variant/10">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-60 pointer-events-none" />
              <div className="relative z-10">
                <div className="flex justify-between items-start mb-8">
                  <div>
                    <h3 className="font-headline text-2xl italic text-on-surface">Calorie Distribution</h3>
                    <p className="font-label text-xs text-on-surface-variant mt-1">
                      Across {loading ? '—' : meals.length} planned provisions
                    </p>
                  </div>
                  <span className="material-symbols-outlined text-primary" style={{ fontSize: '24px' }}>insights</span>
                </div>
                <div className="flex items-end gap-2 h-28">
                  {loading
                    ? [...Array(6)].map((_, i) => (
                        <div
                          key={i}
                          className="flex-1 bg-surface-container-high rounded-t-lg animate-pulse"
                          style={{ height: `${35 + (i * 11) % 55}%` }}
                        />
                      ))
                    : (meals.length > 0 ? meals : [...Array(6)]).slice(0, 7).map((meal, i) => {
                        const pct = meal?.calories
                          ? Math.min((meal.calories / Math.max(user.target_cal / 4, 200)) * 55, 92)
                          : 30 + (i * 13) % 50;
                        const colors = ['rgba(149,211,186,0.55)', 'rgba(149,211,186,0.3)', 'rgba(233,193,118,0.4)', 'rgba(149,211,186,0.7)', 'rgba(149,211,186,0.2)', 'rgba(233,193,118,0.55)', 'rgba(149,211,186,0.45)'];
                        return (
                          <div
                            key={i}
                            className="flex-1 rounded-t-lg transition-all duration-700 group-hover:brightness-110"
                            style={{ height: `${pct}%`, backgroundColor: colors[i % colors.length] }}
                          />
                        );
                      })
                  }
                </div>
              </div>
            </div>

            {/* BMI ring panel */}
            <div className="bg-surface-container-high rounded-xl p-8 flex flex-col justify-between border border-outline-variant/10">
              <div>
                <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-6">
                  {ring.label} Range
                </p>
                <div className="relative w-36 h-36 mx-auto">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 144 144">
                    <circle cx="72" cy="72" r={R} fill="transparent" stroke="#282a28" strokeWidth="8" />
                    <circle
                      cx="72" cy="72" r={R} fill="transparent"
                      stroke="#e9c176"
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray={circumference}
                      strokeDashoffset={dashOffset}
                      className="transition-all duration-1000"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className={`text-3xl font-bold font-label ${ring.colorClass}`}>{user.bmi}</span>
                    <span className="text-xs font-label text-on-surface-variant">BMI</span>
                  </div>
                </div>
              </div>
              <button
                onClick={fetchMeals}
                disabled={loading}
                className="w-full py-3 bg-gradient-to-r from-primary to-primary-container text-on-primary font-label font-bold rounded-xl text-sm uppercase tracking-wider shadow-lg hover:scale-[1.02] transition-transform disabled:opacity-50 flex items-center justify-center gap-2 mt-6"
              >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                Generate Meal
              </button>
            </div>
          </div>
        </section>

        {/* ════════════════ CRAVING ENGINE ════════════════ */}
        <section className="mb-20">
          <div className="relative max-w-3xl mx-auto">
            {/* Ambient glow */}
            <div className="absolute -inset-1 bg-gradient-to-r from-primary/25 to-tertiary/25 rounded-2xl blur-lg opacity-20 pointer-events-none" />

            {/* Search container */}
            <div className="relative bg-surface-container-lowest border border-outline-variant/15 border-b-2 border-b-outline-variant/30 px-7 py-5 rounded-2xl">
              <div className="flex items-start gap-4">
                <span className="material-symbols-outlined text-tertiary mt-1 flex-shrink-0" style={{ fontSize: '28px' }}>restaurant_menu</span>
                <textarea
                  ref={inputRef}
                  rows={2}
                  className="bg-transparent border-none outline-none text-xl font-headline italic w-full text-on-surface placeholder:text-on-surface-variant/30 leading-snug"
                  value={craving}
                  onChange={e => setCraving(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && e.ctrlKey && findSuggestions()}
                  placeholder="What does your soul crave today?"
                />
                <button
                  onClick={findSuggestions}
                  disabled={searching}
                  className="flex-shrink-0 w-11 h-11 flex items-center justify-center rounded-full bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 transition-all disabled:opacity-50 mt-0.5 active:scale-90"
                >
                  {searching ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
                </button>
              </div>
            </div>
          </div>

          {/* Suggestion results */}
          {suggestions.length > 0 && (
            <div className="max-w-3xl mx-auto mt-6">
              <div className="flex items-center justify-between mb-4 px-1">
                <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">
                  Here's what we suggest
                </p>
                {suggestSource === 'fallback' && (
                  <span className="font-label text-[10px] text-tertiary bg-tertiary/10 px-2.5 py-1 rounded-full border border-tertiary/20">
                    offline picks
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {suggestions.map((s, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.1, duration: 0.4 }}
                    className="bg-surface-container-low rounded-xl p-5 border border-outline-variant/20 hover:border-primary/30 transition-all group"
                  >
                    <div className="text-4xl mb-3">{s.emoji}</div>
                    <h4 className="font-headline text-xl italic text-on-surface leading-tight mb-2">{s.name}</h4>
                    <p className="font-label text-xs text-on-surface-variant leading-relaxed mb-4">{s.reasoning}</p>
                    <div className="flex flex-wrap gap-3 items-center">
                      <span className="font-label text-[10px] uppercase tracking-wider text-primary flex items-center gap-1">
                        <Flame size={10} /> {s.calories} kcal
                      </span>
                      <span className="font-label text-[10px] uppercase tracking-wider text-tertiary flex items-center gap-1">
                        <Beef size={10} /> {s.protein}g
                      </span>
                      <a
                        href={`https://www.youtube.com/results?search_query=${encodeURIComponent(s.youtube_query || s.name + ' recipe')}`}
                        target="_blank" rel="noreferrer"
                        className="font-label text-[10px] uppercase tracking-wider text-on-surface-variant flex items-center gap-1 hover:text-primary transition-colors"
                      >
                        <PlayCircle size={10} /> Watch
                      </a>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* ════════════════ CURATED PROVISIONS ════════════════ */}
        <section>
          <div className="flex justify-between items-baseline mb-12 border-b border-outline-variant/10 pb-4">
            <h3 className="font-headline text-3xl italic tracking-tight text-on-surface">Curated Provisions</h3>
            <span className="font-label text-xs uppercase tracking-widest text-primary border-b border-primary/40 pb-1 cursor-pointer" onClick={fetchMeals}>
              {loading ? '—' : `${meals.length} meals`}
            </span>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
              {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : meals.length === 0 ? (
            <div className="text-center py-24 border border-outline-variant/10 rounded-xl">
              <p className="font-headline text-3xl italic text-on-surface-variant mb-2">No provisions found.</p>
              <p className="font-label text-xs text-on-surface-variant/40 mb-6">Check your backend connection.</p>
              <button onClick={fetchMeals} className="font-label text-sm text-primary hover:underline">
                Retry
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
              {meals.map((meal, idx) => {
                const style   = CAT[meal.category] || CAT['Avg Meal'];
                const grad    = CARD_GRADIENTS[idx % CARD_GRADIENTS.length];
                const ytUrl   = `https://www.youtube.com/results?search_query=${encodeURIComponent(meal.youtube_query || meal.name + ' recipe')}`;
                const isVis   = visibleMeals.includes(idx);
                const pctDay  = Math.round((meal.calories / user.target_cal) * 100);

                return (
                  <motion.div
                    key={meal.id || idx}
                    initial={{ opacity: 0, y: 28 }}
                    animate={isVis ? { opacity: 1, y: 0 } : {}}
                    transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                    className="group cursor-pointer"
                  >
                    {/* Portrait card */}
                    <div className={`relative aspect-[3/4] overflow-hidden rounded-xl mb-6 shadow-2xl bg-gradient-to-br ${grad} flex items-center justify-center`}>

                      {/* Emoji centrepiece */}
                      <span className="text-[7rem] select-none transition-transform duration-700 group-hover:scale-110 drop-shadow-2xl leading-none">
                        {meal.emoji || '🍽️'}
                      </span>

                      {/* Bottom gradient overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/20 to-transparent" />
                      {/* Top vignette */}
                      <div className="absolute inset-0 bg-gradient-to-b from-surface-container-lowest/30 to-transparent" />

                      {/* YouTube play button — top right */}
                      <a
                        href={ytUrl} target="_blank" rel="noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="absolute top-6 right-6 bg-surface-container-lowest/60 backdrop-blur-md p-3 rounded-full border border-white/10 text-on-surface flex items-center justify-center transition-all group-hover:scale-110 group-hover:bg-primary/80 group-hover:text-on-primary"
                      >
                        <PlayCircle size={20} />
                      </a>

                      {/* Voice button — top left */}
                      <button
                        onClick={e => { e.stopPropagation(); playMealAudio(meal); }}
                        className="absolute top-6 left-6 bg-surface-container-lowest/60 backdrop-blur-md p-3 rounded-full border border-white/10 text-on-surface-variant flex items-center justify-center transition-all hover:text-primary hover:border-primary/30"
                      >
                        <Volume2 size={18} />
                      </button>

                      {/* Bottom tags */}
                      <div className="absolute bottom-6 left-6 right-6">
                        <div className="flex gap-2 flex-wrap">
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
                    </div>

                    {/* Editorial caption */}
                    <h4 className="font-headline text-3xl italic mb-2 group-hover:text-primary transition-colors leading-tight text-on-surface">
                      {meal.name}
                    </h4>
                    <p className="text-on-surface-variant font-label text-[11px] uppercase tracking-widest mb-4">
                      Provision {String(idx + 1).padStart(2, '0')} · {meal.category}
                    </p>
                    <div className="flex items-center gap-5 text-xs font-label text-on-surface-variant">
                      <span className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 bg-primary rounded-full inline-block" />
                        {meal.calories} kcal
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 bg-tertiary rounded-full inline-block" />
                        {meal.protein}g Protein
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* ════════════════ BOTTOM NAV (mobile) ════════════════ */}
      <footer className="fixed bottom-0 left-0 w-full flex justify-around items-center px-4 pb-6 pt-3 bg-surface-container-lowest/85 backdrop-blur-lg rounded-t-3xl z-50 shadow-[0_-10px_40px_rgba(0,0,0,0.6)] md:hidden">
        <div className="flex flex-col items-center text-primary bg-primary/10 rounded-full p-3">
          <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>grid_view</span>
          <span className="font-label uppercase tracking-widest text-[10px] mt-1">Home</span>
        </div>
        <div className="flex flex-col items-center text-on-surface-variant p-3">
          <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>restaurant_menu</span>
          <span className="font-label uppercase tracking-widest text-[10px] mt-1">Meals</span>
        </div>
        <div className="flex flex-col items-center text-on-surface-variant p-3">
          <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>menu_book</span>
          <span className="font-label uppercase tracking-widest text-[10px] mt-1">Journal</span>
        </div>
        <div className="flex flex-col items-center text-on-surface-variant p-3">
          <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>person</span>
          <span className="font-label uppercase tracking-widest text-[10px] mt-1">Profile</span>
        </div>
      </footer>

      {/* ════════════════ FAB (desktop) ════════════════ */}
      <button
        onClick={fetchMeals}
        disabled={loading}
        title="Regenerate meals"
        className="fixed bottom-10 right-10 hidden md:flex items-center justify-center w-16 h-16 bg-gradient-to-tr from-tertiary to-tertiary-container rounded-full text-on-tertiary shadow-2xl shadow-black/40 hover:scale-110 transition-transform z-50 disabled:opacity-50"
      >
        <RefreshCw size={24} className={loading ? 'animate-spin' : ''} />
      </button>
    </div>
  );
}
