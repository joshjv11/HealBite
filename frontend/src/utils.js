/**
 * Speak `text` in `langCode` using the Web Speech API.
 *
 * Voice-selection strategy:
 *   1. Exact BCP-47 match  (e.g. 'ta-IN')
 *   2. Base-language match (e.g. any 'ta-*' voice)
 *   3. If still no match and a `fallbackText` is provided, switch to an
 *      English voice and speak the romanised fallback instead — this
 *      prevents a Hindi TTS engine from trying (and failing) to pronounce
 *      Tamil / Bengali / Gujarati Unicode script.
 *   4. Last resort: any Hindi voice with the fallback text.
 *   5. Browser default voice.
 */
export const speakText = (text, langCode = 'hi-IN', fallbackText = null) => {
  if (!window.speechSynthesis) {
    console.warn('Text-to-speech not supported on this browser.');
    return;
  }

  window.speechSynthesis.cancel();

  const strip = (t) =>
    t.replace(
      /([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g,
      ''
    ).trim();

  const trySpeak = () => {
    const voices = window.speechSynthesis.getVoices();
    let voice     = null;
    let finalText = strip(text);

    if (voices.length > 0) {
      // 1. Exact BCP-47 match
      voice = voices.find(
        v => v.lang === langCode || v.lang.replace('_', '-') === langCode
      );

      // 2. Base language match (e.g. 'ta' for 'ta-IN')
      if (!voice) {
        const base = langCode.split('-')[0];
        voice = voices.find(v => v.lang.startsWith(base));
      }

      // 3. No native voice found → use fallback text + English voice so the
      //    message is actually intelligible instead of silent/garbled.
      if (!voice && fallbackText) {
        finalText = strip(fallbackText);
        voice = voices.find(v => v.lang.startsWith('en'));
      }

      // 4. Last resort: Hindi voice (acceptable for hi/mr; uses fallback text
      //    for scripts a Hindi engine cannot pronounce).
      if (!voice) {
        voice = voices.find(v => v.lang.startsWith('hi'));
        if (voice && fallbackText) finalText = strip(fallbackText);
      }
    }

    const utterance   = new SpeechSynthesisUtterance(finalText);
    utterance.lang    = voice?.lang || langCode;
    utterance.rate    = 0.85;
    if (voice) utterance.voice = voice;
    window.speechSynthesis.speak(utterance);
  };

  if (window.speechSynthesis.getVoices().length === 0) {
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.onvoiceschanged = null;
      trySpeak();
    };
  } else {
    trySpeak();
  }
};
