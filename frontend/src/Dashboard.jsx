import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Volume2, PlayCircle, Search, Loader2 } from 'lucide-react';
import { speakText } from './utils';
import toast, { Toaster } from 'react-hot-toast';

export default function Dashboard({ user }) {
  const [meals, setMeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [craving, setCraving] = useState('');
  const [alternative, setAlternative] = useState(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    axios
      .get(`http://127.0.0.1:8000/api/meals/${user.id}`)
      .then(res => setMeals(res.data.meals))
      .catch(() => toast.error('Failed to generate AI meals. Check your API key.'))
      .finally(() => setLoading(false));
  }, [user.id]);

  const findAlternative = async () => {
    if (!craving.trim()) return;
    setSearching(true);
    setAlternative(null);
    try {
      const res = await axios.post('http://127.0.0.1:8000/api/alternatives/', { craving });
      setAlternative(res.data);
      speakText(
        `Instead of ${craving}, try ${res.data.name}. ${res.data.reasoning}`,
        user.language === 'Hindi' ? 'hi-IN' : 'en-IN'
      );
    } catch {
      toast.error("AI couldn't process this craving right now.");
    } finally {
      setSearching(false);
    }
  };

  const playMealAudio = (meal) => {
    speakText(
      `For your ${meal.category}, have ${meal.name}. It provides ${meal.calories} calories and ${meal.protein} grams of protein.`,
      user.language === 'Hindi' ? 'hi-IN' : 'en-IN'
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 pb-20">
      <Toaster position="top-center" />
      <div className="max-w-md mx-auto space-y-6">

        {/* Stats Banner */}
        <div className="bg-brand-500 rounded-3xl p-6 text-white shadow-lg shadow-brand-500/20">
          <h2 className="text-2xl font-bold mb-1">Namaste, {user.name} 🙏</h2>
          <div className="flex flex-wrap gap-2 mt-4">
            <span className="bg-black/10 px-3 py-1.5 rounded-lg text-sm font-medium">
              BMI: <strong>{user.bmi}</strong>
            </span>
            <span className="bg-black/10 px-3 py-1.5 rounded-lg text-sm font-medium">
              Target: <strong>{user.target_cal} kcal</strong>
            </span>
            <span className="bg-black/10 px-3 py-1.5 rounded-lg text-sm font-medium">
              Protein: <strong>{user.target_protein}g/day</strong>
            </span>
          </div>
        </div>

        {/* AI Craving Engine */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-orange-100">
          <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2 text-lg">
            🤔 Craving something unhealthy?
          </h3>
          <div className="flex gap-2">
            <input
              className="flex-1 bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-orange-400 transition-colors text-slate-700"
              value={craving}
              onChange={e => setCraving(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && findAlternative()}
              placeholder="e.g. Pizza, Samosa, Ice cream..."
            />
            <button
              onClick={findAlternative}
              disabled={searching}
              className="bg-orange-500 hover:bg-orange-600 text-white p-3 rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center"
            >
              {searching ? <Loader2 size={20} className="animate-spin" /> : <Search size={20} />}
            </button>
          </div>

          {alternative && (
            <div className="mt-4 bg-orange-50 p-4 rounded-2xl border border-orange-100">
              <div className="text-4xl mb-2">{alternative.emoji}</div>
              <h4 className="font-bold text-slate-800 text-lg">Try: {alternative.name}</h4>
              <p className="text-orange-700 text-sm mt-1 mb-3 leading-relaxed">{alternative.reasoning}</p>
              <div className="flex gap-2">
                <span className="bg-white text-orange-600 font-bold px-3 py-1 rounded-lg text-sm shadow-sm border border-orange-100">
                  🔥 {alternative.calories} kcal
                </span>
                <span className="bg-white text-blue-600 font-bold px-3 py-1 rounded-lg text-sm shadow-sm border border-blue-100">
                  🥩 {alternative.protein}g protein
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Meal Plan */}
        <div>
          <h2 className="text-xl font-bold text-slate-800 mb-4 px-1">✨ Your AI Meal Plan</h2>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Loader2 className="animate-spin w-10 h-10 mb-4 text-brand-500" />
              <p className="text-center font-medium">Gemini is crafting your<br />personalized menu...</p>
            </div>
          ) : meals.length === 0 ? (
            <div className="bg-white rounded-3xl p-8 text-center text-slate-400 border border-slate-100">
              <p>No meals returned. Check your Gemini API key.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {meals.map((meal, idx) => (
                <div key={meal.id || idx} className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">

                  <div className="flex justify-between items-center mb-3">
                    <span className="text-xs font-bold tracking-widest text-slate-400 uppercase">
                      {meal.category}
                    </span>
                    <button
                      onClick={() => playMealAudio(meal)}
                      title="Listen to meal info"
                      className="text-brand-500 hover:text-brand-600 bg-brand-50 hover:bg-brand-100 p-2 rounded-full transition-colors"
                    >
                      <Volume2 size={18} />
                    </button>
                  </div>

                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-4xl bg-slate-50 w-16 h-16 flex items-center justify-center rounded-2xl flex-shrink-0">
                      {meal.emoji || '🍲'}
                    </span>
                    <h2 className="text-xl font-bold text-slate-800 leading-tight">{meal.name}</h2>
                  </div>

                  <div className="flex flex-wrap gap-2 mb-5">
                    <span className="bg-slate-50 text-slate-600 text-xs font-bold px-3 py-1.5 rounded-lg">
                      🔥 {meal.calories} Cal
                    </span>
                    <span className="bg-blue-50 text-blue-600 text-xs font-bold px-3 py-1.5 rounded-lg">
                      🥩 {meal.protein}g Protein
                    </span>
                    <span className="bg-yellow-50 text-yellow-700 text-xs font-bold px-3 py-1.5 rounded-lg">
                      🍚 {meal.carbs}g Carbs
                    </span>
                    <span className="bg-purple-50 text-purple-600 text-xs font-bold px-3 py-1.5 rounded-lg">
                      🧈 {meal.fats}g Fats
                    </span>
                  </div>

                  <a
                    href={`https://www.youtube.com/results?search_query=${encodeURIComponent(meal.youtube_query || meal.name + ' recipe')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full bg-red-50 hover:bg-red-100 text-red-600 font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors text-sm"
                  >
                    <PlayCircle size={18} /> Find Recipe on YouTube
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
