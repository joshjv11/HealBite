import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Volume2, PlayCircle, Search } from 'lucide-react';
import { speakText } from './utils';

export default function Dashboard({ user }) {
  const [meals, setMeals] = useState([]);
  const [mealsLoading, setMealsLoading] = useState(true);
  const [mealsError, setMealsError] = useState('');
  const [craving, setCraving] = useState('');
  const [alternative, setAlternative] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');

  useEffect(() => {
    setMealsLoading(true);
    setMealsError('');
    axios
      .get(`http://127.0.0.1:8000/api/meals/${user.id}`)
      .then(res => setMeals(res.data.meals))
      .catch(() => setMealsError('Could not load meals. Make sure the backend is running.'))
      .finally(() => setMealsLoading(false));
  }, [user.id]);

  const findAlternative = async () => {
    if (!craving.trim()) return;
    setSearchError('');
    setAlternative(null);
    setSearchLoading(true);
    try {
      const res = await axios.post('http://127.0.0.1:8000/api/alternatives/', { craving });
      setAlternative(res.data);
      speakText(
        `Instead of ${craving}, you can eat ${res.data.name}. It has only ${res.data.calories} calories.`
      );
    } catch (err) {
      const msg =
        err.response?.data?.detail ||
        "No healthy alternative found. Try 'chocolate' or 'chips'.";
      setSearchError(msg);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleCravingKey = (e) => {
    if (e.key === 'Enter') findAlternative();
  };

  const playMealAudio = (meal) => {
    const text = `For your ${meal.category}, have ${meal.name}. It provides ${meal.calories} calories and ${meal.protein} grams of protein.`;
    speakText(text, user.language === 'Hindi' ? 'hi-IN' : 'en-IN');
  };

  return (
    <div className="container" style={{ textAlign: 'left' }}>

      {/* Stats Banner */}
      <div className="card" style={{ background: '#22c55e', color: 'white' }}>
        <h2 style={{ margin: 0 }}>Namaste, {user.name}</h2>
        <p style={{ margin: '8px 0 0' }}>
          BMI: <strong>{user.bmi}</strong> &nbsp;|&nbsp; Target: <strong>{user.target_cal} kcal/day</strong>
          &nbsp;|&nbsp; Protein goal: <strong>{user.target_protein}g/day</strong>
        </p>
      </div>

      {/* Craving / Alternative Engine */}
      <div className="card" style={{ border: '2px solid #f59e0b' }}>
        <h3 style={{ margin: '0 0 12px' }}>Craving something unhealthy?</h3>
        <div style={{ display: 'flex', gap: '10px' }}>
          <input
            value={craving}
            onChange={e => setCraving(e.target.value)}
            onKeyDown={handleCravingKey}
            placeholder="e.g. chocolate, chips..."
            style={{ margin: 0 }}
          />
          <button
            className="btn"
            style={{ width: 'auto', margin: 0, padding: '0 20px', opacity: searchLoading ? 0.6 : 1 }}
            onClick={findAlternative}
            disabled={searchLoading}
          >
            <Search />
          </button>
        </div>

        {searchError && (
          <p style={{ color: '#b45309', margin: '10px 0 0', fontSize: '15px' }}>{searchError}</p>
        )}

        {alternative && (
          <div style={{ marginTop: '15px', padding: '15px', background: '#fef3c7', borderRadius: '8px' }}>
            <strong>Try this instead:</strong> {alternative.name}<br />
            <span className="badge" style={{ marginTop: '6px', display: 'inline-block' }}>
              🔥 {alternative.calories} kcal
            </span>
            <img
              src={alternative.image_url}
              alt={alternative.name}
              className="meal-img"
              style={{ height: '120px' }}
            />
          </div>
        )}
      </div>

      {/* Meal Plan */}
      <h2 style={{ marginBottom: '8px' }}>Your Localized Meal Plan</h2>

      {mealsLoading && (
        <p style={{ color: '#6b7280', textAlign: 'center' }}>Loading your meals...</p>
      )}

      {mealsError && (
        <p style={{ color: '#dc2626', textAlign: 'center' }}>{mealsError}</p>
      )}

      {!mealsLoading && !mealsError && meals.length === 0 && (
        <div className="card" style={{ textAlign: 'center', color: '#6b7280' }}>
          <p>No meals found for your preferences. Try a different region or fewer allergy filters.</p>
        </div>
      )}

      {meals.map(meal => (
        <div key={meal.id} className="card" style={{ padding: '15px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#6b7280', fontWeight: 'bold', fontSize: '13px', letterSpacing: '0.05em' }}>
              {meal.category.toUpperCase()}
            </span>
            <button
              onClick={() => playMealAudio(meal)}
              title="Listen to meal info"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3b82f6', padding: 0 }}
            >
              <Volume2 size={28} />
            </button>
          </div>

          <h2 style={{ margin: '5px 0 10px' }}>{meal.name}</h2>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
            <span className="badge">🔥 {meal.calories} Cal</span>
            <span className="badge">🥩 {meal.protein}g Protein</span>
            <span className="badge">🍚 {meal.carbs}g Carbs</span>
            <span className="badge">🧈 {meal.fats}g Fats</span>
          </div>

          <img src={meal.image_url} alt={meal.name} className="meal-img" />

          <a
            href={meal.video_url}
            target="_blank"
            rel="noreferrer"
            className="btn btn-outline"
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '10px',
              textDecoration: 'none',
              marginTop: '15px'
            }}
          >
            <PlayCircle color="#ef4444" /> Watch Recipe Video
          </a>
        </div>
      ))}
    </div>
  );
}
