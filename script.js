/* ============ THEME (light / dark) ============ */
const themeToggle = document.getElementById("themeToggle");
const themeIcon = document.getElementById("themeIcon");
const SUN_PATH = '<path d="M12 3a9 9 0 1 0 9 9c0-.46-.03-.92-.08-1.36A5.4 5.4 0 0 1 12 3Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>';
const MOON_PATH = '<circle cx="12" cy="12" r="4.2" stroke="currentColor" stroke-width="1.6"/><path d="M12 2.5v2.2M12 19.3v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>';

function applyTheme(t){
  document.documentElement.setAttribute("data-theme", t);
  themeIcon.innerHTML = t === "dark" ? SUN_PATH : MOON_PATH;
  localStorage.setItem("hl_theme", t);
}
applyTheme(localStorage.getItem("hl_theme") || "light");
themeToggle.addEventListener("click", ()=>{
  applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
});

/* ============ STATE ============ */
let history = JSON.parse(localStorage.getItem("hl_history") || "[]");
let lastPrediction = JSON.parse(localStorage.getItem("hl_last") || "null");
let user = JSON.parse(localStorage.getItem("hl_user") || "null");
let charts = {};
let YEARS_LIST = [];

function saveState(){
  localStorage.setItem("hl_history", JSON.stringify(history));
  localStorage.setItem("hl_last", JSON.stringify(lastPrediction));
  localStorage.setItem("hl_user", JSON.stringify(user));
}

async function api(path, opts){
  const res = await fetch(path, opts);
  if(!res.ok){
    const body = await res.json().catch(()=>({}));
    throw new Error(body.error || ("Request failed (" + res.status + ")"));
  }
  return res.json();
}

function populateSelectObjs(id, items, selectedValue){
  const el = document.getElementById(id);
  el.innerHTML = items.map(i =>
    `<option value="${i.value}"${i.value === selectedValue ? " selected" : ""}>${i.label}</option>`
  ).join("");
}

/* ============ LOAD METADATA FROM BACKEND ============ */
async function loadMeta(){
  try{
    const meta = await api("/api/meta");
    populateSelectObjs("p-crop", meta.crops, "Rice");
    populateSelectObjs("p-state", meta.states, "Punjab");
    populateSelectObjs("p-season", meta.seasons, "Kharif");
    populateSelectObjs("a-crop", meta.crops, "Rice");
    populateSelectObjs("a-state", meta.states, "Punjab");

    const yearsRes = await api("/api/years");
    YEARS_LIST = yearsRes.years;
    const latest = YEARS_LIST[YEARS_LIST.length - 1];
    document.getElementById("a-year").innerHTML =
      YEARS_LIST.map(y => `<option${y === latest ? " selected" : ""}>${y}</option>`).join("");

    viewCrop();
  }catch(err){
    document.body.insertAdjacentHTML("afterbegin",
      `<div class="server-warning">Can't reach the backend at this address. Make sure <code>python app.py</code> is running and you're viewing this page via that server (e.g. http://127.0.0.1:5000), not by opening index.html directly.</div>`);
  }
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

/* ---- Name field: letters (A-Z, a-z) and spaces ONLY, no digits/symbols ---- */
const nameInput = document.getElementById("u-name");
const ALLOWED_NAME = /[^A-Za-z ]/g;
nameInput.addEventListener("input", ()=>{
  const pos = nameInput.selectionStart;
  const before = nameInput.value;
  nameInput.value = before.replace(ALLOWED_NAME, "");
  const removed = before.length - nameInput.value.length;
  nameInput.setSelectionRange(pos - removed, pos - removed);
});
nameInput.addEventListener("keypress", e=>{
  if(!/[A-Za-z ]/.test(e.key)) e.preventDefault();
});
nameInput.addEventListener("paste", e=>{
  e.preventDefault();
  const text = (e.clipboardData || window.clipboardData).getData("text").replace(ALLOWED_NAME, "");
  document.execCommand("insertText", false, text);
});

document.getElementById("userForm").addEventListener("submit", e=>{
  e.preventDefault();
  const cleanName = nameInput.value.replace(ALLOWED_NAME, "").trim();
  if(!cleanName){ nameInput.focus(); return; }
  user = {name: cleanName, email: document.getElementById("u-email").value, role:"user"};
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
const pestIn = document.getElementById("p-pest");
pestIn.addEventListener("input", ()=> document.getElementById("pestOut").textContent = pestIn.value);

// rainfall & fertilizer are no longer collected from the person — the model
// still needs a value for them, so we send typical Indian averages as defaults
const DEFAULT_RAINFALL = 1200;   // mm/year
const DEFAULT_FERTILIZER = 120;  // kg/hectare

function currentInputs(){
  return {
    crop: document.getElementById("p-crop").value,
    state: document.getElementById("p-state").value,
    season: document.getElementById("p-season").value,
    area: +document.getElementById("p-area").value,
    rainfall: DEFAULT_RAINFALL,
    fertilizer: DEFAULT_FERTILIZER,
    pesticide: +pestIn.value,
  };
}

document.getElementById("predictForm").addEventListener("submit", async e=>{
  e.preventDefault();
  const errEl = document.getElementById("predictError");
  errEl.hidden = true;
  const btn = document.getElementById("predictBtn");
  const original = btn.textContent;
  btn.textContent = "Predicting…"; btn.disabled = true;

  const inputs = currentInputs();
  try{
    const res = await api("/api/predict", {
      method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(inputs)
    });
    lastPrediction = {...inputs, yieldVal: res.yield, date: new Date().toISOString()};
    history.unshift(lastPrediction);
    saveState();

    document.getElementById("resultEmpty").hidden = true;
    document.getElementById("resultBody").hidden = false;
    document.getElementById("resCrop").textContent = inputs.crop;
    document.getElementById("resSeason").textContent = inputs.season + " · " + inputs.state;
    document.getElementById("resNum").textContent = res.yield.toFixed(2);
  }catch(err){
    errEl.textContent = "Couldn't get a prediction: " + err.message;
    errEl.hidden = false;
  }finally{
    btn.textContent = original; btn.disabled = false;
  }
});

document.getElementById("openWhatIf").addEventListener("click", ()=>{
  if(!lastPrediction) return;
  document.getElementById("wiRain").value = lastPrediction.rainfall;
  document.getElementById("wiFert").value = lastPrediction.fertilizer;
  updateWhatIf();
  openModal("whatif");
});
async function updateWhatIf(){
  const r = +document.getElementById("wiRain").value, f = +document.getElementById("wiFert").value;
  document.getElementById("wiRainVal").textContent = r;
  document.getElementById("wiFertVal").textContent = f;
  try{
    const res = await api("/api/predict", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({...lastPrediction, rainfall:r, fertilizer:f})
    });
    document.getElementById("wiNum").textContent = res.yield.toFixed(2);
    const delta = res.yield - lastPrediction.yieldVal;
    const d = document.getElementById("wiDelta");
    d.textContent = (delta >= 0 ? "+" : "") + delta.toFixed(2) + " t/ha vs. your prediction";
    d.style.color = delta >= 0 ? "var(--green)" : "var(--terracotta)";
  }catch(err){ /* silently ignore mid-drag errors */ }
}
let wiTimer;
function debouncedWhatIf(){ clearTimeout(wiTimer); wiTimer = setTimeout(updateWhatIf, 180); }
document.getElementById("wiRain").addEventListener("input", debouncedWhatIf);
document.getElementById("wiFert").addEventListener("input", debouncedWhatIf);

document.getElementById("openProfit").addEventListener("click", ()=>{
  if(!lastPrediction) return;
  updateProfit();
  openModal("profit");
});
function updateProfit(){
  const price = +document.getElementById("pr-price").value;
  const cost = +document.getElementById("pr-cost").value;
  const area = lastPrediction.area || 1;
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
    data:{labels, datasets:[{data, backgroundColor:color, borderRadius:3, maxBarThickness:40}]},
    options:{
      responsive:true,
      plugins:{legend:{display:false}},
      scales:{
        x:{grid:{display:false}, ticks:{font:{family:"IBM Plex Mono", size:10}}},
        y:{grid:{color:"#DEDAC4"}, ticks:{font:{family:"IBM Plex Mono", size:11}}}
      }
    }
  });
}

async function viewCrop(){
  const crop = document.getElementById("a-crop").value;
  if(!crop) return;
  const res = await api("/api/crop-history?crop=" + encodeURIComponent(crop));
  document.getElementById("cropMeta").innerHTML = `
    <div><span class="m-num">${res.crop}</span><span class="m-lbl">crop</span></div>
    <div><span class="m-num">${res.records.toLocaleString("en-IN")}</span><span class="m-lbl">records</span></div>
    <div><span class="m-num">${res.best_year}</span><span class="m-lbl">best year</span></div>`;
  if(charts.crop) charts.crop.destroy();
  charts.crop = barChart(document.getElementById("cropChart"), res.years, res.values, "#C79A3E");
}
document.getElementById("viewCropBtn").addEventListener("click", viewCrop);

async function viewState(){
  const state = document.getElementById("a-state").value;
  if(!state) return;
  const res = await api("/api/state-history?state=" + encodeURIComponent(state));
  document.getElementById("stateMeta").innerHTML = `
    <div><span class="m-num">${res.state}</span><span class="m-lbl">state</span></div>
    <div><span class="m-num">${res.records.toLocaleString("en-IN")}</span><span class="m-lbl">records</span></div>
    <div><span class="m-num">${res.top_crops.slice(0,3).join(", ")}</span><span class="m-lbl">top crops grown</span></div>`;
  if(charts.state) charts.state.destroy();
  charts.state = barChart(document.getElementById("stateChart"), res.years, res.values, "#3C6E8F");
}
document.getElementById("viewStateBtn").addEventListener("click", viewState);

async function viewYear(){
  const year = document.getElementById("a-year").value;
  if(!year) return;
  const res = await api("/api/year-history?year=" + encodeURIComponent(year));
  document.getElementById("yearMeta").innerHTML = `
    <div><span class="m-num">${res.year}</span><span class="m-lbl">year</span></div>
    <div><span class="m-num">${res.records.toLocaleString("en-IN")}</span><span class="m-lbl">records that year</span></div>`;
  if(charts.year) charts.year.destroy();
  charts.year = barChart(document.getElementById("yearChart"), res.crops, res.values, "#4B7A51");
}
document.getElementById("viewYearBtn").addEventListener("click", viewYear);

/* ============ CHATBOT (talks to /api/chat — shared by Analysis tab + floating widget) ============ */
function escapeHtml(s){ return s.replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

function wireChatForm(formId, inputId, logId){
  document.getElementById(formId).addEventListener("submit", async e=>{
    e.preventDefault();
    const input = document.getElementById(inputId);
    const val = input.value.trim();
    if(!val) return;
    const log = document.getElementById(logId);
    log.insertAdjacentHTML("beforeend", `<div class="chat-msg user">${escapeHtml(val)}</div>`);
    input.value = "";
    log.scrollTop = log.scrollHeight;
    try{
      const res = await api("/api/chat", {
        method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({message: val})
      });
      log.insertAdjacentHTML("beforeend", `<div class="chat-msg bot">${escapeHtml(res.reply)}</div>`);
    }catch(err){
      log.insertAdjacentHTML("beforeend", `<div class="chat-msg bot">Sorry, I can't reach the server right now — make sure app.py is running.</div>`);
    }
    log.scrollTop = log.scrollHeight;
  });
}
wireChatForm("chatForm", "chatInput", "chatLog");
wireChatForm("fabForm", "fabInput", "fabLog");

const fabBtn = document.getElementById("fabChatBtn"), fabPanel = document.getElementById("fabPanel");
fabBtn.addEventListener("click", ()=> fabPanel.classList.toggle("open"));
document.getElementById("fabClose").addEventListener("click", ()=> fabPanel.classList.remove("open"));

/* ============ DASHBOARD ============ */
document.querySelectorAll(".dash-link").forEach(b=>{
  b.addEventListener("click", ()=>{
    document.querySelectorAll(".dash-link").forEach(x=>x.classList.remove("active"));
    document.querySelectorAll(".dash-panel").forEach(x=>x.classList.remove("active"));
    b.classList.add("active");
    document.getElementById("panel-" + b.dataset.panel).classList.add("active");
  });
});

async function renderDashboard(){
  const ref = lastPrediction ? lastPrediction.crop : "Rice";
  const refLabel = lastPrediction ? lastPrediction.crop : "Rice";

  try{
    const rec = await api("/api/recommendation?crop=" + encodeURIComponent(ref));
    document.getElementById("smartContent").innerHTML = `
      <p class="page-sub" style="margin-bottom:20px;">Based on your ${lastPrediction ? "latest prediction (" + rec.crop + ")" : "default crop (Rice — run a prediction to personalize this)"}.</p>
      <div class="rec-grid">
        <div class="rec-item"><h4>Suitable season</h4><p>${rec.season}</p></div>
        <div class="rec-item"><h4>Fertilizer recommendation</h4><p>${rec.fertilizer}</p></div>
        <div class="rec-item"><h4>Irrigation recommendation</h4><p>${rec.irrigation}</p></div>
        <div class="rec-item"><h4>Crop-care advice</h4><p>${rec.care}</p></div>
      </div>`;

    const altRes = await api("/api/alternatives?crop=" + encodeURIComponent(ref));
    document.getElementById("altContent").innerHTML =
      `<p class="page-sub" style="margin-bottom:6px;">Other crops that may suit this field, based on ${rec.crop}'s profile.</p>` +
      altRes.alternatives.map(a => `<div class="alt-card"><div><h4>${a.name}</h4><p>${a.reason}</p></div><span class="alt-tag">alternative</span></div>`).join("");
  }catch(err){
    document.getElementById("smartContent").innerHTML = `<p class="page-sub">Couldn't load recommendations — make sure the backend server is running.</p>`;
  }

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
loadMeta();
