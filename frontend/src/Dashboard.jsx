import React, { useEffect, useState, useRef, useCallback } from 'react';
import axios from 'axios';
import { Volume2, PlayCircle, Search, Loader2, Flame, Beef, Wheat, Droplets, Zap, RefreshCw } from 'lucide-react';
import { speakText } from './utils';
import toast, { Toaster } from 'react-hot-toast';
import { motion } from 'framer-motion';

/* ── BMI helper ───────────────────────────────── */
function bmiInfo(bmi) {
  if (bmi < 18.5) return { label: 'Underweight', color: 'text-blue-500',   bg: 'bg-blue-50',   bar: 'bg-blue-400'   };
  if (bmi < 25)   return { label: 'Healthy',     color: 'text-brand-600',  bg: 'bg-brand-50',  bar: 'bg-brand-500'  };
  if (bmi < 30)   return { label: 'Overweight',  color: 'text-yellow-600', bg: 'bg-yellow-50', bar: 'bg-yellow-400' };
                  return { label: 'Obese',        color: 'text-red-500',    bg: 'bg-red-50',    bar: 'bg-red-400'    };
}

/* ── Category styling ────────────────────────── */
const CATEGORY_STYLE = {
  'Small Meal':   { border: 'border-l-sky-400',    badge: 'bg-sky-50 text-sky-600',      icon: '🌅', label: 'Light' },
  'Avg Meal':     { border: 'border-l-brand-400',  badge: 'bg-brand-50 text-brand-700',  icon: '☀️', label: 'Main'  },
  'Tiny/Craving': { border: 'border-l-violet-400', badge: 'bg-violet-50 text-violet-600',icon: '🌙', label: 'Snack' },
};

/* ── Shimmer skeleton card ─────────────────── */
function SkeletonCard() {
  return (
    <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-card overflow-hidden">
      <div className="flex justify-between mb-4">
        <div className="shimmer h-4 w-24 rounded-full" />
        <div className="shimmer h-8 w-8 rounded-full" />
      </div>
      <div className="flex items-center gap-3 mb-4">
        <div className="shimmer h-16 w-16 rounded-2xl flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="shimmer h-5 w-full rounded-lg" />
          <div className="shimmer h-4 w-2/3 rounded-lg" />
        </div>
      </div>
      <div className="flex gap-2 mb-4">
        {[...Array(4)].map((_, i) => <div key={i} className="shimmer h-7 w-16 rounded-lg" />)}
      </div>
      <div className="shimmer h-11 w-full rounded-xl" />
    </div>
  );
}

/* ── Macro chip ────────────────────────────── */
function MacroChip({ icon: Icon, value, label, className }) {
  return (
    <span className={`flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-lg ${className}`}>
      <Icon size={11} />
      {value}{label}
    </span>
  );
}

export default function Dashboard({ user }) {
  const [meals, setMeals]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [craving, setCraving]       = useState('');
  const [alternative, setAlternative] = useState(null);
  const [searching, setSearching]   = useState(false);
  const [visibleMeals, setVisibleMeals] = useState([]);
  const inputRef = useRef(null);

  const bmi    = bmiInfo(user.bmi);
  const isHindi = user.language === 'Hindi';
  const lang   = isHindi ? 'hi-IN' : 'en-IN';

  /* ── Fetch meals ────────────────────────── */
  const fetchMeals = useCallback(() => {
    setLoading(true);
    setMeals([]);
    setVisibleMeals([]);
    axios
      .get(`http://127.0.0.1:8000/api/meals/${user.id}`)
      .then(res => {
        setMeals(res.data.meals);
        res.data.meals.forEach((_, i) => {
          setTimeout(() => setVisibleMeals(prev => [...prev, i]), i * 120);
        });
      })
      .catch(() => toast.error('Failed to load meals. Check your connection.'))
      .finally(() => setLoading(false));
  }, [user.id]);

  useEffect(() => { fetchMeals(); }, [fetchMeals]);

  /* ── Craving engine ─────────────────────── */
  const findAlternative = async () => {
    if (!craving.trim()) { inputRef.current?.focus(); return; }
    setSearching(true);
    setAlternative(null);
    try {
      const res = await axios.post('http://127.0.0.1:8000/api/alternatives/', { craving });
      setAlternative(res.data);
      speakText(`Instead of ${craving}, try ${res.data.name}. ${res.data.reasoning}`, lang);
    } catch {
      toast.error("Couldn't find an alternative right now. Try again.");
    } finally {
      setSearching(false);
    }
  };

  const playMealAudio = (meal) =>
    speakText(
      `For your ${meal.category}, have ${meal.name}. It has ${meal.calories} calories and ${meal.protein} grams of protein.`,
      lang
    );

  /* ── Today's date ───────────────────────── */
  const today = new Date().toLocaleDateString(isHindi ? 'hi-IN' : 'en-IN', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  return (
    <div className="app-bg min-h-screen pb-24">
      <Toaster
        position="top-center"
        toastOptions={{ style: { borderRadius: '12px', fontWeight: 600, fontSize: '14px' } }}
      />

      {/* ── Hero header ─────────────────────── */}
      <div className="bg-gradient-to-br from-brand-500 via-brand-600 to-brand-700 px-5 pt-10 pb-20 relative overflow-hidden">
        {/* Decorative blobs */}
        <div className="absolute -top-6 -right-6 w-32 h-32 bg-white/10 rounded-full" />
        <div className="absolute bottom-4 -left-4  w-24 h-24 bg-white/5  rounded-full" />
        <div className="absolute top-8  right-16   w-10 h-10 bg-saffron-400/30 rounded-full animate-bounce-gentle" />

        <div className="max-w-md mx-auto relative z-10">
          {/* Top row */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                <Zap size={16} className="text-white" fill="white" />
              </div>
              <span className="font-black text-white/80 text-sm tracking-tight">AaharVoice</span>
            </div>
            <span className="text-white/50 text-xs font-medium">{today}</span>
          </div>

          {/* Greeting */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <p className="text-brand-100 text-sm font-semibold mb-1">Namaste 🙏</p>
            <h1 className="text-3xl font-black text-white leading-tight">{user.name}</h1>
          </motion.div>

          {/* Stats row */}
          <motion.div
            className="flex gap-2 mt-5 flex-wrap"
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          >
            {/* BMI chip */}
            <div className="bg-white/15 backdrop-blur px-4 py-2.5 rounded-2xl flex items-center gap-2">
              <div>
                <p className="text-white/60 text-xs font-semibold">BMI</p>
                <p className="text-white font-black text-lg leading-none">{user.bmi}</p>
              </div>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${bmi.bg} ${bmi.color}`}>
                {bmi.label}
              </span>
            </div>

            <div className="bg-white/15 backdrop-blur px-4 py-2.5 rounded-2xl">
              <p className="text-white/60 text-xs font-semibold">Calories</p>
              <p className="text-white font-black text-lg leading-none">{user.target_cal} <span className="text-sm font-semibold text-white/70">kcal</span></p>
            </div>

            <div className="bg-white/15 backdrop-blur px-4 py-2.5 rounded-2xl">
              <p className="text-white/60 text-xs font-semibold">Protein</p>
              <p className="text-white font-black text-lg leading-none">{user.target_protein}<span className="text-sm font-semibold text-white/70">g</span></p>
            </div>
          </motion.div>
        </div>
      </div>

      {/* ── Content ────────────────────────── */}
      <div className="max-w-md mx-auto px-4 -mt-10 space-y-5">

        {/* ── Craving engine ─────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
          className="bg-white rounded-3xl shadow-card overflow-hidden border border-orange-100"
        >
          <div className="bg-gradient-to-r from-saffron-500/10 to-orange-50 px-5 py-4 border-b border-orange-100">
            <h3 className="font-black text-slate-800 flex items-center gap-2">
              <span className="text-xl">🤔</span> Craving something unhealthy?
            </h3>
            <p className="text-xs text-slate-400 font-medium mt-0.5">Get a personalised healthy Indian alternative</p>
          </div>

          <div className="p-5">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                className="flex-1 bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-saffron-400 focus:bg-white transition-all text-slate-700 font-medium placeholder:font-normal placeholder:text-slate-300"
                value={craving}
                onChange={e => setCraving(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && findAlternative()}
                placeholder="e.g. Pizza, Samosa, Ice cream…"
              />
              <button
                onClick={findAlternative}
                disabled={searching}
                className="bg-saffron-500 hover:bg-saffron-600 text-white px-4 rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center shadow-sm active:scale-95"
              >
                {searching ? <Loader2 size={20} className="animate-spin" /> : <Search size={20} />}
              </button>
            </div>

            {alternative && (
              <motion.div
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className="mt-4 bg-gradient-to-br from-saffron-50 to-orange-50 p-4 rounded-2xl border border-orange-100"
              >
                <div className="flex items-start gap-3">
                  <span className="text-4xl leading-none mt-1">{alternative.emoji}</span>
                  <div className="flex-1">
                    <p className="text-xs font-bold text-saffron-600 uppercase tracking-wider mb-0.5">Try instead</p>
                    <h4 className="font-black text-slate-800 text-lg leading-tight">{alternative.name}</h4>
                    <p className="text-slate-500 text-sm mt-1 leading-relaxed">{alternative.reasoning}</p>
                    <div className="flex gap-2 mt-3">
                      <span className="bg-white text-orange-600 font-bold px-2.5 py-1 rounded-lg text-xs shadow-sm border border-orange-100 flex items-center gap-1">
                        <Flame size={11}/> {alternative.calories} kcal
                      </span>
                      <span className="bg-white text-blue-600 font-bold px-2.5 py-1 rounded-lg text-xs shadow-sm border border-blue-100 flex items-center gap-1">
                        <Beef size={11}/> {alternative.protein}g protein
                      </span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        </motion.div>

        {/* ── Meal Plan ──────────────────── */}
        <div>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
            className="flex items-center justify-between px-1 mb-3"
          >
            <h2 className="text-lg font-black text-slate-700 flex items-center gap-2">
              🍽️ Your Meal Plan
              {!loading && meals.length > 0 && (
                <span className="text-xs font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                  {meals.length} meals
                </span>
              )}
            </h2>
            <button
              onClick={fetchMeals}
              disabled={loading}
              className="flex items-center gap-1.5 text-xs font-bold text-brand-600 bg-brand-50 hover:bg-brand-100 px-3 py-1.5 rounded-full transition-all disabled:opacity-50 active:scale-95"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              Generate Meal
            </button>
          </motion.div>

          {loading ? (
            <div className="space-y-4">
              {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : meals.length === 0 ? (
            <div className="bg-white rounded-3xl p-10 text-center border border-slate-100 shadow-card">
              <p className="text-4xl mb-3">🍽️</p>
              <p className="font-bold text-slate-600">No meals returned.</p>
              <p className="text-sm text-slate-400 mt-1">Check your backend connection and try again.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {meals.map((meal, idx) => {
                const style = CATEGORY_STYLE[meal.category] || CATEGORY_STYLE['Avg Meal'];
                const isVisible = visibleMeals.includes(idx);

                return (
                  <motion.div
                    key={meal.id || idx}
                    initial={{ opacity: 0, y: 20 }}
                    animate={isVisible ? { opacity: 1, y: 0 } : {}}
                    transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                    className={`bg-white rounded-3xl shadow-card border-l-4 ${style.border} overflow-hidden`}
                  >
                    <div className="p-5">
                      {/* Header row */}
                      <div className="flex justify-between items-center mb-3">
                        <span className={`text-xs font-black px-2.5 py-1 rounded-full flex items-center gap-1 ${style.badge}`}>
                          {style.icon} {style.label}
                        </span>
                        <button
                          onClick={() => playMealAudio(meal)}
                          title="Listen to meal info"
                          className="w-9 h-9 flex items-center justify-center rounded-full bg-brand-50 text-brand-500 hover:bg-brand-100 hover:text-brand-600 transition-all active:scale-90"
                        >
                          <Volume2 size={16} />
                        </button>
                      </div>

                      {/* Dish name + emoji */}
                      <div className="flex items-center gap-3 mb-4">
                        <span className="text-4xl w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center flex-shrink-0">
                          {meal.emoji || '🍲'}
                        </span>
                        <h2 className="text-xl font-black text-slate-800 leading-snug">{meal.name}</h2>
                      </div>

                      {/* Macro chips */}
                      <div className="macro-row mb-4">
                        <MacroChip icon={Flame}    value={meal.calories}  label=" Cal"     className="bg-orange-50 text-orange-600" />
                        <MacroChip icon={Beef}     value={meal.protein}   label="g Pro"    className="bg-blue-50 text-blue-600"    />
                        <MacroChip icon={Wheat}    value={meal.carbs}     label="g Carb"   className="bg-yellow-50 text-yellow-700" />
                        <MacroChip icon={Droplets} value={meal.fats}      label="g Fat"    className="bg-purple-50 text-purple-600" />
                      </div>

                      {/* Calorie bar */}
                      <div className="mb-4">
                        <div className="flex justify-between text-xs font-semibold text-slate-400 mb-1">
                          <span>Calorie contribution</span>
                          <span>{Math.round((meal.calories / user.target_cal) * 100)}% of daily target</span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <motion.div
                            className="h-full bg-gradient-to-r from-brand-400 to-brand-600 rounded-full"
                            initial={{ width: 0 }}
                            animate={isVisible ? { width: `${Math.min((meal.calories / user.target_cal) * 100, 100)}%` } : {}}
                            transition={{ duration: 0.8, delay: 0.2, ease: 'easeOut' }}
                          />
                        </div>
                      </div>

                      {/* YouTube link */}
                      <a
                        href={`https://www.youtube.com/results?search_query=${encodeURIComponent(meal.youtube_query || meal.name + ' recipe')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="w-full bg-red-50 hover:bg-red-100 text-red-600 font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors text-sm active:scale-[0.98]"
                      >
                        <PlayCircle size={16} /> Watch Recipe on YouTube
                      </a>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Footer tip ─────────────────── */}
        {!loading && meals.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}
            className="bg-brand-50 border border-brand-100 rounded-2xl p-4 text-center"
          >
            <p className="text-brand-700 text-sm font-semibold">
              💡 Tap the <span className="inline-flex items-center bg-brand-100 px-1.5 py-0.5 rounded mx-0.5"><Volume2 size={12}/></span> icon on any meal to hear it read aloud
            </p>
          </motion.div>
        )}
      </div>
    </div>
  );
}
