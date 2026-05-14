/**
 * Vocal Announcement Utility for Clinic Queue System
 * Uses window.speechSynthesis to announce patient queue numbers sequentially
 */

interface SpeechItem {
  utterance: SpeechSynthesisUtterance;
  onStart?: () => void;
  onEnd?: () => void;
}

let speechQueue: SpeechItem[] = [];
let isSpeaking = false;

// Function to process the queue
const processQueue = () => {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

  if (isSpeaking || speechQueue.length === 0) return;

  const item = speechQueue.shift();
  if (!item) return;

  const { utterance, onStart, onEnd } = item;
  isSpeaking = true;

  utterance.onstart = () => {
    if (onStart) onStart();
  };

  const cleanup = () => {
    isSpeaking = false;
    if (onEnd) onEnd();
    // Small delay before next to avoid browser glitches
    setTimeout(processQueue, 100);
  };

  utterance.onend = cleanup;
  utterance.onerror = cleanup;

  // Crucial: cancel any ongoing speech to prevent getting stuck
  window.speechSynthesis.cancel();

  // Actually speak
  window.speechSynthesis.speak(utterance);
};

export const announceQueue = (
  queueNo: string,
  name: string,
  room: string,
  onStart?: () => void,
  onEnd?: () => void
) => {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    console.warn('Speech synthesis not supported in this browser');
    return;
  }

  // Clean name for better pronunciation
  const cleanName = name.toLowerCase()
    .replace(/^dr\.\s+/i, '')
    .replace(/^h\.\s+/i, '')
    .replace(/^hj\.\s+/i, '');

  // Format Queue Number for better pronunciation (e.g., A-01 -> A, 0 1)
  // Use "Nomor Antrean" (formal Indonesian) and add pauses with commas
  const formattedQueueNo = queueNo
    ? queueNo.split('').join(' ').replace(' - ', ', ')
    : '';

  // Better phrasing with natural pauses
  const text = queueNo
    ? `Nomor antrean ${formattedQueueNo}, atas nama ${cleanName}, silakan menuju ${room}.`
    : name;

  const utterance = new SpeechSynthesisUtterance(text);

  // 🎙️ IMPROVED VOICE SELECTION
  const loadVoices = () => {
    const voices = window.speechSynthesis.getVoices();

    // Priority: 
    // 1. Google Indonesian (Best for Chrome)
    // 2. Microsoft Natural/Online Indonesian (Best for Edge)
    // 3. Known female Indonesian voices
    // 4. Any Indonesian voice
    const bestVoice =
      voices.find(v => v.lang.startsWith('id') && v.name.includes('Google')) ||
      voices.find(v => v.lang.startsWith('id') && v.name.includes('Natural')) ||
      voices.find(v => v.lang.startsWith('id') && (v.name.includes('Gadis') || v.name.includes('Andini') || v.name.toLowerCase().includes('female'))) ||
      voices.find(v => v.lang.startsWith('id'));

    if (bestVoice) {
      utterance.voice = bestVoice;
      console.log(`[Speech] Using voice: ${bestVoice.name}`);
    }
  };

  loadVoices();
  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }

  utterance.lang = 'id-ID';
  utterance.rate = 0.9; // More natural and clear for announcements
  utterance.pitch = 1.0;
  utterance.volume = 1.0;

  // Add to queue and process
  speechQueue.push({ utterance, onStart, onEnd });
  processQueue();
}

/**
 * Call this to "unlock" speech on user interaction if needed,
 * or to clear any stuck states.
 */
export const resetSpeech = () => {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    isSpeaking = false;
    speechQueue = [];

    // Play a silent or very short utterance to "prime" the engine
    const prime = new SpeechSynthesisUtterance('');
    prime.volume = 0;
    window.speechSynthesis.speak(prime);
  }
};
