const root = document.documentElement;
const body = document.body;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

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

body.classList.add('js-ready');

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
let desiredPlaying = false;
let fadeFrame = 0;
let volume = Number.parseFloat(storage.get('kanzaler-music-volume') ?? '0.25');
if (!Number.isFinite(volume)) volume = 0.25;
volume = Math.min(1, Math.max(0, volume));
let muted = storage.get('kanzaler-music-muted') === 'true';

if (audio) {
  audio.volume = muted ? 0 : volume;
  audio.muted = muted;
}
if (musicVolume) musicVolume.value = String(Math.round(volume * 100));

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
    const progress = Math.min(1, (time - start) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    audio.volume = initial + (target - initial) * eased;
    if (progress < 1) fadeFrame = requestAnimationFrame(tick);
  };
  fadeFrame = requestAnimationFrame(tick);
}

async function startAudio() {
  if (!audio) return;
  desiredPlaying = true;
  audio.muted = muted;
  audio.volume = 0;
  try {
    await audio.play();
    if (muted) {
      updateMusicUi('muted');
      return;
    }
    fadeAudio(volume);
    updateMusicUi('playing');
  } catch {
    desiredPlaying = false;
    updateMusicUi('blocked');
  }
}

function pauseAudio() {
  if (!audio) return;
  desiredPlaying = false;
  audio.pause();
  updateMusicUi('paused');
}

musicToggle?.addEventListener('click', async () => {
  if (desiredPlaying && !muted) {
    pauseAudio();
    return;
  }

  if (muted) {
    muted = false;
    audio!.muted = false;
    storage.set('kanzaler-music-muted', 'false');
  }
  await startAudio();
});

musicVolume?.addEventListener('input', async () => {
  volume = Math.max(0, Math.min(1, Number(musicVolume.value) / 100));
  storage.set('kanzaler-music-volume', String(volume));
  muted = volume === 0;
  storage.set('kanzaler-music-muted', String(muted));

  if (!audio) return;
  audio.muted = muted;
  audio.volume = volume;
  if (muted) {
    updateMusicUi('muted');
  } else if (desiredPlaying) {
    updateMusicUi('playing');
  } else if (body.classList.contains('is-entered')) {
    await startAudio();
  }
});

audio?.addEventListener('ended', () => updateMusicUi('paused'));
updateMusicUi(muted ? 'muted' : 'paused');

// Entrance choreography
const enterButton = document.querySelector<HTMLButtonElement>('#enter-site');
const contentStage = document.querySelector<HTMLElement>('.content-stage');
if (contentStage) contentStage.inert = true;

async function enterSite() {
  if (body.classList.contains('is-entered')) return;
  window.scrollTo(0, 0);
  body.classList.add('is-entering');
  requestAnimationFrame(() => body.classList.add('is-entered'));
  if (contentStage) contentStage.inert = false;
  await startAudio();
  window.setTimeout(() => body.classList.remove('is-entering'), reduceMotion.matches ? 0 : 1500);
}

enterButton?.addEventListener('click', enterSite);

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

const sections = document.querySelectorAll<HTMLElement>('section[id]');
const navLinks = document.querySelectorAll<HTMLAnchorElement>('[data-nav-link]');
if ('IntersectionObserver' in window) {
  const sectionObserver = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      navLinks.forEach((link) => link.classList.toggle('active', link.dataset.navLink === visible.target.id));
    },
    { threshold: [0.2, 0.45, 0.7], rootMargin: '-18% 0px -55% 0px' },
  );
  sections.forEach((section) => sectionObserver.observe(section));
}

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

function queueMeteor() {
  window.clearTimeout(meteorTimer);
  if (reduceMotion.matches) return;
  meteorTimer = window.setTimeout(() => {
    if (body.classList.contains('is-entered') && !document.hidden && meteorLayer) {
      const meteor = document.createElement('i');
      meteor.style.setProperty('--meteor-left', `${15 + Math.random() * 65}%`);
      meteor.style.setProperty('--meteor-top', `${8 + Math.random() * 32}%`);
      meteorLayer.append(meteor);
      meteor.addEventListener('animationend', () => meteor.remove(), { once: true });
    }
    queueMeteor();
  }, 7000 + Math.random() * 5000);
}

queueMeteor();

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
