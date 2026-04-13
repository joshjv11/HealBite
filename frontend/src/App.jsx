import React, { useState } from 'react';
import axios from 'axios';
import { Mic } from 'lucide-react';
import { speakText } from './utils';
import Dashboard from './Dashboard';

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const mic = SpeechRecognition ? new SpeechRecognition() : null;

export default function App() {
  const [step, setStep] = useState(0);
  const [userData, setUserData] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '',
    language: 'English',
    region: 'North',
    current_weight: '',
    target_weight: '',
    height_cm: '',
    allergies: [],
    medical_conditions: []
  });

  const listen = (field) => {
    if (!mic) return alert("Your browser doesn't support voice input. Please type instead.");
    mic.start();
    setIsListening(true);
    mic.onresult = (e) => {
      setForm(prev => ({ ...prev, [field]: e.results[0][0].transcript }));
      setIsListening(false);
    };
    mic.onerror = () => setIsListening(false);
  };

  const toggleArray = (field, value) => {
    setForm(prev => {
      const arr = prev[field];
      return { ...prev, [field]: arr.includes(value) ? arr.filter(i => i !== value) : [...arr, value] };
    });
  };

  const submitProfile = async () => {
    setError('');
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        current_weight: parseFloat(form.current_weight) || 70,
        target_weight: parseFloat(form.target_weight) || 60,
        height_cm: parseFloat(form.height_cm) || 165
      };
      const res = await axios.post('http://127.0.0.1:8000/api/users/', payload);
      setUserData(res.data);
    } catch (err) {
      setError('Could not connect to the server. Make sure the backend is running on port 8000.');
    } finally {
      setSubmitting(false);
    }
  };

  if (userData) return <Dashboard user={userData} />;

  return (
    <div className="container">
      <div className="card">
        {step === 0 && (
          <>
            <h1>Select Language</h1>
            <button
              className="btn"
              onClick={() => {
                setForm(prev => ({ ...prev, language: 'Hindi' }));
                speakText("हिंदी चुनी गई", "hi-IN");
                setStep(1);
              }}
            >
              हिंदी (Hindi)
            </button>
            <button
              className="btn"
              onClick={() => {
                setForm(prev => ({ ...prev, language: 'English' }));
                speakText("English selected", "en-IN");
                setStep(1);
              }}
            >
              English
            </button>
          </>
        )}

        {step === 1 && (
          <>
            <h1>What is your name?</h1>
            <input
              value={form.name}
              onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Type or tap mic..."
            />
            <button className="btn-mic" onClick={() => listen('name')}>
              <Mic color={isListening ? "black" : "white"} />
            </button>
            <button
              className="btn"
              onClick={() => {
                speakText(
                  `Hello ${form.name}. Enter your body details.`,
                  form.language === 'Hindi' ? 'hi-IN' : 'en-IN'
                );
                setStep(2);
              }}
            >
              Next
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <h1>Body Details</h1>
            <input
              type="number"
              placeholder="Current Weight (kg)"
              value={form.current_weight}
              onChange={e => setForm(prev => ({ ...prev, current_weight: e.target.value }))}
            />
            <input
              type="number"
              placeholder="Target Weight (kg)"
              value={form.target_weight}
              onChange={e => setForm(prev => ({ ...prev, target_weight: e.target.value }))}
            />
            <input
              type="number"
              placeholder="Height (cm)"
              value={form.height_cm}
              onChange={e => setForm(prev => ({ ...prev, height_cm: e.target.value }))}
            />
            <button className="btn" onClick={() => setStep(3)}>Next</button>
          </>
        )}

        {step === 3 && (
          <>
            <h1 style={{ color: '#dc2626' }}>Allergies (Important)</h1>
            <div className="grid-2">
              {['peanut', 'dairy', 'gluten', 'soy'].map(alg => (
                <div
                  key={alg}
                  className={`tag ${form.allergies.includes(alg) ? 'selected' : ''}`}
                  onClick={() => toggleArray('allergies', alg)}
                >
                  {alg.toUpperCase()}
                </div>
              ))}
            </div>
            <h1>Regional Food</h1>
            <select
              className="styled-select"
              value={form.region}
              onChange={e => setForm(prev => ({ ...prev, region: e.target.value }))}
            >
              <option value="North">North Indian</option>
              <option value="South">South Indian</option>
              <option value="All">Mix of Both</option>
            </select>

            {error && <p style={{ color: '#dc2626', marginTop: '10px' }}>{error}</p>}

            <button
              className="btn"
              style={{ marginTop: '20px', opacity: submitting ? 0.6 : 1 }}
              onClick={submitProfile}
              disabled={submitting}
            >
              {submitting ? 'Generating...' : 'Generate Meal Plan'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
