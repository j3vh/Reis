const NORTH_SEA_CENTER = [55.5, 2.5];
const NORTH_SEA_ZOOM = 6;
const MARKER_ANIMATION_MS = 900;

let map;
let boatMarker;
let traveledLine;
let upcomingLine;
let stopMarkersLayer;
let items = [];
let currentIndex = -1;
let playing = false;
let photoDelayMs = 4000;
let advanceTimer = null;
let currentVideoEl = null;
let markerAnimationFrame = null;

function initMap() {
  map = L.map("map").setView(NORTH_SEA_CENTER, NORTH_SEA_ZOOM);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 18,
  }).addTo(map);

  L.tileLayer("https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openseamap.org/">OpenSeaMap</a>',
    maxZoom: 18,
  }).addTo(map);

  traveledLine = L.polyline([], { color: "#4fa3d1", weight: 4 }).addTo(map);
  upcomingLine = L.polyline([], { color: "#4fa3d1", weight: 3, opacity: 0.35, dashArray: "6 8" }).addTo(map);
  stopMarkersLayer = L.layerGroup().addTo(map);

  const boatIcon = L.divIcon({
    html: "⛵",
    className: "boat-icon",
    iconSize: [28, 28],
  });
  boatMarker = L.marker(NORTH_SEA_CENTER, { icon: boatIcon });
}

function latLngOf(item) {
  return [item.lat, item.lon];
}

function formatCaption(item, index) {
  const date = new Date(item.timestamp);
  const formatted = isNaN(date) ? item.timestamp : date.toLocaleString("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  return `${formatted} · ${index + 1} / ${items.length}`;
}

function renderRoute() {
  if (items.length === 0) return;

  const latlngs = items.map(latLngOf);
  upcomingLine.setLatLngs(latlngs);
  boatMarker.setLatLng(latlngs[0]).addTo(map);

  items.forEach((item, index) => {
    const dot = L.circleMarker(latLngOf(item), {
      radius: 5,
      color: "#e8a24a",
      fillColor: "#e8a24a",
      fillOpacity: 0.8,
    }).addTo(stopMarkersLayer);
    dot.on("click", () => {
      pause();
      goToIndex(index);
    });
  });

  map.fitBounds(L.latLngBounds(latlngs), { padding: [30, 30] });
}

function animateMarkerTo(target) {
  const start = boatMarker.getLatLng();
  const startTime = performance.now();

  if (markerAnimationFrame) cancelAnimationFrame(markerAnimationFrame);

  function step(now) {
    const t = Math.min(1, (now - startTime) / MARKER_ANIMATION_MS);
    const lat = start.lat + (target[0] - start.lat) * t;
    const lon = start.lng + (target[1] - start.lng) * t;
    boatMarker.setLatLng([lat, lon]);
    if (t < 1) {
      markerAnimationFrame = requestAnimationFrame(step);
    }
  }
  markerAnimationFrame = requestAnimationFrame(step);
}

function clearScheduledAdvance() {
  if (advanceTimer) {
    clearTimeout(advanceTimer);
    advanceTimer = null;
  }
  if (currentVideoEl) {
    currentVideoEl.onended = null;
    currentVideoEl = null;
  }
}

function renderMedia(item) {
  const view = document.getElementById("media-view");
  view.innerHTML = "";

  if (item.type === "video") {
    const video = document.createElement("video");
    video.src = `data/media/${item.file}`;
    video.controls = true;
    video.autoplay = true;
    video.muted = true;
    view.appendChild(video);
    currentVideoEl = video;
    if (playing) {
      video.onended = () => advance();
    }
  } else {
    const img = document.createElement("img");
    img.src = `data/media/${item.file}`;
    img.alt = "";
    view.appendChild(img);
  }
}

function scheduleAdvanceForCurrentItem() {
  const item = items[currentIndex];
  if (!item) return;
  if (item.type === "photo") {
    advanceTimer = setTimeout(() => advance(), photoDelayMs);
  }
  // Video's plannen hun eigen advance via het 'ended' event in renderMedia().
}

function goToIndex(index) {
  if (items.length === 0) return;
  const clamped = Math.max(0, Math.min(items.length - 1, index));
  clearScheduledAdvance();
  currentIndex = clamped;

  const item = items[currentIndex];
  animateMarkerTo(latLngOf(item));
  map.panTo(latLngOf(item), { animate: true, duration: MARKER_ANIMATION_MS / 1000 });

  traveledLine.setLatLngs(items.slice(0, currentIndex + 1).map(latLngOf));
  upcomingLine.setLatLngs(items.slice(currentIndex).map(latLngOf));

  renderMedia(item);
  document.getElementById("media-caption").textContent = formatCaption(item, currentIndex);
  document.getElementById("scrubber").value = currentIndex;

  if (playing) {
    scheduleAdvanceForCurrentItem();
  }
}

function advance() {
  if (currentIndex >= items.length - 1) {
    pause();
    return;
  }
  goToIndex(currentIndex + 1);
}

function updatePlayButton() {
  document.getElementById("btn-play").textContent = playing ? "⏸" : "▶";
}

function play() {
  if (items.length === 0) return;
  if (currentIndex === -1) {
    currentIndex = 0;
  }
  playing = true;
  updatePlayButton();
  goToIndex(currentIndex);
}

function pause() {
  playing = false;
  clearScheduledAdvance();
  updatePlayButton();
}

function setupControls() {
  document.getElementById("btn-play").addEventListener("click", () => {
    if (playing) {
      pause();
    } else {
      play();
    }
  });

  document.getElementById("btn-prev").addEventListener("click", () => {
    pause();
    goToIndex(currentIndex === -1 ? 0 : currentIndex - 1);
  });

  document.getElementById("btn-next").addEventListener("click", () => {
    pause();
    goToIndex(currentIndex === -1 ? 0 : currentIndex + 1);
  });

  document.getElementById("scrubber").addEventListener("input", (event) => {
    pause();
    goToIndex(Number(event.target.value));
  });

  const delayInput = document.getElementById("photo-delay");
  const delayLabel = document.getElementById("photo-delay-value");
  delayInput.addEventListener("input", (event) => {
    photoDelayMs = Number(event.target.value) * 1000;
    delayLabel.textContent = `${event.target.value}s`;
  });
}

async function loadTimeline() {
  try {
    const res = await fetch("data/timeline.json", { cache: "no-store" });
    items = res.ok ? await res.json() : [];
  } catch (err) {
    items = [];
  }

  const emptyEl = document.getElementById("media-empty");
  if (items.length === 0) {
    emptyEl.textContent = "Nog geen foto's of video's toegevoegd.";
    document.getElementById("scrubber").max = 0;
    return;
  }

  emptyEl.remove();
  document.getElementById("scrubber").max = items.length - 1;
  renderRoute();
  goToIndex(0);
}

function init() {
  initMap();
  setupControls();
  loadTimeline();
}

document.addEventListener("gate-passed", init, { once: true });
