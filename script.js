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
const CLICK_SOUND_CANDIDATES = [
  "music/1.mp3",
  "music/2.mp3",
  "music/3.mp3",
  "music/法国赌神 - 音效素材 免费下载 - .mp3",
  "music/法国赌神-我要验牌_mp3 - 音效库 - .mp3",
  "music/牌没有问题 音效素材 免费下载 - .mp3"
];

const table = document.getElementById("table");
const drum = document.getElementById("drum");
const shuffleBtn = document.getElementById("shuffleBtn");

const tokens = [];
const clickAudios = CLICK_SOUND_CANDIDATES.map((path) => {
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

function makeToken(player) {
  const token = document.createElement("div");
  token.className = "player-token";
  token.dataset.id = player.id;
  token.dataset.x = "0";
  token.dataset.y = "0";
  token.dataset.scale = "1";
  token.dataset.rotate = "0";

  const original = document.createElement("div");
  original.className = "avatar avatar-original";
  original.style.backgroundImage = `url("${player.originalSrc}")`;

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

function syncTokenToSeat(token) {
  const rect = seatRect(token.dataset.seat);
  token.style.width = `${rect.width}px`;
  token.style.height = `${rect.height}px`;
  writeState(token, rect.x, rect.y, 1, 0);
}

function writeState(token, x, y, scale = 1, rotate = 0) {
  token.dataset.x = String(x);
  token.dataset.y = String(y);
  token.dataset.scale = String(scale);
  token.dataset.rotate = String(rotate);
  token.style.transform = `translate(${x}px, ${y}px) scale(${scale}) rotate(${rotate}deg)`;
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

function playNextClickSound() {
  const item = pickNextUsableClickItem();
  if (!item) {
    return;
  }

  const audio = item.audio;

  if (activeClickItem && !activeClickItem.audio.paused) {
    activeClickItem.audio.pause();
    activeClickItem.audio.currentTime = 0;
  }

  activeClickItem = item;
  audio.currentTime = 0;
  const playPromise = audio.play();
  if (playPromise && typeof playPromise.catch === "function") {
    playPromise.catch(() => {
      item.usable = false;
      playNextClickSound();
    });
  }
}

function renderInitialTokens() {
  PLAYER_IMAGES.forEach((player, idx) => {
    const token = makeToken(player);
    token.dataset.seat = SEATS[idx];
    table.appendChild(token);
    tokens.push(token);
  });
}

function placeBySeats() {
  tokens.forEach((token) => {
    syncTokenToSeat(token);
  });
}

async function shuffleSeats() {
  shuffleBtn.disabled = true;
  try {
    playNextClickSound();

    const center = tableCenterPoint();
    await Promise.all(
      tokens.map((token) => {
        const topLeft = tokenTopLeftForCenter(token, center);
        return animateToken(token, topLeft.x, topLeft.y, {
          duration: 560,
          scale: 0.9,
          rotate: 0
        });
      })
    );

    drum.classList.add("active");
    const tokenSize = tokens[0]?.offsetWidth || 74;
    const drumRadius = (drum.offsetWidth || 210) / 2 - tokenSize / 2 - 8;
    const minRadius = Math.max(10, drumRadius * 0.35);
    const maxRadius = Math.max(minRadius + 6, drumRadius * 0.95);
    const swirlUntil = Date.now() + SPIN_MS;
    while (Date.now() < swirlUntil) {
      await Promise.all(
        tokens.map((token) => {
          const angle = Math.random() * Math.PI * 2;
          const radius = minRadius + Math.random() * (maxRadius - minRadius);
          const point = {
            x: center.x + Math.cos(angle) * radius,
            y: center.y + Math.sin(angle) * radius
          };
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
    drum.classList.remove("active");

    const currentSeats = tokens.map((t) => t.dataset.seat);
    const nextSeats = derangedSeatOrder(currentSeats);
    tokens.forEach((token, idx) => {
      token.dataset.seat = nextSeats[idx];
    });

    await Promise.all(
      tokens.map((token) => {
        const target = seatTopLeft(token.dataset.seat);
        return animateToken(token, target.x, target.y, {
          duration: 820,
          delay: 0,
          scale: 1,
          rotate: 0
        });
      })
    );

  } finally {
    drum.classList.remove("active");
    shuffleBtn.disabled = false;
  }
}

function boot() {
  renderInitialTokens();
  placeBySeats();
  shuffleBtn.addEventListener("click", shuffleSeats);
  window.addEventListener("resize", () => {
    placeBySeats();
  });
}

boot();
