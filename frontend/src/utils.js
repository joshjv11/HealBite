export const speakText = (text, langCode = 'hi-IN') => {
  if (!window.speechSynthesis) {
    console.warn('Text-to-speech not supported on this browser.');
    return;
  }

  window.speechSynthesis.cancel();

  // Strip emojis for cleaner pronunciation
  const cleanText = text.replace(
    /([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g,
    ''
  ).trim();

  const utterance = new SpeechSynthesisUtterance(cleanText);
  utterance.lang = langCode;
  utterance.rate = 0.85; // Slightly slower — better for low-literacy users

  const trySpeak = () => {
    const voices = window.speechSynthesis.getVoices();

    if (voices.length > 0) {
      // 1. Exact match (e.g. 'mr-IN')
      let voice = voices.find(v => v.lang === langCode || v.lang.replace('_', '-') === langCode);

      // 2. Base language match (e.g. 'mr' for 'mr-IN')
      if (!voice) {
        const base = langCode.split('-')[0];
        voice = voices.find(v => v.lang.startsWith(base));
      }

      // 3. Fall back to Hindi if not English
      if (!voice && !langCode.startsWith('en')) {
        voice = voices.find(v => v.lang.startsWith('hi'));
      }

      if (voice) utterance.voice = voice;
    }

    window.speechSynthesis.speak(utterance);
  };

  // Chrome loads voices asynchronously — give it a tick if empty
  if (window.speechSynthesis.getVoices().length === 0) {
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.onvoiceschanged = null;
      trySpeak();
    };
  } else {
    trySpeak();
  }
};
