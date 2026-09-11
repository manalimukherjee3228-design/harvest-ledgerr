/* ============ MOCK DATA ============ */
const CROPS = ["Rice","Wheat","Maize","Sugarcane","Cotton"];
const STATES = ["Maharashtra","Punjab","Uttar Pradesh","Tamil Nadu","Karnataka"];
const YEARS = [2021,2022,2023,2024];

// base yield (t/ha) by crop & year — used for analysis charts and as the prediction baseline
const cropYieldData = {
  Rice:      {2021:3.1, 2022:3.4, 2023:3.6, 2024:3.9},
  Wheat:     {2021:2.8, 2022:3.0, 2023:3.1, 2024:3.3},
  Maize:     {2021:2.5, 2022:2.9, 2023:3.2, 2024:3.5},
  Sugarcane: {2021:68,  2022:70,  2023:73,  2024:76},
  Cotton:    {2021:1.4, 2022:1.5, 2023:1.6, 2024:1.7}
};

// crude state multipliers so state view looks distinct from crop view
const stateFactor = {Maharashtra:1.0, Punjab:1.12, "Uttar Pradesh":0.95, "Tamil Nadu":1.04, Karnataka:0.9};

const recommendations = {
  Rice:      {season:"Kharif (Jun–Nov)", fertilizer:"Urea + DAP, split in 3 doses across tillering, panicle and grain-fill stages.", irrigation:"Maintain 5 cm standing water through vegetative growth; drain 10 days before harvest.", care:"Watch for stem borer and blast during humid spells; keep bunds weed-free."},
  Wheat:     {season:"Rabi (Nov–Apr)", fertilizer:"NPK at sowing, top-dress nitrogen at first irrigation.", irrigation:"Light irrigation at crown-root initiation, then every 18–21 days.", care:"Monitor for yellow rust in cool, humid weather; avoid waterlogging."},
  Maize:     {season:"Kharif or Rabi (region dependent)", fertilizer:"Nitrogen-heavy feed, split at sowing, knee-high and tasseling.", irrigation:"Keep soil moist at silking — this is the most drought-sensitive stage.", care:"Scout for fall armyworm early; thin seedlings for even spacing."},
  Sugarcane: {season:"Year-round, best planted Feb–Mar", fertilizer:"Heavy nitrogen and potash split across the growth cycle.", irrigation:"Weekly irrigation in dry months; reduce as cane matures.", care:"Earth up regularly to support stalks and control weeds."},
  Cotton:    {season:"Kharif (Apr–Jun sowing)", fertilizer:"Balanced NPK with boron micronutrient for boll development.", irrigation:"Irrigate at flowering and boll formation; avoid excess at sowing.", care:"Watch for pink bollworm; rotate with non-host crops next season."}
};

const alternatives = {
  Rice:      [{name:"Maize", reason:"Similar rainfall needs with lower water demand in a dry year."}, {name:"Sugarcane", reason:"Suits the same heavy-soil, high-water fields if irrigation is reliable."}],
  Wheat:     [{name:"Maize", reason:"Better winter-to-spring flexibility if the sowing window slips."}, {name:"Cotton", reason:"Similar soil pH tolerance, different season for crop rotation."}],
  Maize:     [{name:"Rice", reason:"Comparable temperature range with higher local yield history."}, {name:"Wheat", reason:"Rotates well if this field's season shifts to Rabi."}],
  Sugarcane: [{name:"Rice", reason:"Handles the same water-retentive soils with a shorter cycle."}, {name:"Cotton", reason:"Lower water need — worth considering in a low-rainfall year."}],
  Cotton:    [{name:"Maize", reason:"Similar sowing window with less pest pressure this season."}, {name:"Wheat", reason:"Good rotation partner to break the pink bollworm cycle."}]
};

/* ============ STATE ============ */
let history = JSON.parse(localStorage.getItem("hl_history") || "[]");
let lastPrediction = JSON.parse(localStorage.getItem("hl_last") || "null");
let user = JSON.parse(localStorage.getItem("hl_user") || "null");
let charts = {};

function saveState(){
  localStorage.setItem("hl_history", JSON.stringify(history));
  localStorage.setItem("hl_last", JSON.stringify(lastPrediction));
  localStorage.setItem("hl_user", JSON.stringify(user));
}

/* ============ NAVIGATION ============ */
function goTo(name){
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.getElementById("page-" + name).classList.add("active");
  document.querySelectorAll(".navlink").forEach(l => l.classList.toggle("active", l.dataset.nav === name));
  document.getElementById("mainnav").classList.remove("open");
  window.scrollTo({top:0, behavior:"smooth"});
  if(name === "dashboard") renderDashboard();
  if(name === "profile") renderProfile();
  if(name === "analysis" && !charts.crop) viewCrop();
}
document.querySelectorAll("[data-nav]").forEach(el=>{
  el.addEventListener("click", e=>{ e.preventDefault(); goTo(el.dataset.nav); });
});
document.getElementById("hamburger").addEventListener("click", ()=>{
  document.getElementById("mainnav").classList.toggle("open");
});

/* ============ MODALS ============ */
function openModal(id){ document.getElementById(id + "Backdrop").classList.add("open"); }
function closeModal(id){ document.getElementById(id + "Backdrop").classList.remove("open"); }
document.querySelectorAll("[data-close]").forEach(b=> b.addEventListener("click", ()=> closeModal(b.dataset.close)));
document.querySelectorAll(".modal-backdrop").forEach(bd=>{
  bd.addEventListener("click", e=>{ if(e.target === bd) bd.classList.remove("open"); });
});
document.getElementById("openLogin").addEventListener("click", ()=> openModal("login"));
document.getElementById("openAdmin").addEventListener("click", ()=>{
  openModal("login");
  switchModalTab("admin");
});

function switchModalTab(tab){
  document.querySelectorAll(".modal-tab").forEach(t=> t.classList.toggle("active", t.dataset.modaltab === tab));
  document.getElementById("userForm").hidden = tab !== "signup";
  document.getElementById("adminForm").hidden = tab !== "admin";
}
document.querySelectorAll(".modal-tab").forEach(t=> t.addEventListener("click", ()=> switchModalTab(t.dataset.modaltab)));

document.getElementById("userForm").addEventListener("submit", e=>{
  e.preventDefault();
  user = {name: document.getElementById("u-name").value, email: document.getElementById("u-email").value, role:"user"};
  saveState();
  closeModal("login");
  document.getElementById("openLogin").textContent = user.name.split(" ")[0];
  goTo("profile");
});
document.getElementById("adminForm").addEventListener("submit", e=>{
  e.preventDefault();
  user = {name: document.getElementById("a-id").value, role:"admin"};
  saveState();
  closeModal("login");
  document.getElementById("openLogin").textContent = "Admin";
  goTo("profile");
});

/* ============ PREDICTION ============ */
const rainIn = document.getElementById("p-rain"), tempIn = document.getElementById("p-temp"),
      fertIn = document.getElementById("p-fert"), phIn = document.getElementById("p-ph");
rainIn.addEventListener("input", ()=> document.getElementById("rainOut").textContent = rainIn.value);
tempIn.addEventListener("input", ()=> document.getElementById("tempOut").textContent = tempIn.value);
fertIn.addEventListener("input", ()=> document.getElementById("fertOut").textContent = fertIn.value);
phIn.addEventListener("input", ()=> document.getElementById("phOut").textContent = phIn.value);

// demo formula: base historical average for the crop, nudged by how far inputs sit from an "ideal" midpoint
function estimateYield(crop, rain, temp, fert, ph){
  const base = cropYieldData[crop][2024];
  const rainScore = 1 - Math.min(Math.abs(rain-1000)/1000, 0.35);
  const tempScore = 1 - Math.min(Math.abs(temp-26)/26, 0.3);
  const fertScore = 1 - Math.min(Math.abs(fert-140)/200, 0.25);
  const phScore = 1 - Math.min(Math.abs(ph-6.5)/6.5, 0.2);
  const factor = (rainScore + tempScore + fertScore + phScore) / 4;
  return Math.max(base * (0.7 + factor * 0.55), base * 0.4);
}

document.getElementById("predictForm").addEventListener("submit", e=>{
  e.preventDefault();
  const crop = document.getElementById("p-crop").value;
  const state = document.getElementById("p-state").value;
  const season = document.getElementById("p-season").value;
  const rain = +rainIn.value, temp = +tempIn.value, fert = +fertIn.value, ph = +phIn.value;
  const yieldVal = estimateYield(crop, rain, temp, fert, ph);

  lastPrediction = {crop, state, season, rain, temp, fert, ph, yieldVal, date: new Date().toISOString()};
  history.unshift(lastPrediction);
  saveState();

  document.getElementById("resultEmpty").hidden = true;
  const body = document.getElementById("resultBody");
  body.hidden = false;
  document.getElementById("resCrop").textContent = crop;
  document.getElementById("resSeason").textContent = season + " · " + state;
  document.getElementById("resNum").textContent = yieldVal.toFixed(2);
});

document.getElementById("openWhatIf").addEventListener("click", ()=>{
  if(!lastPrediction) return;
  document.getElementById("wiRain").value = lastPrediction.rain;
  document.getElementById("wiFert").value = lastPrediction.fert;
  updateWhatIf();
  openModal("whatif");
});
function updateWhatIf(){
  const r = +document.getElementById("wiRain").value, f = +document.getElementById("wiFert").value;
  document.getElementById("wiRainVal").textContent = r;
  document.getElementById("wiFertVal").textContent = f;
  const y = estimateYield(lastPrediction.crop, r, lastPrediction.temp, f, lastPrediction.ph);
  document.getElementById("wiNum").textContent = y.toFixed(2);
  const delta = y - lastPrediction.yieldVal;
  const d = document.getElementById("wiDelta");
  d.textContent = (delta >= 0 ? "+" : "") + delta.toFixed(2) + " t/ha vs. your prediction";
  d.style.color = delta >= 0 ? "var(--green)" : "var(--terracotta)";
}
document.getElementById("wiRain").addEventListener("input", updateWhatIf);
document.getElementById("wiFert").addEventListener("input", updateWhatIf);

document.getElementById("openProfit").addEventListener("click", ()=>{
  if(!lastPrediction) return;
  updateProfit();
  openModal("profit");
});
function updateProfit(){
  const price = +document.getElementById("pr-price").value;
  const cost = +document.getElementById("pr-cost").value;
  const area = document.getElementById("p-area").value ? +document.getElementById("p-area").value : 1;
  const revenue = lastPrediction.yieldVal * price * area;
  const totalCost = cost * area;
  const profit = revenue - totalCost;
  document.getElementById("profitResult").innerHTML = `
    <div class="profit-row"><span>Estimated revenue</span><span>₹${Math.round(revenue).toLocaleString("en-IN")}</span></div>
    <div class="profit-row"><span>Cost of cultivation</span><span>₹${Math.round(totalCost).toLocaleString("en-IN")}</span></div>
    <div class="profit-row total"><span>Net profit</span><span>₹${Math.round(profit).toLocaleString("en-IN")}</span></div>`;
}
document.getElementById("pr-price").addEventListener("input", updateProfit);
document.getElementById("pr-cost").addEventListener("input", updateProfit);

/* ============ ANALYSIS TABS ============ */
document.querySelectorAll("#analysisTabs .tab").forEach(t=>{
  t.addEventListener("click", ()=>{
    document.querySelectorAll("#analysisTabs .tab").forEach(x=>x.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach(x=>x.classList.remove("active"));
    t.classList.add("active");
    document.getElementById("tab-" + t.dataset.tab).classList.add("active");
  });
});

function barChart(ctx, labels, data, color){
  return new Chart(ctx, {
    type:"bar",
    data:{labels, datasets:[{data, backgroundColor:color, borderRadius:3, maxBarThickness:46}]},
    options:{
      responsive:true,
      plugins:{legend:{display:false}},
      scales:{
        x:{grid:{display:false}, ticks:{font:{family:"IBM Plex Mono", size:11}}},
        y:{grid:{color:"#DEDAC4"}, ticks:{font:{family:"IBM Plex Mono", size:11}}}
      }
    }
  });
}

function viewCrop(){
  const crop = document.getElementById("a-crop").value;
  const data = YEARS.map(y => +cropYieldData[crop][y].toFixed(2));
  const best = YEARS[data.indexOf(Math.max(...data))];
  document.getElementById("cropMeta").innerHTML = `
    <div><span class="m-num">${crop}</span><span class="m-lbl">crop</span></div>
    <div><span class="m-num">${YEARS.length * 30}</span><span class="m-lbl">records</span></div>
    <div><span class="m-num">${best}</span><span class="m-lbl">best year</span></div>`;
  if(charts.crop) charts.crop.destroy();
  charts.crop = barChart(document.getElementById("cropChart"), YEARS, data, "#C79A3E");
}
document.getElementById("viewCropBtn").addEventListener("click", viewCrop);

function viewState(){
  const state = document.getElementById("a-state").value;
  const factor = stateFactor[state];
  const data = CROPS.map(c => +(cropYieldData[c][2024] * factor).toFixed(2));
  document.getElementById("stateMeta").innerHTML = `
    <div><span class="m-num">${state}</span><span class="m-lbl">state</span></div>
    <div><span class="m-num">${CROPS.length}</span><span class="m-lbl">crops tracked</span></div>
    <div><span class="m-num">2024</span><span class="m-lbl">latest season</span></div>`;
  if(charts.state) charts.state.destroy();
  charts.state = barChart(document.getElementById("stateChart"), CROPS, data, "#3C6E8F");
}
document.getElementById("viewStateBtn").addEventListener("click", viewState);

function viewYear(){
  const year = +document.getElementById("a-year").value;
  const data = CROPS.map(c => +cropYieldData[c][year].toFixed(2));
  document.getElementById("yearMeta").innerHTML = `
    <div><span class="m-num">${year}</span><span class="m-lbl">year</span></div>
    <div><span class="m-num">${CROPS.length}</span><span class="m-lbl">crops compared</span></div>`;
  if(charts.year) charts.year.destroy();
  charts.year = barChart(document.getElementById("yearChart"), CROPS, data, "#4B7A51");
}
document.getElementById("viewYearBtn").addEventListener("click", viewYear);

/* ============ CHATBOT ============ */
function chatReply(msg){
  const m = msg.toLowerCase();
  const crop = CROPS.find(c => m.includes(c.toLowerCase()));
  if(crop && (m.includes("fertiliz") || m.includes("fertilis"))) return `${crop}: ${recommendations[crop].fertilizer}`;
  if(crop && m.includes("season")) return `${crop} grows best in the ${recommendations[crop].season} season.`;
  if(crop && m.includes("irrigat") || crop && m.includes("water")) return `${crop} irrigation: ${recommendations[crop].irrigation}`;
  if(crop && (m.includes("trend") || m.includes("yield"))){
    const d = cropYieldData[crop];
    return `${crop} yield moved from ${d[2021]} t/ha in 2021 to ${d[2024]} t/ha in 2024 — a steady rise across the historical record.`;
  }
  if(crop) return `${crop} best season is ${recommendations[crop].season}. Ask me about its fertilizer, irrigation or yield trend for more detail.`;
  if(m.includes("hello") || m.includes("hi")) return "Hello — ask me about any crop's yield trend, fertilizer needs, or best planting season.";
  return "I can help with crop yield trends, fertilizer, irrigation and season questions — try naming a crop, e.g. \"wheat irrigation\".";
}
document.getElementById("chatForm").addEventListener("submit", e=>{
  e.preventDefault();
  const input = document.getElementById("chatInput");
  const val = input.value.trim();
  if(!val) return;
  const log = document.getElementById("chatLog");
  log.insertAdjacentHTML("beforeend", `<div class="chat-msg user">${escapeHtml(val)}</div>`);
  log.insertAdjacentHTML("beforeend", `<div class="chat-msg bot">${escapeHtml(chatReply(val))}</div>`);
  input.value = "";
  log.scrollTop = log.scrollHeight;
});
function escapeHtml(s){ return s.replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

/* ============ DASHBOARD ============ */
document.querySelectorAll(".dash-link").forEach(b=>{
  b.addEventListener("click", ()=>{
    document.querySelectorAll(".dash-link").forEach(x=>x.classList.remove("active"));
    document.querySelectorAll(".dash-panel").forEach(x=>x.classList.remove("active"));
    b.classList.add("active");
    document.getElementById("panel-" + b.dataset.panel).classList.add("active");
  });
});

function renderDashboard(){
  const ref = lastPrediction ? lastPrediction.crop : "Rice";
  const rec = recommendations[ref];
  document.getElementById("smartContent").innerHTML = `
    <p class="page-sub" style="margin-bottom:20px;">Based on your ${lastPrediction ? "latest prediction (" + ref + ")" : "default crop (Rice — run a prediction to personalize this)"}.</p>
    <div class="rec-grid">
      <div class="rec-item"><h4>Suitable season</h4><p>${rec.season}</p></div>
      <div class="rec-item"><h4>Fertilizer recommendation</h4><p>${rec.fertilizer}</p></div>
      <div class="rec-item"><h4>Irrigation recommendation</h4><p>${rec.irrigation}</p></div>
      <div class="rec-item"><h4>Crop-care advice</h4><p>${rec.care}</p></div>
    </div>`;

  const alts = alternatives[ref];
  document.getElementById("altContent").innerHTML =
    `<p class="page-sub" style="margin-bottom:6px;">Other crops that may suit this field, based on ${ref}'s profile.</p>` +
    alts.map(a => `<div class="alt-card"><div><h4>${a.name}</h4><p>${a.reason}</p></div><span class="alt-tag">alternative</span></div>`).join("");

  const body = document.getElementById("historyBody");
  document.getElementById("historyEmpty").hidden = history.length > 0;
  body.innerHTML = history.map((h, i) => `
    <tr>
      <td>${new Date(h.date).toLocaleDateString()}</td>
      <td>${h.crop}</td>
      <td>${h.yieldVal.toFixed(2)} t/ha</td>
      <td><button data-i="${i}" class="del-history">Delete</button></td>
    </tr>`).join("");
  document.querySelectorAll(".del-history").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      history.splice(+btn.dataset.i, 1);
      saveState();
      renderDashboard();
    });
  });
}

/* ============ PROFILE ============ */
function renderProfile(){
  const el = document.getElementById("profileContent");
  if(!user){
    el.innerHTML = `<p class="page-sub" style="margin-bottom:20px;">You're not logged in yet.</p><button class="btn btn-primary" id="profileLoginBtn">Log in</button>`;
    document.getElementById("profileLoginBtn").addEventListener("click", ()=> openModal("login"));
    return;
  }
  el.innerHTML = `
    <div class="profile-row"><span>Name</span><span>${user.name}</span></div>
    ${user.email ? `<div class="profile-row"><span>Email</span><span>${user.email}</span></div>` : ""}
    <div class="profile-row"><span>Role</span><span>${user.role === "admin" ? "Administrator" : "Farmer / user"}</span></div>
    <div class="profile-row"><span>Predictions made</span><span>${history.length}</span></div>`;
}

/* ============ INIT ============ */
if(user) document.getElementById("openLogin").textContent = user.role === "admin" ? "Admin" : user.name.split(" ")[0];
viewCrop();
