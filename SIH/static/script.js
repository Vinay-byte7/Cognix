console.log("hello from js!");
const start = Date.now();
console.log("time started! : ", start);

const VEG_MAP = {
  "1": "Banana Poovam", "2": "Banana Robusta", "3": "Guava White Flesh", "4": "Guava Red Flesh",
  "5": "Orange", "6": "Pineapple", "7": "Pear", "8": "Broad Field Beans",
  "9": "Lean Field Beans", "10": "French Country Beans", "11": "French Hybrid Beans", "12": "Cabbage",
  "13": "Muskmelon", "14": "Megha Tomato 3", "15": "Ripe Tomato",
  "16": "BIG Brown Potato", "17": "Small Brown Potato", "18": "Red Potato", "19": "BIG Onion",
  "20": "SMALL Onion", "21": "Ginger", "22": "Turmeric", "23": "Pepper",
  "24": "Small Garlic", "25": "Big Garlic"
};

// Maps keypad codes -> exact keys in the backend's `tagging` dict.
const CODE_TO_BACKEND_KEY = {
  "1": "banana-poovam",
  "2": "banana-robusta",
  "3": "Guava-white",
  "4": "Guava-red",
  "5": "Orange",
  "6": "pineapple",
  "7": "pear",
  "8": "beans-broad",
  "9": "beans-lean",
  "10": "french-beans-country",
  "11": "french-beans-hybrid",
  "12": "cabbage",
  "13": "muskmelon",
  "14": "megha-tomato-3",
  "15": "ripe-tomato",
  "16": "potato-brown-big",
  "17": "potato-brown-small",
  "18": "potato-red",
  "19": "onion-big",
  "20": "onion-small",
  "21": "ginger",
  "22": "turmeric",
  "23": "pepper",
  "24": "garlic-small",
  "25": "garlic-big"
};

// Formats a number as a fixed 1-decimal float for display, e.g. 0 -> "0.0"
function f(n){
  return Number(n).toFixed(1);
}

// Global variables — accessible from anywhere, not scoped to a single function.
var value = "";
var weight = null;

const welcomePage = document.getElementById("page-welcome");
const terminalPage = document.getElementById("page-terminal");
const welcomeBtn = document.getElementById("welcome-btn");

welcomeBtn.addEventListener("click", () => {
  welcomePage.classList.add("hidden");
  terminalPage.classList.add("active");
});

const chartGrid = document.getElementById("veg-chart-grid");
Object.keys(VEG_MAP).forEach(key => {
  const item = document.createElement("div");
  item.className = "veg-chart-item";
  item.innerHTML = `<span class="num">${key}</span><span class="name">${VEG_MAP[key]}</span>`;
  chartGrid.appendChild(item);
});

const screenMain = document.getElementById("screen-main");
const screenHeading = document.getElementById("screen-heading");
const screenSub = document.getElementById("screen-sub");
const codeDisplayLabel = document.getElementById("code-display-label");
const codeDisplayDigits = document.getElementById("code-display-digits");
const keypad = document.getElementById("keypad");

const CODE_MAX_DIGITS = 2;    // vegetable codes run 1–25
const WEIGHT_MAX_DIGITS = 4;  // weight isn't fixed-length, allow up to 9999 kg

let buffer = "";
let lastData = null;
let mode = "code";       // "code" -> entering the vegetable code, "weight" -> entering kg
let pendingVegKey = null; // vegetable code waiting on a weight before it's shown

function currentMaxDigits(){
  return mode === "weight" ? WEIGHT_MAX_DIGITS : CODE_MAX_DIGITS;
}

function renderDigits(){
  const max = currentMaxDigits();
  codeDisplayDigits.innerHTML = "";

  // Show one box per digit typed, plus one empty "cursor" box for the
  // next digit — grows and shrinks with the buffer instead of a fixed count.
  const slotCount = Math.min(Math.max(buffer.length + 1, 1), max);

  for(let i = 0; i < slotCount; i++){
    const slot = document.createElement("span");
    slot.className = "digit-slot";
    const digit = buffer[i];
    if(digit){
      slot.textContent = digit;
      slot.classList.add("filled");
    }
    if(i === buffer.length && buffer.length < max){
      slot.classList.add("cursor");
    }
    codeDisplayDigits.appendChild(slot);
  }
}

function resetScreen(){
  mode = "code";
  pendingVegKey = null;
  codeDisplayLabel.textContent = "Code";
  screenHeading.textContent = "Select a vegetable";
  screenSub.textContent = "Enter the code for the vegetable you'd like to check, then press Enter.";
  screenMain.classList.add("idle");
  screenMain.innerHTML = `<p class="idle-text" id="idle-text">Waiting for input…</p>`;
}

function askForWeight(vegKey){
  mode = "weight";
  pendingVegKey = vegKey;
  codeDisplayLabel.textContent = "Weight (kg)";
  screenHeading.textContent = VEG_MAP[vegKey];
  screenSub.textContent = "Enter the weight being stored, in kilograms, then press Enter.";
  screenMain.classList.add("idle");
  screenMain.innerHTML = `<p class="idle-text">Waiting for weight…</p>`;
}

function renderData(data){
  lastData = data;
  mode = "code";
  pendingVegKey = null;
  codeDisplayLabel.textContent = "Code";
  screenHeading.textContent = "Select a vegetable";
  screenSub.textContent = "Enter the code for the vegetable you'd like to check, then press Enter.";
  screenMain.classList.remove("idle");

  // Single-value boxes — [emoji, label, value, unit]
  const nutritionBoxes = [
    ["🔥", "Calories", f(data.calories), "kcal"],
    ["🍞", "Carbohydrates", f(data.carbs), "g"],
    ["🌾", "Dietary Fiber", f(data.fiber), "g"],
    ["🍬", "Sugar", f(data.sugar), "g"],
    ["🥩", "Protein", f(data.protein), "g"],
    ["🧈", "Fat", f(data.fat), "g"],
    ["🍊", "Vitamin C", f(data.vitaminC), "mg"],
    ["🥑", "Vitamin E", f(data.vitaminE), "mg"],
    ["🥬", "Vitamin B9", f(data.vitaminB9), "mcg"],
    ["🥕", "Vitamin A", f(data.vitaminA), "mcg"],
    ["⏳", "Days Remaining", f(data.daysRemaining), "days"]
  ].map(([emoji, label, value, unit]) => `
    <div class="info-card${label === "Days Remaining" ? " days-remaining" : ""}">
      <p class="label">${emoji} ${label}</p>
      <p class="value">${value} ${unit}</p>
    </div>
  `).join("");

  screenMain.innerHTML = `
    <h3 class="veg-title">${data.name}</h3>
    <div class="info-grid">
      <div class="info-card dual">
        <p class="label">🌡️ Temperature</p>
        <div class="dual-row"><span class="tag">To</span><span class="val">${f(data.to)}°C</span></div>
        <div class="dual-row"><span class="tag">Ts</span><span class="val">${f(data.ts)}°C</span></div>
      </div>
      <div class="info-card dual">
        <p class="label">💧 Humidity</p>
        <div class="dual-row"><span class="tag">Ho</span><span class="val">${f(data.ho)}%</span></div>
        <div class="dual-row"><span class="tag">Hs</span><span class="val">${f(data.hs)}%</span></div>
      </div>
      <div class="info-card">
        <p class="label">🍄 Fungus</p>
        <p class="value ${data.fungus ? "flag-yes" : "flag-no"}">${data.fungus ? "Yes" : "No"}</p>
      </div>
      ${nutritionBoxes}
      <div class="info-card weight-card">
        <p class="label">⚖️ Weight in storage</p>
        <p class="value">${f(data.weight)} kg</p>
      </div>
    </div>
  `;
}

function renderUnknown(key){
  screenMain.classList.remove("idle");
  screenMain.innerHTML = `<p class="status-line">No vegetable is stored under code ${key}. Check the directory beside the screen.</p>`;
}

// Builds an all-zero fallback data set — used only if you ever want to show
// something before the backend responds, or if backend data is unavailable.
function buildData(name, weightKg){
  return {
    name: name,
    to: 0.0, ts: 0.0, ho: 0.0, hs: 0.0, fungus: false,
    weight: weightKg || 0.0,
    calories: 0.0, carbs: 0.0, fiber: 0.0, sugar: 0.0,
    protein: 0.0, fat: 0.0,
    vitaminC: 0.0, vitaminE: 0.0, vitaminB9: 0.0, vitaminA: 0.0,
    daysRemaining: 0.0
  };
}

function submitCode(){
  if(buffer.length === 0) return;

  // The number the user typed on the keypad, stored in the global `value`.
  value = buffer;

  const key = String(parseInt(value, 10));

  buffer = "";
  renderDigits();

  if(!VEG_MAP[key]){
    renderUnknown(value);
    return;
  }

  // Don't show the data yet — ask for the stored weight first.
  askForWeight(key);
}

function submitWeight(){
  if(buffer.length === 0) return;

  // Store the typed weight in the global `weight` variable, same as own js.
  weight = parseInt(buffer, 10);

  const vegKey = pendingVegKey;
  buffer = "";
  renderDigits();

  // Return the keypad to "enter a code" mode right away; the result screen
  // shows a loading state until the backend responds.
  mode = "code";
  pendingVegKey = null;
  codeDisplayLabel.textContent = "Code";
  screenHeading.textContent = "Select a vegetable";
  screenSub.textContent = "Enter the code for the vegetable you'd like to check, then press Enter.";

  fetchVegetableData(vegKey, weight);
}

function handleKey(key){
  if(key === "backspace"){
    if(buffer.length > 0){
      buffer = buffer.slice(0, -1);
      renderDigits();
    }else{
      resetScreen();
    }
    return;
  }

  if(key === "enter"){
    if(mode === "weight"){
      submitWeight();
    }else{
      submitCode();
    }
    return;
  }

  if(buffer.length < currentMaxDigits()){
    buffer += key;
    renderDigits();
  }
}

keypad.addEventListener("click", (e) => {
  const btn = e.target.closest(".key");
  if(!btn) return;
  btn.classList.add("pressed");
  setTimeout(() => btn.classList.remove("pressed"), 120);
  handleKey(btn.dataset.key);
});

document.addEventListener("keydown", (e) => {
  if(!terminalPage.classList.contains("active")) return;
  if(/^[0-9]$/.test(e.key)){
    handleKey(e.key);
  }else if(e.key === "Backspace"){
    handleKey("backspace");
  }else if(e.key === "Enter"){
    handleKey("enter");
  }
});

renderDigits();

const fingerprint = document.getElementById("fingerprint");
fingerprint.addEventListener("click", () => {
  fingerprint.classList.add("pressed");
  setTimeout(() => fingerprint.classList.remove("pressed"), 400);
});

const pdfBtn = document.getElementById("pdf-download-btn");

pdfBtn.addEventListener("click", () => {
  const data = lastData || buildData("No vegetable selected");

  const { jsPDF } = window.jspdf || {};
  if(!jsPDF){
    alert("PDF library failed to load. Check your network connection.");
    return;
  }

  const doc = new jsPDF({ unit: "pt", format: "a5" });
  const now = new Date();

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("NER-CryoVault — Storage Report", 40, 50);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Generated ${now.toLocaleString()}`, 40, 68);

  doc.setDrawColor(180);
  doc.line(40, 80, 380, 80);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(data.name, 40, 108);

  const rows = [
    ["Temperature — optimum (To)", `${f(data.to)} °C`],
    ["Temperature — sensor (Ts)", `${f(data.ts)} °C`],
    ["Humidity — optimum (Ho)", `${f(data.ho)} %`],
    ["Humidity — sensor (Hs)", `${f(data.hs)} %`],
    ["Fungus detected", data.fungus ? "Yes" : "No"],
    ["Weight in storage", `${f(data.weight)} kg`],
    ["Calories", `${f(data.calories)} kcal`],
    ["Carbohydrates", `${f(data.carbs)} g`],
    ["Dietary Fiber", `${f(data.fiber)} g`],
    ["Sugar", `${f(data.sugar)} g`],
    ["Protein", `${f(data.protein)} g`],
    ["Fat", `${f(data.fat)} g`],
    ["Vitamin C", `${f(data.vitaminC)} mg`],
    ["Vitamin E", `${f(data.vitaminE)} mg`],
    ["Vitamin B9", `${f(data.vitaminB9)} mcg`],
    ["Vitamin A", `${f(data.vitaminA)} mcg`],
    ["Days Remaining", `${f(data.daysRemaining)} days`]
  ];

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  let y = 128;
  rows.forEach(([label, value]) => {
    doc.text(label, 40, y);
    doc.text(String(value), 260, y);
    y += 18;
  });

  doc.setFontSize(8);
  doc.setTextColor(140);
  doc.text("Placeholder values — wire in real sensor & nutrition data later.", 40, y + 14);

  doc.save(`cryovault-report-${data.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf`);
});

// ---------------------------------------------------------------------
// Backend integration — same technique as own js (localStorage-tracked
// elapsed time fed into /send_time), but scoped per vegetable code so
// multiple items each get their own clock instead of sharing one.
// ---------------------------------------------------------------------

// Returns elapsed days since this vegetable code was first weighed in.
function getElapsedDaysFor(vegKey){
  const storageKey = `veg_start_${vegKey}`;
  if(!localStorage.getItem(storageKey)){
    localStorage.setItem(storageKey, Date.now());
  }
  const startTs = parseInt(localStorage.getItem(storageKey), 10);
  const now = Date.now();
  return (now - startTs) / 86400000; // ms -> days
}

async function fetchVegetableData(vegKey, weightKg){
  const backendKey = CODE_TO_BACKEND_KEY[vegKey];

  screenMain.classList.add("idle");

  if(!backendKey){
    screenMain.innerHTML = `<p class="status-line">No backend data source is configured for ${VEG_MAP[vegKey]} yet. Add it to CODE_TO_BACKEND_KEY.</p>`;
    return;
  }

  screenMain.innerHTML = `<p class="idle-text">Fetching data…</p>`;

  const finalTime = getElapsedDaysFor(vegKey);

  try {
    // 1) Tell the backend the weight + real elapsed storage time (days) —
    //    same call shape as own js's /send_time POST.
    const timeRes = await fetch("/send_time", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ Data: finalTime, w: weightKg })
    });
    if(!timeRes.ok) throw new Error(`send_time failed (${timeRes.status})`);

    // 2) Pull the nutrient/sensor readings for this specific backend key —
    //    same call shape as own js's /NutrientsData/<key> GET.
    const dataRes = await fetch(`/NutrientsData/${encodeURIComponent(backendKey)}`);
    if(!dataRes.ok) throw new Error(`NutrientsData failed (${dataRes.status})`);
    const backendData = await dataRes.json();
    console.log(backendData);

    renderData(mapBackendToViewModel(VEG_MAP[vegKey], backendData, weightKg));
  } catch(err){
    console.error(err);
    screenMain.classList.remove("idle");
    screenMain.innerHTML = `<p class="status-line">Couldn't load data from the server (${err.message}). Please try again.</p>`;
  }
}

// Converts the backend's /NutrientsData response shape into the shape
// renderData() expects.
function mapBackendToViewModel(name, backendData, weightKg){
  return {
    name: name,
    // Backend only sends one temp/humidity value each — used for both slots.
    to: backendData.temp,
    ts: backendData.temp,
    ho: backendData.humidity,
    hs: backendData.humidity,
    fungus: !!backendData.fungus,
    weight: weightKg, // backend doesn't echo weight back, so use what was typed
    calories: backendData.calories,
    carbs: backendData.carbohydrates,
    fiber: backendData.diet,
    sugar: backendData.sugar,
    protein: backendData.protein,
    fat: backendData.fat,
    vitaminC: backendData.VitC,
    vitaminE: backendData.VitE,
    vitaminB9: backendData.VitB,
    vitaminA: backendData.VitA,
    daysRemaining: Math.max(0, backendData.days)
  };
}

// ---------------------------------------------------------------------
// Crate allocation — same as own js's crateData(), kept available in case
// the terminal UI wants to call it (e.g. after a weight is submitted).
// ---------------------------------------------------------------------
