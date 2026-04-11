const PLAYER_IMAGES = [
  {
    id: "thumb",
    originalSrc: "pic/2ffb5324361dfd71d6a02701f0ff4250.jpg"
  },
  {
    id: "mouse",
    originalSrc: "pic/5ee9a04d8233202a53471842de44d5dd.jpg"
  },
  {
    id: "sun",
    originalSrc: "pic/5a4079af4cc865cb69aebe92fb33d086.png"
  },
  {
    id: "cat",
    originalSrc: "pic/65e6501f266153f6e844fe878132d475.jpg"
  }
];

const SEATS = ["top", "right", "bottom", "left"];
const SPIN_MS = 2200;
const CLICK_SOUND_FILES = [
  "music/1.mp3",
  "music/2.mp3",
  "music/3.mp3",
  "music/4.wav",
  "music/5.wav",
  "music/6.wav",
  "music/7.wav"
];
const ANIMATION_MODE_IDS = ["drum", "orbit", "burst"];

const STORAGE_KEYS = {
  soundEnabled: "sound_enabled",
  soundMode: "sound_mode",
  animationMode: "animation_mode",
  customAvatars: "custom_avatars"
};

const table = document.getElementById("table");
const drum = document.getElementById("drum");
const shuffleBtn = document.getElementById("shuffleBtn");
const soundToggleBtn = document.getElementById("soundToggleBtn");
const soundModeSelect = document.getElementById("soundModeSelect");
const animationModeSelect = document.getElementById("animationModeSelect");
const avatarUploadInput = document.getElementById("avatarUploadInput");
const clearAvatarsBtn = document.getElementById("clearAvatarsBtn");
const uploadStatus = document.getElementById("uploadStatus");

const tokens = [];
const customAvatarSources = new Array(PLAYER_IMAGES.length).fill(null);
const warmedImageCache = [];
const clickAudios = CLICK_SOUND_FILES.map((path) => {
  const src = encodeURI(path);
  const audio = new Audio(src);
  audio.preload = "auto";
  const item = {
    name: path,
    src,
    audio,
    usable: true
  };
  audio.addEventListener("error", () => {
    item.usable = false;
  });
  return item;
});

let activeClickItem = null;
let clickSoundCursor = 0;
let fallbackAudioCtx = null;
let soundEnabled = true;
let selectedSoundMode = "random";
let selectedAnimationMode = "random";
let animationSoundTimer = null;
let lastAnimationModeUsed = null;

function setUploadStatus(text) {
  if (!uploadStatus) {
    return;
  }
  uploadStatus.textContent = text;
}

function resolveAvatarSource(playerIndex) {
  return customAvatarSources[playerIndex] || PLAYER_IMAGES[playerIndex].originalSrc;
}

function setTokenAvatar(token, src) {
  const avatar = token.querySelector(".avatar-original");
  if (!avatar) {
    return;
  }
  avatar.style.backgroundImage = `url("${src}")`;
}

function applyAvatarSourcesToTokens() {
  tokens.forEach((token) => {
    const playerIndex = Number(token.dataset.playerIndex);
    setTokenAvatar(token, resolveAvatarSource(playerIndex));
  });
}

function loadPreferences() {
  try {
    const soundEnabledVal = localStorage.getItem(STORAGE_KEYS.soundEnabled);
    if (soundEnabledVal === "0") {
      soundEnabled = false;
    }

    const soundModeVal = localStorage.getItem(STORAGE_KEYS.soundMode);
    if (soundModeVal === "random" || CLICK_SOUND_FILES.includes(soundModeVal)) {
      selectedSoundMode = soundModeVal;
    }

    const animationModeVal = localStorage.getItem(STORAGE_KEYS.animationMode);
    if (animationModeVal === "random" || ANIMATION_MODE_IDS.includes(animationModeVal)) {
      selectedAnimationMode = animationModeVal;
    }

    const customAvatarsVal = localStorage.getItem(STORAGE_KEYS.customAvatars);
    if (customAvatarsVal) {
      const parsed = JSON.parse(customAvatarsVal);
      if (Array.isArray(parsed)) {
        parsed.slice(0, customAvatarSources.length).forEach((src, idx) => {
          if (typeof src === "string" && src.startsWith("data:image/")) {
            customAvatarSources[idx] = src;
          }
        });
      }
    }
  } catch {
    // Ignore local storage errors.
  }
}

function persistSoundEnabled() {
  try {
    localStorage.setItem(STORAGE_KEYS.soundEnabled, soundEnabled ? "1" : "0");
  } catch {
    // Ignore local storage errors.
  }
}

function persistSoundMode() {
  try {
    localStorage.setItem(STORAGE_KEYS.soundMode, selectedSoundMode);
  } catch {
    // Ignore local storage errors.
  }
}

function persistAnimationMode() {
  try {
    localStorage.setItem(STORAGE_KEYS.animationMode, selectedAnimationMode);
  } catch {
    // Ignore local storage errors.
  }
}

function persistCustomAvatars() {
  try {
    localStorage.setItem(STORAGE_KEYS.customAvatars, JSON.stringify(customAvatarSources));
  } catch {
    setUploadStatus("头像保存失败：浏览器存储空间不足");
  }
}

function syncSoundToggleUI() {
  if (!soundToggleBtn) {
    return;
  }
  soundToggleBtn.setAttribute("aria-pressed", soundEnabled ? "true" : "false");
  soundToggleBtn.textContent = soundEnabled ? "音效: 开" : "音效: 关";
}

function syncModeSelectUI() {
  if (soundModeSelect) {
    soundModeSelect.value = selectedSoundMode;
  }
  if (animationModeSelect) {
    animationModeSelect.value = selectedAnimationMode;
  }
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  if (!soundEnabled && activeClickItem && !activeClickItem.audio.paused) {
    activeClickItem.audio.pause();
    activeClickItem.audio.currentTime = 0;
  }
  persistSoundEnabled();
  syncSoundToggleUI();
}

function pickNextUsableClickItem() {
  if (clickAudios.length === 0) {
    return null;
  }

  for (let i = 0; i < clickAudios.length; i += 1) {
    const idx = (clickSoundCursor + i) % clickAudios.length;
    const item = clickAudios[idx];
    if (item.usable) {
      clickSoundCursor = (idx + 1) % clickAudios.length;
      return item;
    }
  }
  return null;
}

function pickSoundByMode() {
  if (selectedSoundMode === "random") {
    return pickNextUsableClickItem();
  }
  const exact = clickAudios.find((item) => item.name === selectedSoundMode && item.usable);
  return exact || pickNextUsableClickItem();
}

function playFallbackBeep() {
  if (!soundEnabled) {
    return;
  }
  try {
    fallbackAudioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    const now = fallbackAudioCtx.currentTime;
    const osc = fallbackAudioCtx.createOscillator();
    const gain = fallbackAudioCtx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(680, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.045, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);
    osc.connect(gain);
    gain.connect(fallbackAudioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.12);
  } catch {
    // Ignore fallback audio failures.
  }
}

function playSelectedClickSound() {
  if (!soundEnabled) {
    return;
  }

  const item = pickSoundByMode();
  if (!item) {
    playFallbackBeep();
    return;
  }

  if (activeClickItem && !activeClickItem.audio.paused) {
    activeClickItem.audio.pause();
    activeClickItem.audio.currentTime = 0;
  }

  activeClickItem = item;
  const { audio } = item;
  audio.currentTime = 0;
  const playPromise = audio.play();
  if (playPromise && typeof playPromise.catch === "function") {
    playPromise.catch(() => {
      item.usable = false;
      playSelectedClickSound();
    });
  }
}

function startAnimationSoundLoop() {
  if (animationSoundTimer != null) {
    window.clearInterval(animationSoundTimer);
  }
  if (!soundEnabled) {
    animationSoundTimer = null;
    return;
  }
  playSelectedClickSound();
  animationSoundTimer = window.setInterval(() => {
    playSelectedClickSound();
  }, 260);
}

function stopAnimationSoundLoop() {
  if (animationSoundTimer != null) {
    window.clearInterval(animationSoundTimer);
    animationSoundTimer = null;
  }
}

function makeToken(player, playerIndex) {
  const token = document.createElement("div");
  token.className = "player-token";
  token.dataset.id = player.id;
  token.dataset.playerIndex = String(playerIndex);
  token.dataset.x = "0";
  token.dataset.y = "0";
  token.dataset.scale = "1";
  token.dataset.rotate = "0";

  const original = document.createElement("div");
  original.className = "avatar avatar-original";
  original.style.backgroundImage = `url("${resolveAvatarSource(playerIndex)}")`;

  token.append(original);
  return token;
}

function tableCenterPoint() {
  return {
    x: table.clientWidth / 2,
    y: table.clientHeight / 2
  };
}

function seatRect(seatName) {
  const seat = table.querySelector(`[data-seat="${seatName}"]`);
  return {
    x: seat.offsetLeft,
    y: seat.offsetTop,
    width: seat.offsetWidth,
    height: seat.offsetHeight
  };
}

function seatTopLeft(seatName) {
  const rect = seatRect(seatName);
  return {
    x: rect.x,
    y: rect.y
  };
}

function tokenTopLeftForCenter(token, center) {
  const width = token.offsetWidth || 78;
  const height = token.offsetHeight || 78;
  return {
    x: center.x - width / 2,
    y: center.y - height / 2
  };
}

function writeState(token, x, y, scale = 1, rotate = 0) {
  token.dataset.x = String(x);
  token.dataset.y = String(y);
  token.dataset.scale = String(scale);
  token.dataset.rotate = String(rotate);
  token.style.transform = `translate(${x}px, ${y}px) scale(${scale}) rotate(${rotate}deg)`;
}

function syncTokenToSeat(token) {
  const rect = seatRect(token.dataset.seat);
  token.style.width = `${rect.width}px`;
  token.style.height = `${rect.height}px`;
  writeState(token, rect.x, rect.y, 1, 0);
}

function animateToken(token, nextX, nextY, options = {}) {
  const fromX = Number(token.dataset.x || 0);
  const fromY = Number(token.dataset.y || 0);
  const fromScale = Number(token.dataset.scale || 1);
  const fromRotate = Number(token.dataset.rotate || 0);
  const toScale = options.scale ?? 1;
  const toRotate = options.rotate ?? 0;

  const anim = token.animate(
    [
      { transform: `translate(${fromX}px, ${fromY}px) scale(${fromScale}) rotate(${fromRotate}deg)` },
      { transform: `translate(${nextX}px, ${nextY}px) scale(${toScale}) rotate(${toRotate}deg)` }
    ],
    {
      duration: options.duration ?? 800,
      easing: options.easing ?? "cubic-bezier(.2,.8,.2,1)",
      delay: options.delay ?? 0,
      fill: "forwards"
    }
  );

  return new Promise((resolve) => {
    anim.onfinish = () => {
      writeState(token, nextX, nextY, toScale, toRotate);
      resolve();
    };
  });
}

function shuffle(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function derangedSeatOrder(current) {
  let next = shuffle(current);
  let guard = 0;
  while (next.every((s, i) => s === current[i]) && guard < 8) {
    next = shuffle(current);
    guard += 1;
  }
  return next;
}

function randomPointAround(center, minRadius, maxRadius) {
  const angle = Math.random() * Math.PI * 2;
  const radius = minRadius + Math.random() * (maxRadius - minRadius);
  return {
    x: center.x + Math.cos(angle) * radius,
    y: center.y + Math.sin(angle) * radius
  };
}

async function animateModeDrum(center) {
  drum.classList.add("active");
  const tokenSize = tokens[0]?.offsetWidth || 74;
  const drumRadius = (drum.offsetWidth || 210) / 2 - tokenSize / 2 - 8;
  const minRadius = Math.max(10, drumRadius * 0.35);
  const maxRadius = Math.max(minRadius + 6, drumRadius * 0.95);
  const swirlUntil = Date.now() + SPIN_MS;

  while (Date.now() < swirlUntil) {
    await Promise.all(
      tokens.map((token) => {
        const point = randomPointAround(center, minRadius, maxRadius);
        const topLeft = tokenTopLeftForCenter(token, point);
        const rot = Math.random() * 90 - 45;
        const scl = 0.78 + Math.random() * 0.22;
        return animateToken(token, topLeft.x, topLeft.y, {
          duration: 190,
          easing: "linear",
          rotate: rot,
          scale: scl
        });
      })
    );
  }
}

async function animateModeOrbit(center) {
  drum.classList.add("active");
  const tokenSize = tokens[0]?.offsetWidth || 74;
  const radius = Math.max(36, (drum.offsetWidth || 210) / 2 - tokenSize / 2 - 18);
  const steps = Math.max(8, Math.floor(SPIN_MS / 180));
  const unit = (Math.PI * 2) / tokens.length;
  const phase = Math.random() * Math.PI * 2;

  for (let step = 0; step < steps; step += 1) {
    await Promise.all(
      tokens.map((token, idx) => {
        const angle = phase + step * 0.85 + idx * unit;
        const point = {
          x: center.x + Math.cos(angle) * radius,
          y: center.y + Math.sin(angle) * radius
        };
        const topLeft = tokenTopLeftForCenter(token, point);
        return animateToken(token, topLeft.x, topLeft.y, {
          duration: 175,
          easing: "linear",
          rotate: step * 20 + idx * 38,
          scale: 0.86 + (idx % 2) * 0.08
        });
      })
    );
  }
}

async function animateModeBurst(center) {
  drum.classList.add("active");
  const tokenSize = tokens[0]?.offsetWidth || 74;
  const maxRadius = Math.max(30, (drum.offsetWidth || 210) / 2 - tokenSize / 2 - 4);
  const minRadius = Math.max(12, maxRadius * 0.35);

  await Promise.all(
    tokens.map((token) => {
      const point = randomPointAround(center, minRadius, maxRadius);
      const topLeft = tokenTopLeftForCenter(token, point);
      return animateToken(token, topLeft.x, topLeft.y, {
        duration: 360,
        easing: "cubic-bezier(.18,.8,.26,1)",
        rotate: Math.random() * 160 - 80,
        scale: 1.1
      });
    })
  );

  const burstUntil = Date.now() + Math.max(300, SPIN_MS - 760);
  while (Date.now() < burstUntil) {
    await Promise.all(
      tokens.map((token) => {
        const point = randomPointAround(center, 8, maxRadius * 0.68);
        const topLeft = tokenTopLeftForCenter(token, point);
        return animateToken(token, topLeft.x, topLeft.y, {
          duration: 170,
          easing: "linear",
          rotate: Math.random() * 120 - 60,
          scale: 0.82 + Math.random() * 0.24
        });
      })
    );
  }
}

function resolveAnimationMode() {
  if (selectedAnimationMode !== "random") {
    return selectedAnimationMode;
  }

  let pick = ANIMATION_MODE_IDS[Math.floor(Math.random() * ANIMATION_MODE_IDS.length)];
  if (ANIMATION_MODE_IDS.length > 1 && pick === lastAnimationModeUsed) {
    pick = ANIMATION_MODE_IDS.find((id) => id !== lastAnimationModeUsed) || pick;
  }
  return pick;
}

async function runShuffleAnimation(mode, center) {
  if (mode === "orbit") {
    await animateModeOrbit(center);
    return;
  }
  if (mode === "burst") {
    await animateModeBurst(center);
    return;
  }
  await animateModeDrum(center);
}

function renderInitialTokens() {
  PLAYER_IMAGES.forEach((player, idx) => {
    const token = makeToken(player, idx);
    token.dataset.seat = SEATS[idx];
    table.appendChild(token);
    tokens.push(token);
  });
}

function warmupAssets() {
  PLAYER_IMAGES.forEach((player) => {
    const img = new Image();
    img.decoding = "async";
    img.src = player.originalSrc;
    warmedImageCache.push(img);
  });

  customAvatarSources.forEach((src) => {
    if (!src) {
      return;
    }
    const img = new Image();
    img.decoding = "async";
    img.src = src;
    warmedImageCache.push(img);
  });

  clickAudios.forEach((item) => {
    try {
      item.audio.load();
    } catch {
      item.usable = false;
    }
  });
}

function placeBySeats() {
  tokens.forEach((token) => {
    syncTokenToSeat(token);
  });
}

async function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("file read failed"));
    reader.readAsDataURL(file);
  });
}

async function compressDataUrl(dataUrl, maxEdge = 320, quality = 0.86) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
      const width = Math.max(1, Math.round(img.width * scale));
      const height = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("canvas unavailable"));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => reject(new Error("image decode failed"));
    img.src = dataUrl;
  });
}

async function handleAvatarUpload(event) {
  const files = Array.from(event.target.files || []).filter((file) => file.type.startsWith("image/"));
  if (files.length === 0) {
    setUploadStatus("未检测到图片文件");
    return;
  }

  const uploadCount = Math.min(files.length, PLAYER_IMAGES.length);
  shuffleBtn.disabled = true;
  setUploadStatus("正在处理头像...");

  try {
    for (let i = 0; i < uploadCount; i += 1) {
      const raw = await readFileAsDataURL(files[i]);
      const compressed = await compressDataUrl(raw);
      customAvatarSources[i] = compressed;
    }
    persistCustomAvatars();
    applyAvatarSourcesToTokens();
    setUploadStatus(`已更新 ${uploadCount} 张头像`);
  } catch {
    setUploadStatus("头像处理失败，请换一张图片重试");
  } finally {
    shuffleBtn.disabled = false;
    if (avatarUploadInput) {
      avatarUploadInput.value = "";
    }
  }
}

function clearCustomAvatars() {
  for (let i = 0; i < customAvatarSources.length; i += 1) {
    customAvatarSources[i] = null;
  }
  persistCustomAvatars();
  applyAvatarSourcesToTokens();
  setUploadStatus("已恢复默认头像");
}

async function shuffleSeats() {
  shuffleBtn.disabled = true;
  try {
    startAnimationSoundLoop();

    const center = tableCenterPoint();
    await Promise.all(
      tokens.map((token) => {
        const topLeft = tokenTopLeftForCenter(token, center);
        return animateToken(token, topLeft.x, topLeft.y, {
          duration: 520,
          scale: 0.9,
          rotate: 0
        });
      })
    );

    const mode = resolveAnimationMode();
    lastAnimationModeUsed = mode;
    await runShuffleAnimation(mode, center);

    const currentSeats = tokens.map((token) => token.dataset.seat);
    const nextSeats = derangedSeatOrder(currentSeats);
    tokens.forEach((token, idx) => {
      token.dataset.seat = nextSeats[idx];
    });

    await Promise.all(
      tokens.map((token) => {
        const target = seatTopLeft(token.dataset.seat);
        return animateToken(token, target.x, target.y, {
          duration: 820,
          easing: "cubic-bezier(.18,.82,.2,1)",
          scale: 1,
          rotate: 0
        });
      })
    );
  } finally {
    stopAnimationSoundLoop();
    drum.classList.remove("active");
    shuffleBtn.disabled = false;
  }
}

function boot() {
  loadPreferences();
  syncSoundToggleUI();
  syncModeSelectUI();
  warmupAssets();
  renderInitialTokens();
  applyAvatarSourcesToTokens();
  placeBySeats();

  shuffleBtn.addEventListener("click", shuffleSeats);
  soundToggleBtn?.addEventListener("click", toggleSound);
  soundModeSelect?.addEventListener("change", (event) => {
    selectedSoundMode = event.target.value;
    persistSoundMode();
  });
  animationModeSelect?.addEventListener("change", (event) => {
    selectedAnimationMode = event.target.value;
    persistAnimationMode();
  });
  avatarUploadInput?.addEventListener("change", handleAvatarUpload);
  clearAvatarsBtn?.addEventListener("click", clearCustomAvatars);
  window.addEventListener("resize", () => {
    placeBySeats();
  });
}

boot();
