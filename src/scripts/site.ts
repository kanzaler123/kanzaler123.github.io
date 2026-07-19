const root = document.documentElement;
const body = document.body;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const heroSequence = document.querySelector<HTMLElement>('[data-hero-sequence]');
const heroSticky = document.querySelector<HTMLElement>('[data-hero-sticky]');
const entryOrb = document.querySelector<HTMLElement>('.entry-orb');
const audioWaveLine = document.querySelector<SVGPathElement>('[data-audio-wave-line]');
const audioWaveEcho = document.querySelector<SVGPathElement>('[data-audio-wave-echo]');
let heroProgress = 0;

const storage = {
  get(key: string) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Storage can be unavailable in private browsing; the UI still works.
    }
  },
};

// Language
const localeToggle = document.querySelector<HTMLButtonElement>('#locale-toggle');
const localeCurrent = localeToggle?.querySelector<HTMLElement>('.locale-current');
const localeNext = localeToggle?.querySelector<HTMLElement>('.locale-next');

function setLocale(locale: 'en' | 'zh-CN') {
  root.dataset.locale = locale;
  root.lang = locale;
  storage.set('kanzaler-locale', locale);

  if (localeCurrent && localeNext && localeToggle) {
    const isEnglish = locale === 'en';
    localeCurrent.textContent = isEnglish ? 'EN' : '中';
    localeNext.textContent = isEnglish ? '中' : 'EN';
    localeToggle.setAttribute('aria-label', isEnglish ? 'Switch to Chinese' : '切换到英文');
  }
}

setLocale(root.dataset.locale === 'zh-CN' ? 'zh-CN' : 'en');
localeToggle?.addEventListener('click', () => {
  setLocale(root.dataset.locale === 'zh-CN' ? 'en' : 'zh-CN');
});

// Mobile navigation
const menuToggle = document.querySelector<HTMLButtonElement>('.menu-toggle');
const primaryNav = document.querySelector<HTMLElement>('.primary-navigation');

function closeMenu() {
  menuToggle?.setAttribute('aria-expanded', 'false');
  body.classList.remove('menu-open');
}

menuToggle?.addEventListener('click', () => {
  const nextOpen = menuToggle.getAttribute('aria-expanded') !== 'true';
  menuToggle.setAttribute('aria-expanded', String(nextOpen));
  body.classList.toggle('menu-open', nextOpen);
});

primaryNav?.querySelectorAll<HTMLAnchorElement>('a').forEach((link) => link.addEventListener('click', closeMenu));
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeMenu();
});

// Music
const audio = document.querySelector<HTMLAudioElement>('#background-music');
const musicToggle = document.querySelector<HTMLButtonElement>('#music-toggle');
const musicVolume = document.querySelector<HTMLInputElement>('#music-volume');
const musicStatus = document.querySelector<HTMLElement>('#music-status');
let desiredPlaying = true;
let actuallyPlaying = false;
let playInFlight: Promise<boolean> | null = null;
let unlockInFlight = false;
let unlockListening = false;
let fadeFrame = 0;
let volume = Number.parseFloat(storage.get('kanzaler-music-volume') ?? '0.25');
if (!Number.isFinite(volume)) volume = 0.25;
volume = Math.min(1, Math.max(0, volume));
let muted = storage.get('kanzaler-music-muted') === 'true';

type WebkitAudioWindow = Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext };
type AudioGraphState = 'native' | 'active' | 'bypass' | 'unsupported';
const AudioContextConstructor = window.AudioContext ?? (window as WebkitAudioWindow).webkitAudioContext;
let audioContext: AudioContext | null = null;
let mediaSource: MediaElementAudioSourceNode | null = null;
let analyser: AnalyserNode | null = null;
let analyserBins: Uint8Array<ArrayBuffer> | null = null;
let graphState: AudioGraphState = 'native';
let graphPromise: Promise<boolean> | null = null;
let analyserUnlockListening = false;
let audioVisualFrame = 0;
let bassEnvelope = 0;
const wavePointCount = 96;
const waveCenter = 120;
const waveRadius = 107;
const waveOffsets = new Float32Array(wavePointCount);
const waveTargets = new Float32Array(wavePointCount);
const spectrumBands = new Float32Array(wavePointCount / 2);
let wavePhase = 0;

if (audio) {
  audio.volume = muted ? 0 : volume;
  audio.muted = muted;
}
if (musicVolume) musicVolume.value = String(Math.round(volume * 100));

function setAudioCss(level = 0) {
  if (!heroSequence) return;
  const safeLevel = Math.max(0, Math.min(1, Number.isFinite(level) ? level : 0));
  heroSequence.style.setProperty('--audio-glow', `${(88 + safeLevel * 76).toFixed(1)}px`);
  heroSequence.style.setProperty('--audio-brightness', (1 + safeLevel * 0.2).toFixed(3));
  heroSequence.style.setProperty('--wave-opacity', (0.48 + safeLevel * 0.4).toFixed(3));
}

function makeSmoothClosedPath(offsets: Float32Array, multiplier = 1) {
  const points = Array.from({ length: wavePointCount }, (_, index) => {
    const angle = (index / wavePointCount) * Math.PI * 2 - Math.PI / 2;
    const radius = waveRadius + offsets[index] * multiplier;
    return {
      x: waveCenter + Math.cos(angle) * radius,
      y: waveCenter + Math.sin(angle) * radius,
    };
  });
  const midpoint = (a: { x: number; y: number }, b: { x: number; y: number }) => ({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  });
  const start = midpoint(points[wavePointCount - 1], points[0]);
  let path = `M ${start.x.toFixed(2)} ${start.y.toFixed(2)}`;
  for (let index = 0; index < wavePointCount; index += 1) {
    const point = points[index];
    const next = points[(index + 1) % wavePointCount];
    const end = midpoint(point, next);
    path += ` Q ${point.x.toFixed(2)} ${point.y.toFixed(2)} ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
  }
  return `${path} Z`;
}

function drawAudioWave() {
  let deviation = 0;
  waveOffsets.forEach((offset) => { deviation = Math.max(deviation, Math.abs(offset)); });
  const basePath = makeSmoothClosedPath(waveOffsets);
  audioWaveLine?.setAttribute('d', basePath);
  audioWaveLine?.setAttribute('data-wave-deviation', deviation.toFixed(3));
  audioWaveEcho?.setAttribute('d', makeSmoothClosedPath(waveOffsets, 1.22));
}

function frequencyEnergy(minHz: number, maxHz: number, binWidth: number) {
  if (!analyserBins) return 0;
  const first = Math.max(1, Math.ceil(minHz / binWidth));
  const last = Math.min(analyserBins.length - 1, Math.max(first, Math.floor(maxHz / binWidth)));
  let energy = 0;
  let count = 0;
  for (let index = first; index <= last; index += 1) {
    const normalized = analyserBins[index] / 255;
    energy += normalized * normalized;
    count += 1;
  }
  return count ? Math.sqrt(energy / count) : 0;
}

function settleAudioWave() {
  let remaining = 0;
  for (let index = 0; index < wavePointCount; index += 1) {
    waveOffsets[index] *= 0.82;
    if (Math.abs(waveOffsets[index]) < 0.015) waveOffsets[index] = 0;
    remaining = Math.max(remaining, Math.abs(waveOffsets[index]));
  }
  bassEnvelope *= 0.82;
  if (bassEnvelope < 0.005) bassEnvelope = 0;
  setAudioCss(bassEnvelope);
  drawAudioWave();
  return remaining;
}

function resetAudioWave() {
  waveOffsets.fill(0);
  waveTargets.fill(0);
  spectrumBands.fill(0);
  bassEnvelope = 0;
  setAudioCss(0);
  drawAudioWave();
}

drawAudioWave();

function canSampleAudio() {
  return Boolean(
    analyser
    && analyserBins
    && audioContext?.state === 'running'
    && actuallyPlaying
    && !muted
    && volume > 0
    && heroProgress < 0.68
    && !document.hidden
    && !reduceMotion.matches,
  );
}

function sampleAudio() {
  audioVisualFrame = 0;
  if (!canSampleAudio() || !analyser || !analyserBins || !audioContext) {
    const remaining = settleAudioWave();
    if (remaining > 0 || bassEnvelope > 0) audioVisualFrame = requestAnimationFrame(sampleAudio);
    return;
  }

  analyser.getByteFrequencyData(analyserBins);
  const binWidth = audioContext.sampleRate / analyser.fftSize;
  const bass = frequencyEnergy(45, 220, binWidth);
  const mids = frequencyEnergy(220, 1800, binWidth);
  const highs = frequencyEnergy(1800, 6200, binWidth);
  const bassTarget = Math.max(0, Math.min(1, (bass - 0.045) / 0.52));
  bassEnvelope += (bassTarget - bassEnvelope) * (bassTarget > bassEnvelope ? 0.28 : 0.075);

  for (let band = 0; band < spectrumBands.length; band += 1) {
    const ratio = band / Math.max(1, spectrumBands.length - 1);
    const centerHz = 60 * Math.pow(6200 / 60, ratio);
    const raw = frequencyEnergy(centerHz * 0.82, centerHz * 1.2, binWidth);
    const left = spectrumBands[Math.max(0, band - 1)] || raw;
    spectrumBands[band] += (((raw * 0.66) + (left * 0.34)) - spectrumBands[band]) * 0.22;
  }

  const bandMean = spectrumBands.reduce((sum, band) => sum + band, 0) / spectrumBands.length;
  wavePhase += 0.018 + bassEnvelope * 0.012;
  for (let index = 0; index < wavePointCount; index += 1) {
    const mirroredIndex = index < spectrumBands.length ? index : wavePointCount - index - 1;
    const band = spectrumBands[Math.max(0, Math.min(spectrumBands.length - 1, mirroredIndex))];
    const angle = (index / wavePointCount) * Math.PI * 2;
    const lowWave = Math.sin(angle * 3 + wavePhase) * bassEnvelope * 4.8;
    const secondaryWave = Math.sin(angle * 7 - wavePhase * 0.72) * (bassEnvelope * 1.9 + mids * 1.25);
    const fineWave = Math.sin(angle * 11 + wavePhase * 1.18) * highs * 0.75;
    const spectralWave = (band - bandMean * 0.72) * 4.4;
    waveTargets[index] = Math.max(-7.5, Math.min(8.5, lowWave + secondaryWave + fineWave + spectralWave));
  }

  for (let index = 0; index < wavePointCount; index += 1) {
    const previous = waveTargets[(index - 1 + wavePointCount) % wavePointCount];
    const current = waveTargets[index];
    const next = waveTargets[(index + 1) % wavePointCount];
    const spatiallySmoothed = previous * 0.24 + current * 0.52 + next * 0.24;
    const response = Math.abs(spatiallySmoothed) > Math.abs(waveOffsets[index]) ? 0.24 : 0.095;
    waveOffsets[index] += (spatiallySmoothed - waveOffsets[index]) * response;
  }

  setAudioCss(bassEnvelope);
  drawAudioWave();
  audioVisualFrame = requestAnimationFrame(sampleAudio);
}

function syncAudioVisualization() {
  if (canSampleAudio()) {
    if (!audioVisualFrame) audioVisualFrame = requestAnimationFrame(sampleAudio);
    return;
  }
  if (!audioVisualFrame) audioVisualFrame = requestAnimationFrame(sampleAudio);
}

function removeAnalyserUnlock() {
  if (!analyserUnlockListening) return;
  analyserUnlockListening = false;
  document.removeEventListener('pointerdown', handleAnalyserUnlock, true);
  document.removeEventListener('touchstart', handleAnalyserUnlock, true);
  document.removeEventListener('keydown', handleAnalyserUnlock, true);
}

function installAnalyserUnlock() {
  if (analyserUnlockListening || reduceMotion.matches || graphState === 'active' || graphState === 'unsupported' || graphState === 'bypass') return;
  analyserUnlockListening = true;
  document.addEventListener('pointerdown', handleAnalyserUnlock, true);
  document.addEventListener('touchstart', handleAnalyserUnlock, true);
  document.addEventListener('keydown', handleAnalyserUnlock, true);
}

async function ensureAnalyser(fromGesture = false): Promise<boolean> {
  if (!audio || reduceMotion.matches) return false;
  if (graphState === 'active') {
    if (fromGesture && audioContext?.state !== 'running') {
      try {
        await audioContext?.resume();
      } catch {
        installAnalyserUnlock();
      }
    }
    syncAudioVisualization();
    return audioContext?.state === 'running';
  }
  if (graphState === 'unsupported' || graphState === 'bypass') return false;
  if (graphPromise) return graphPromise;

  graphPromise = (async () => {
    if (!AudioContextConstructor) {
      graphState = 'unsupported';
      if (entryOrb) entryOrb.dataset.audioState = graphState;
      return false;
    }

    try {
      audioContext ??= new AudioContextConstructor();
      if (audioContext.state !== 'running' && !fromGesture) {
        installAnalyserUnlock();
        return false;
      }
      if (audioContext.state !== 'running') await audioContext.resume();
      if (audioContext.state !== 'running') {
        installAnalyserUnlock();
        return false;
      }

      if (!mediaSource) mediaSource = audioContext.createMediaElementSource(audio);
      if (!analyser) {
        const nextAnalyser = audioContext.createAnalyser();
        nextAnalyser.fftSize = 1024;
        nextAnalyser.smoothingTimeConstant = 0.78;
        nextAnalyser.minDecibels = -90;
        nextAnalyser.maxDecibels = -20;
        try {
          mediaSource.connect(nextAnalyser);
          nextAnalyser.connect(audioContext.destination);
          analyser = nextAnalyser;
          analyserBins = new Uint8Array(nextAnalyser.frequencyBinCount);
        } catch {
          mediaSource.disconnect();
          mediaSource.connect(audioContext.destination);
          graphState = 'bypass';
          if (entryOrb) entryOrb.dataset.audioState = graphState;
          return false;
        }
      }

      graphState = 'active';
      if (entryOrb) entryOrb.dataset.audioState = graphState;
      removeAnalyserUnlock();
      audioContext.onstatechange = () => {
        if (audioContext?.state === 'running') {
          syncAudioVisualization();
        } else {
          syncAudioVisualization();
          installAnalyserUnlock();
        }
      };
      syncAudioVisualization();
      return true;
    } catch {
      installAnalyserUnlock();
      return false;
    }
  })().finally(() => {
    graphPromise = null;
  });

  return graphPromise;
}

function handleAnalyserUnlock() {
  void ensureAnalyser(true);
}

function updateMusicUi(state: 'playing' | 'paused' | 'muted' | 'blocked') {
  if (!musicToggle || !musicStatus) return;
  musicToggle.dataset.state = state;
  musicToggle.setAttribute('aria-pressed', String(state === 'playing'));

  const copy = {
    playing: ['Pause background music', 'Background music playing'],
    paused: ['Play background music', 'Background music paused'],
    muted: ['Unmute background music', 'Background music muted'],
    blocked: ['Retry background music', 'Music needs another click to play'],
  } as const;
  musicToggle.setAttribute('aria-label', copy[state][0]);
  musicStatus.textContent = copy[state][1];
  if (heroSequence) heroSequence.dataset.audioActive = String(state === 'playing');
  if (state === 'playing') {
    void ensureAnalyser(false);
    installAnalyserUnlock();
  }
  syncAudioVisualization();
}

function fadeAudio(target: number, duration = 1100) {
  if (!audio || reduceMotion.matches) {
    if (audio) audio.volume = target;
    return;
  }
  cancelAnimationFrame(fadeFrame);
  const initial = audio.volume;
  const start = performance.now();
  const tick = (time: number) => {
    const progress = Math.min(1, Math.max(0, (time - start) / duration));
    const eased = 1 - Math.pow(1 - progress, 3);
    audio.volume = initial + (target - initial) * eased;
    if (progress < 1) fadeFrame = requestAnimationFrame(tick);
  };
  fadeFrame = requestAnimationFrame(tick);
}

function removeAudioUnlock() {
  if (!unlockListening) return;
  unlockListening = false;
  document.removeEventListener('pointerdown', handleAudioUnlock, true);
  document.removeEventListener('pointerup', handleAudioUnlock, true);
  document.removeEventListener('touchend', handleAudioUnlock, true);
  document.removeEventListener('keydown', handleAudioUnlock, true);
  document.removeEventListener('wheel', handleAudioUnlock, true);
}

function installAudioUnlock() {
  if (unlockListening || !desiredPlaying || actuallyPlaying) return;
  unlockListening = true;
  document.addEventListener('pointerdown', handleAudioUnlock, true);
  document.addEventListener('pointerup', handleAudioUnlock, true);
  document.addEventListener('touchend', handleAudioUnlock, true);
  document.addEventListener('keydown', handleAudioUnlock, true);
  document.addEventListener('wheel', handleAudioUnlock, true);
}

async function startAudio(): Promise<boolean> {
  if (!audio) return false;
  desiredPlaying = true;

  if (actuallyPlaying) {
    audio.muted = muted;
    if (!muted) fadeAudio(volume, 500);
    updateMusicUi(muted ? 'muted' : 'playing');
    removeAudioUnlock();
    return true;
  }

  if (playInFlight) return playInFlight;
  audio.muted = muted;
  audio.volume = muted || reduceMotion.matches ? (muted ? 0 : volume) : 0;

  playInFlight = (async () => {
    try {
      await audio.play();
      actuallyPlaying = true;
      removeAudioUnlock();
      if (muted) {
        updateMusicUi('muted');
        return true;
      }
      fadeAudio(volume);
      updateMusicUi('playing');
      return true;
    } catch {
      actuallyPlaying = false;
      updateMusicUi('blocked');
      installAudioUnlock();
      return false;
    } finally {
      playInFlight = null;
    }
  })();

  return playInFlight;
}

async function handleAudioUnlock(event: Event) {
  if (!desiredPlaying || actuallyPlaying || unlockInFlight) return;
  if (event instanceof PointerEvent) {
    const isMouseDown = event.type === 'pointerdown' && event.pointerType === 'mouse';
    const isNonMouseRelease = event.type === 'pointerup' && event.pointerType !== 'mouse';
    if (!isMouseDown && !isNonMouseRelease) return;
  }
  const target = event.target;
  if (target instanceof Element && target.closest('.music-control')) return;
  unlockInFlight = true;
  const graphReady = ensureAnalyser(true);
  const played = await startAudio();
  await graphReady;
  unlockInFlight = false;
  if (played) removeAudioUnlock();
}

function pauseAudio() {
  if (!audio) return;
  desiredPlaying = false;
  actuallyPlaying = false;
  removeAudioUnlock();
  audio.pause();
  updateMusicUi('paused');
  resetAudioWave();
  syncAudioVisualization();
}

musicToggle?.addEventListener('click', async () => {
  void ensureAnalyser(true);
  if (actuallyPlaying && !muted) {
    pauseAudio();
    return;
  }

  if (muted) {
    muted = false;
    audio!.muted = false;
    storage.set('kanzaler-music-muted', 'false');
    if (actuallyPlaying) {
      fadeAudio(volume, 500);
      updateMusicUi('playing');
      return;
    }
  }
  await startAudio();
});

musicVolume?.addEventListener('input', async () => {
  void ensureAnalyser(true);
  volume = Math.max(0, Math.min(1, Number(musicVolume.value) / 100));
  storage.set('kanzaler-music-volume', String(volume));
  muted = volume === 0;
  storage.set('kanzaler-music-muted', String(muted));

  if (!audio) return;
  audio.muted = muted;
  audio.volume = volume;
  if (muted) {
    updateMusicUi('muted');
  } else if (actuallyPlaying) {
    updateMusicUi('playing');
  } else {
    await startAudio();
  }
  syncAudioVisualization();
});

audio?.addEventListener('pause', () => {
  actuallyPlaying = false;
  if (!desiredPlaying) updateMusicUi('paused');
});
audio?.addEventListener('ended', () => {
  actuallyPlaying = false;
  updateMusicUi('paused');
});
document.addEventListener('visibilitychange', syncAudioVisualization);
updateMusicUi(muted ? 'muted' : 'paused');

// Try audible autoplay immediately. If the browser blocks it, the first real
// interaction will retry without turning the page into an entrance gate.
void startAudio();

const overviewButton = document.querySelector<HTMLButtonElement>('#scroll-to-overview');
overviewButton?.addEventListener('click', () => {
  if (!actuallyPlaying) void startAudio();
  void ensureAnalyser(true);
  if (!heroSequence || !heroSticky) return;
  const travel = Math.max(1, heroSequence.offsetHeight - heroSticky.offsetHeight);
  window.scrollTo({
    top: heroSequence.offsetTop + travel * 0.94,
    behavior: reduceMotion.matches ? 'auto' : 'smooth',
  });
});

// One sticky starry scene, sampled from scroll position in both directions.
let heroRenderFrame = 0;
const clamp = (value: number, minimum = 0, maximum = 1) => Math.min(maximum, Math.max(minimum, value));
const smoothstep = (start: number, end: number, value: number) => {
  const time = clamp((value - start) / (end - start));
  return time * time * (3 - 2 * time);
};
const mix = (start: number, end: number, time: number) => start + (end - start) * time;

function renderHeroSequence() {
  heroRenderFrame = 0;
  if (!heroSequence || !heroSticky) return;
  const travel = Math.max(1, heroSequence.offsetHeight - heroSticky.offsetHeight);
  const nextProgress = clamp((window.scrollY - heroSequence.offsetTop) / travel);
  heroProgress = nextProgress;

  const compact = window.innerWidth <= 780;
  const reduced = reduceMotion.matches;
  const motion = reduced ? (nextProgress >= 0.5 ? 1 : 0) : smoothstep(0.12, 0.76, nextProgress);
  const orbExit = reduced ? motion : smoothstep(0.12, 0.62, nextProgress);
  const buttonExit = reduced ? motion : smoothstep(0.08, 0.34, nextProgress);
  const deckReveal = reduced ? motion : smoothstep(0.38, 0.84, nextProgress);
  const hazeReveal = reduced ? motion : smoothstep(0.42, 0.9, nextProgress);

  const initialX = window.innerWidth * 0.5;
  const finalX = window.innerWidth * (compact ? 0.5 : window.innerWidth <= 1100 ? 0.4 : 0.35);
  const initialY = window.innerHeight * 0.42;
  const finalY = window.innerHeight * (compact ? 0.245 : 0.34);
  const copyMotion = motion;

  heroSequence.style.setProperty('--hero-progress', nextProgress.toFixed(4));
  heroSequence.style.setProperty('--orb-opacity', (1 - orbExit).toFixed(4));
  heroSequence.style.setProperty('--orb-scale', mix(1, compact ? 1.38 : 1.62, orbExit).toFixed(4));
  heroSequence.style.setProperty('--orb-blur', `${mix(0, 6, orbExit).toFixed(2)}px`);
  heroSequence.style.setProperty('--copy-x', `${mix(initialX, finalX, copyMotion).toFixed(2)}px`);
  heroSequence.style.setProperty('--copy-y', `${mix(initialY, finalY, copyMotion).toFixed(2)}px`);
  heroSequence.style.setProperty('--copy-scale', mix(1, compact ? 1.02 : 1.1, copyMotion).toFixed(4));
  heroSequence.style.setProperty('--button-opacity', (1 - buttonExit).toFixed(4));
  heroSequence.style.setProperty('--button-y', `${mix(0, 18, buttonExit).toFixed(2)}px`);
  heroSequence.style.setProperty('--button-scale', mix(1, 0.82, buttonExit).toFixed(4));
  heroSequence.style.setProperty('--deck-opacity', deckReveal.toFixed(4));
  heroSequence.style.setProperty('--deck-y', `${mix(150, 0, deckReveal).toFixed(2)}px`);
  heroSequence.style.setProperty('--deck-scale', mix(0.965, 1, deckReveal).toFixed(4));
  heroSequence.style.setProperty('--haze-opacity', hazeReveal.toFixed(4));

  const phase = nextProgress < 0.38 ? 'entry' : nextProgress < 0.74 ? 'morph' : 'overview';
  heroSequence.dataset.heroPhase = phase;
  overviewButton?.setAttribute('aria-hidden', String(phase !== 'entry'));
  syncAudioVisualization();
}

function scheduleHeroRender() {
  if (!heroRenderFrame) heroRenderFrame = requestAnimationFrame(renderHeroSequence);
}

renderHeroSequence();
window.addEventListener('scroll', scheduleHeroRender, { passive: true });
window.addEventListener('resize', scheduleHeroRender, { passive: true });
window.addEventListener('orientationchange', scheduleHeroRender, { passive: true });
window.addEventListener('pageshow', scheduleHeroRender);

// Scroll reveals and active navigation
const revealElements = document.querySelectorAll<HTMLElement>('[data-reveal]');
if (reduceMotion.matches || !('IntersectionObserver' in window)) {
  revealElements.forEach((element) => element.classList.add('is-visible'));
} else {
  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          (entry.target as HTMLElement).classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.14, rootMargin: '0px 0px -8% 0px' },
  );
  revealElements.forEach((element) => revealObserver.observe(element));
}

const sections = document.querySelectorAll<HTMLElement>('[data-nav-section], .content-stage > section[id]');
const navLinks = document.querySelectorAll<HTMLAnchorElement>('[data-nav-link]');
let navigationFrame = 0;

function syncActiveNavigation() {
  navigationFrame = 0;
  const readingLine = window.scrollY + window.innerHeight * 0.3;
  let activeSection = 'home';
  sections.forEach((section) => {
    const sectionTop = section.getBoundingClientRect().top + window.scrollY;
    if (sectionTop <= readingLine) activeSection = section.dataset.navSection ?? section.id;
  });
  navLinks.forEach((link) => link.classList.toggle('active', link.dataset.navLink === activeSection));
}

function scheduleActiveNavigation() {
  if (!navigationFrame) navigationFrame = requestAnimationFrame(syncActiveNavigation);
}

syncActiveNavigation();
window.addEventListener('scroll', scheduleActiveNavigation, { passive: true });
window.addEventListener('resize', scheduleActiveNavigation, { passive: true });
window.addEventListener('pageshow', scheduleActiveNavigation);

const header = document.querySelector<HTMLElement>('[data-header]');
window.addEventListener(
  'scroll',
  () => header?.classList.toggle('is-scrolled', window.scrollY > 32),
  { passive: true },
);

// Ambient canvas
const canvas = document.querySelector<HTMLCanvasElement>('#star-field');
const context = canvas?.getContext('2d');
type Star = { x: number; y: number; radius: number; alpha: number; speed: number; phase: number };
let stars: Star[] = [];
let canvasWidth = 0;
let canvasHeight = 0;
let animationFrame = 0;

function resizeCanvas() {
  if (!canvas || !context) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  canvasWidth = window.innerWidth;
  canvasHeight = window.innerHeight;
  canvas.width = Math.round(canvasWidth * dpr);
  canvas.height = Math.round(canvasHeight * dpr);
  canvas.style.width = `${canvasWidth}px`;
  canvas.style.height = `${canvasHeight}px`;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);

  const starCount = reduceMotion.matches ? 0 : canvasWidth < 700 ? 42 : 96;
  stars = Array.from({ length: starCount }, () => ({
    x: Math.random() * canvasWidth,
    y: Math.random() * canvasHeight,
    radius: Math.random() * 1.35 + 0.25,
    alpha: Math.random() * 0.6 + 0.2,
    speed: Math.random() * 0.0015 + 0.0004,
    phase: Math.random() * Math.PI * 2,
  }));
}

function drawStars(time: number) {
  if (!canvas || !context) return;
  context.clearRect(0, 0, canvasWidth, canvasHeight);
  for (const star of stars) {
    const alpha = star.alpha * (0.66 + Math.sin(time * star.speed + star.phase) * 0.34);
    context.beginPath();
    context.fillStyle = `rgba(220, 224, 255, ${Math.max(0.05, alpha)})`;
    context.shadowColor = 'rgba(146, 127, 255, .9)';
    context.shadowBlur = star.radius > 1 ? 7 : 3;
    context.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
    context.fill();
  }
  context.shadowBlur = 0;
  animationFrame = requestAnimationFrame(drawStars);
}

if (canvas && context) {
  resizeCanvas();
  if (!reduceMotion.matches) animationFrame = requestAnimationFrame(drawStars);
  window.addEventListener('resize', resizeCanvas, { passive: true });
  document.addEventListener('visibilitychange', () => {
    cancelAnimationFrame(animationFrame);
    if (!document.hidden && !reduceMotion.matches) animationFrame = requestAnimationFrame(drawStars);
  });
}

// Meteors and restrained pointer parallax
const meteorLayer = document.querySelector<HTMLElement>('#meteor-layer');
let meteorTimer = 0;

function spawnMeteor() {
  if (!meteorLayer || document.hidden || reduceMotion.matches) return;
  const meteor = document.createElement('i');
  meteor.style.setProperty('--meteor-left', `${4 + Math.random() * 60}%`);
  meteor.style.setProperty('--meteor-top', `${7 + Math.random() * 34}%`);
  meteor.style.setProperty('--meteor-duration', `${1.8 + Math.random() * 0.9}s`);
  meteorLayer.append(meteor);
  meteorLayer.dataset.spawnCount = String(Number(meteorLayer.dataset.spawnCount ?? '0') + 1);
  meteor.addEventListener('animationend', () => meteor.remove(), { once: true });
}

function queueMeteor(initial = false) {
  window.clearTimeout(meteorTimer);
  if (reduceMotion.matches) return;
  meteorTimer = window.setTimeout(() => {
    spawnMeteor();
    if (Math.random() > 0.72) window.setTimeout(spawnMeteor, 220 + Math.random() * 420);
    queueMeteor(false);
  }, initial ? 500 + Math.random() * 700 : 2800 + Math.random() * 2600);
}

queueMeteor(true);

window.addEventListener(
  'pointermove',
  (event) => {
    if (reduceMotion.matches || event.pointerType === 'touch') return;
    const x = (event.clientX / window.innerWidth - 0.5) * 2;
    const y = (event.clientY / window.innerHeight - 0.5) * 2;
    root.style.setProperty('--parallax-x', `${x * -9}px`);
    root.style.setProperty('--parallax-y', `${y * -7}px`);
  },
  { passive: true },
);

reduceMotion.addEventListener('change', () => window.location.reload());
