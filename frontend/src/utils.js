/**
 * Speak `text` with the Web Speech API.
 *
 * - Indic text never uses an English voice unless `romanIfNoNativeVoice` is provided for bn/ta
 *   when no Bengali/Tamil engine exists (avoids “PoshanPal only” / skipped glyphs).
 * - Marathi/Gujarati: Hindi (hi-IN) voice fallback when no mr/gu voice.
 * - Bengali/Tamil: tries bn-IN/bn-BD/… and ta-IN/ta-LK/…, name + voiceURI hints, then optional roman line + en-IN.
 */

function primaryLang(lang) {
  if (!lang || typeof lang !== 'string') return '';
  return lang.split(/[-_]/)[0].toLowerCase();
}

function hasIndicScript(text) {
  try {
    return (
      /\p{Script=Devanagari}/u.test(text)
      || /\p{Script=Bengali}/u.test(text)
      || /\p{Script=Tamil}/u.test(text)
      || /\p{Script=Gujarati}/u.test(text)
      || /\p{Script=Telugu}/u.test(text)
      || /\p{Script=Kannada}/u.test(text)
      || /\p{Script=Malayalam}/u.test(text)
      || /\p{Script=Gurmukhi}/u.test(text)
    );
  } catch {
    return /[\u0900-\u0DFF]/.test(text);
  }
}

function normalizeLangTag(lang) {
  return lang.replace('_', '-').toLowerCase();
}

function pickNativeVoice(voices, langCode) {
  const target = normalizeLangTag(langCode);
  const base = primaryLang(langCode);
  if (!base) return null;

  const pool = voices.filter(v => primaryLang(v.lang) === base);
  if (pool.length === 0) return null;

  const score = (v) => {
    let s = 0;
    const vl = normalizeLangTag(v.lang);
    if (vl === target) s += 400;
    else if (vl.startsWith(`${base}-`)) s += 200;

    const region = vl.split('-')[1];
    if (region === 'in') s += 80;
    if (primaryLang(langCode) === 'ta' && region === 'lk') s += 75;
    if (primaryLang(langCode) === 'bn' && (region === 'bd' || region === 'in')) s += 70;
    if (primaryLang(langCode) === 'mr' && region === 'in') s += 70;

    const name = (v.name || '').toLowerCase();
    if (name.includes('google')) s += 50;
    if (name.includes('microsoft')) s += 35;
    if (name.includes('natural') || name.includes('neural')) s += 25;
    if (name.includes('premium') || name.includes('enhanced')) s += 15;

    return s;
  };

  return pool.slice().sort((a, b) => score(b) - score(a))[0];
}

function pickEnglishVoice(voices) {
  const pool = voices.filter(v => primaryLang(v.lang) === 'en');
  if (pool.length === 0) return null;

  const score = (v) => {
    let s = 0;
    const vl = normalizeLangTag(v.lang);
    if (vl === 'en-in') s += 120;
    else if (vl === 'en-us') s += 50;
    else if (vl === 'en-gb') s += 45;
    else if (vl.startsWith('en-')) s += 25;

    const name = (v.name || '').toLowerCase();
    if (name.includes('google')) s += 35;
    if (name.includes('microsoft')) s += 25;

    return s;
  };

  const ranked = pool.slice().sort((a, b) => score(b) - score(a));
  return ranked[0] ?? pool[0] ?? null;
}

function pickHindiVoice(voices) {
  return pickNativeVoice(voices, 'hi-IN');
}

function pickVoiceByNameHints(voices, hints) {
  const hl = hints.map(h => h.toLowerCase());
  return (
    voices.find(v => {
      const n = (v.name || '').toLowerCase();
      return hl.some(h => n.includes(h));
    }) || null
  );
}

/** Match Chrome/macOS voices that embed locale in voiceURI (e.g. com.apple.voice.compact.ta-IN.Siri). */
function pickVoiceByUriHints(voices, hints) {
  const hl = hints.map(h => h.toLowerCase());
  return (
    voices.find(v => {
      const uri = (v.voiceURI || '').toLowerCase();
      const name = (v.name || '').toLowerCase();
      const lang = (v.lang || '').toLowerCase();
      return hl.some(h => uri.includes(h) || name.includes(h) || lang.includes(h));
    }) || null
  );
}

function pickVoiceFromLocaleChain(voices, chain) {
  for (const code of chain) {
    const v = pickNativeVoice(voices, code);
    if (v) return v;
  }
  return null;
}

/**
 * Bengali / Tamil: try explicit locale chain + display names + voiceURI substrings.
 */
function pickBanglaTamilVoiceAggressive(voices, langCode) {
  const base = primaryLang(langCode);
  if (base !== 'bn' && base !== 'ta') return null;

  let v = pickNativeVoice(voices, langCode);
  if (v) return v;

  const chain = base === 'bn'
    ? ['bn-IN', 'bn-BD', 'bn-BT', 'bn']
    : ['ta-IN', 'ta-LK', 'ta-SG', 'ta-MY', 'ta'];

  v = pickVoiceFromLocaleChain(voices, chain);
  if (v) return v;

  const nameHints = base === 'bn'
    ? ['bengali', 'bangla', 'bangladesh', 'বাংলা']
    : ['tamil', 'shruti', 'sri lanka', 'lanka'];

  v = pickVoiceByNameHints(voices, nameHints);
  if (v) return v;

  const uriHints = base === 'bn'
    ? ['bengali', 'bangla', 'bn-in', 'bn-bd', 'bn_bt', '/bn', '_bn_', '.bn.']
    : ['tamil', 'ta-in', 'ta-lk', '/ta/', '_ta_', '.ta.', 'tamil'];

  v = pickVoiceByUriHints(voices, uriHints);
  return v;
}

function pickVoiceForLanguage(voices, langCode) {
  const base = primaryLang(langCode);

  if (base === 'bn' || base === 'ta') {
    return pickBanglaTamilVoiceAggressive(voices, langCode);
  }

  let v = pickNativeVoice(voices, langCode);
  if (v) return v;

  const nameHints = {
    mr: ['marathi'],
    gu: ['gujarati'],
  };
  const hints = nameHints[base];
  if (hints) {
    v = pickVoiceByNameHints(voices, hints);
    if (v) return v;
  }

  if (base === 'hi') {
    return pickHindiVoice(voices);
  }

  if (base === 'mr' || base === 'gu') {
    v = pickHindiVoice(voices);
    if (v) return v;
  }

  return null;
}

const strip = (t) =>
  t.replace(
    /([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g,
    ''
  ).trim();

function buildUtterance(finalText, voice, langCode) {
  const utterance = new SpeechSynthesisUtterance(finalText);
  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang || langCode;
  } else {
    utterance.lang = langCode;
  }
  utterance.pitch = 1;
  const pl = primaryLang(utterance.lang);
  if (pl === 'en') {
    utterance.rate = 0.9;
  } else {
    utterance.rate = 0.93;
  }
  return utterance;
}

/**
 * @param romanIfNoNativeVoice Optional ready-made Latin line for bn-IN / ta-IN when the OS lists
 *   no Bengali/Tamil voice — spoken with Indian English so the full message is heard.
 */
export const speakText = (text, langCode = 'hi-IN', romanIfNoNativeVoice = null) => {
  if (!window.speechSynthesis) {
    console.warn('Text-to-speech not supported on this browser.');
    return;
  }

  window.speechSynthesis.cancel();

  const speakNow = () => {
    const voices = window.speechSynthesis.getVoices();
    const base = primaryLang(langCode);
    let utterText = strip(String(text ?? ''));

    // bn/ta may speak roman-only fallback when native script missing from upstream
    if (!utterText && romanIfNoNativeVoice && (base === 'bn' || base === 'ta')) {
      utterText = strip(String(romanIfNoNativeVoice ?? ''));
    }
    if (!utterText) return;

    const indic = hasIndicScript(utterText);

    if (voices.length > 0) {
      if (!indic && base !== 'en') {
        const ev = pickEnglishVoice(voices);
        if (ev) {
          window.speechSynthesis.speak(buildUtterance(utterText, ev, langCode));
          return;
        }
      }

      let voice = pickVoiceForLanguage(voices, langCode);

      if (
        !voice
        && (base === 'bn' || base === 'ta')
        && romanIfNoNativeVoice
      ) {
        utterText = strip(String(romanIfNoNativeVoice ?? ''));
        voice = pickEnglishVoice(voices)
          ?? voices.find(v => primaryLang(v.lang) === 'en');
      }

      if (!voice && base === 'en') {
        voice = pickEnglishVoice(voices)
          ?? voices.find(v => primaryLang(v.lang) === 'en');
      }

      window.speechSynthesis.speak(buildUtterance(utterText, voice, langCode));
      return;
    }

    window.speechSynthesis.speak(buildUtterance(utterText, null, langCode));
  };

  if (window.speechSynthesis.getVoices().length === 0) {
    let started = false;
    const trySpeak = () => {
      if (started) return;
      if (window.speechSynthesis.getVoices().length === 0) return;
      started = true;
      window.speechSynthesis.removeEventListener('voiceschanged', trySpeak);
      speakNow();
    };
    window.speechSynthesis.addEventListener('voiceschanged', trySpeak);
    window.speechSynthesis.getVoices();
    setTimeout(trySpeak, 400);
  } else {
    speakNow();
  }
};
