"""
Harvest Ledger — backend
Trains a yield-prediction model on data/cleaned_crop_yield.csv and serves
both the API and the static frontend (index.html / style.css / script.js)
from a single Flask app.

Run:
    pip install -r requirements.txt
    python app.py
Then open:
    http://127.0.0.1:5000
"""
import os
import re
import random

import pandas as pd
from flask import Flask, jsonify, request, send_from_directory
from sklearn.ensemble import RandomForestRegressor
from sklearn.preprocessing import LabelEncoder

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(BASE_DIR, "data", "cleaned_crop_yield.csv")

app = Flask(__name__, static_folder=BASE_DIR, static_url_path="")

# ------------------------------------------------------------------
# Load + clean the dataset
# ------------------------------------------------------------------
df = pd.read_csv(DATA_PATH)
df.columns = [c.strip() for c in df.columns]
for col in ["Crop", "Season", "State"]:
    df[col] = df[col].astype(str).str.strip()
df = df.dropna(subset=["Crop", "Season", "State", "Area", "Annual_Rainfall",
                        "Fertilizer", "Pesticide", "Yield", "Crop_Year"])
df = df[df["Area"] > 0]

RAW_CROPS = sorted(df["Crop"].unique().tolist())
RAW_STATES = sorted(df["State"].unique().tolist())
RAW_SEASONS = sorted(df["Season"].unique().tolist())


def pretty(name: str) -> str:
    """Turn a raw dataset label into a clean display label."""
    s = " ".join(name.split())
    s = re.sub(r"&(?=\S)", "& ", s)
    s = s.title()
    s = s.replace(" And ", " and ").replace(" Of ", " of ")
    return s


CROP_DISPLAY = {c: pretty(c) for c in RAW_CROPS}
STATE_DISPLAY = {s: pretty(s) for s in RAW_STATES}
SEASON_DISPLAY = {s: pretty(s) for s in RAW_SEASONS}

# ------------------------------------------------------------------
# Train the model (Crop, Season, State, Area, Rainfall, Fertilizer,
# Pesticide -> Yield). Fertilizer/Pesticide in the source data are
# TOTALS for that record's area, so the API accepts per-hectare rates
# from the user and converts them before calling the model.
# ------------------------------------------------------------------
crop_enc = LabelEncoder().fit(df["Crop"])
season_enc = LabelEncoder().fit(df["Season"])
state_enc = LabelEncoder().fit(df["State"])

X = pd.DataFrame({
    "Crop": crop_enc.transform(df["Crop"]),
    "Season": season_enc.transform(df["Season"]),
    "State": state_enc.transform(df["State"]),
    "Area": df["Area"],
    "Annual_Rainfall": df["Annual_Rainfall"],
    "Fertilizer": df["Fertilizer"],
    "Pesticide": df["Pesticide"],
})
y = df["Yield"]

model = RandomForestRegressor(n_estimators=150, max_depth=16, random_state=42, n_jobs=-1)
model.fit(X, y)

# ------------------------------------------------------------------
# Curated agronomy notes for the crops most likely to be demoed.
# Any crop outside this set still gets a fully data-driven answer.
# ------------------------------------------------------------------
CURATED_TIPS = {
    "Rice":      {"fertilizer": "Split urea and DAP across tillering, panicle initiation and grain-fill.", "irrigation": "Keep 5 cm standing water through vegetative growth; drain 10 days before harvest.", "care": "Watch for stem borer and blast during humid spells; keep bunds weed-free."},
    "Wheat":     {"fertilizer": "NPK at sowing, top-dress nitrogen at first irrigation.", "irrigation": "Light irrigation at crown-root initiation, then every 18-21 days.", "care": "Monitor for yellow rust in cool, humid weather; avoid waterlogging."},
    "Maize":     {"fertilizer": "Nitrogen-heavy feed, split at sowing, knee-high and tasseling.", "irrigation": "Keep soil moist at silking - the most drought-sensitive stage.", "care": "Scout for fall armyworm early; thin seedlings for even spacing."},
    "Sugarcane": {"fertilizer": "Heavy nitrogen and potash split across the growth cycle.", "irrigation": "Weekly irrigation in dry months; reduce as cane matures.", "care": "Earth up regularly to support stalks and control weeds."},
    "Cotton(lint)": {"fertilizer": "Balanced NPK with boron micronutrient for boll development.", "irrigation": "Irrigate at flowering and boll formation; avoid excess at sowing.", "care": "Watch for pink bollworm; rotate with non-host crops next season."},
    "Bajra":     {"fertilizer": "Modest nitrogen split at sowing and tillering - bajra tolerates poor soil well.", "irrigation": "Mostly rainfed; one light irrigation at flowering helps in a dry spell.", "care": "Heat- and drought-tolerant; watch for downy mildew after heavy rain."},
    "Jowar":     {"fertilizer": "Light nitrogen and phosphorus at sowing, top-dress once around day 30.", "irrigation": "Mostly rainfed; irrigate once at the boot stage if rainfall is poor.", "care": "Watch for shoot fly early on and stem borer through the season."},
    "Barley":    {"fertilizer": "Lower nitrogen need than wheat - split at sowing and first irrigation.", "irrigation": "Two to three irrigations; more drought-tolerant than wheat.", "care": "Generally hardy; watch for yellow rust in wet, cool spells."},
    "Gram":      {"fertilizer": "Light phosphorus at sowing; avoid excess nitrogen, which delays flowering.", "irrigation": "One irrigation at pod-filling is usually enough.", "care": "Watch for pod borer; avoid waterlogging, which chickpea dislikes."},
    "Soyabean":  {"fertilizer": "Phosphorus and potash at sowing - soyabean fixes much of its own nitrogen.", "irrigation": "Rainfed in most belts; ensure drainage after heavy monsoon spells.", "care": "Watch for girdle beetle and yellow mosaic virus."},
    "Groundnut": {"fertilizer": "Gypsum at flowering supports pod development, alongside a base NPK dose.", "irrigation": "Even soil moisture at pegging and pod formation matters most.", "care": "Watch for leaf spot and rosette virus in a wet season."},
    "Rapeseed &mustard": {"fertilizer": "Sulfur-rich fertilizer improves oil content, alongside a base NPK dose.", "irrigation": "One irrigation at flowering and another at pod formation.", "care": "Watch for aphids as temperatures rise in late winter."},
    "Potato":    {"fertilizer": "Potash-heavy feed for tuber quality, split at planting and earthing-up.", "irrigation": "Frequent light irrigation; keep soil evenly moist, never waterlogged.", "care": "Earth up to prevent greening; watch for late blight in humid weather."},
    "Onion":     {"fertilizer": "Balanced NPK with sulfur, which improves bulb pungency and storage life.", "irrigation": "Regular light irrigation; stop 2-3 weeks before harvest for good curing.", "care": "Watch for purple blotch and thrips in dry, warm weather."},
}


def crop_facts(raw_crop: str):
    """Data-driven facts for any crop in the dataset (used by recs + chatbot)."""
    sub = df[df["Crop"] == raw_crop]
    if sub.empty:
        return None
    raw_season = sub.groupby("Season")["Yield"].mean().idxmax()
    state = sub.groupby("State")["Yield"].mean().idxmax()
    avg_yield = round(float(sub["Yield"].mean()), 2)
    latest_year = int(sub["Crop_Year"].max())
    return {
        "raw_season": raw_season,
        "season": SEASON_DISPLAY[raw_season],
        "best_state": STATE_DISPLAY[state],
        "avg_yield": avg_yield,
        "latest_year": latest_year,
        "records": int(len(sub)),
    }


# ------------------------------------------------------------------
# API: metadata for populating the frontend dropdowns
# ------------------------------------------------------------------
@app.route("/api/meta")
def api_meta():
    return jsonify({
        "crops": [{"value": c, "label": CROP_DISPLAY[c]} for c in RAW_CROPS],
        "states": [{"value": s, "label": STATE_DISPLAY[s]} for s in RAW_STATES],
        "seasons": [{"value": s, "label": SEASON_DISPLAY[s]} for s in RAW_SEASONS],
    })


# ------------------------------------------------------------------
# API: prediction
# ------------------------------------------------------------------
@app.route("/api/predict", methods=["POST"])
def api_predict():
    body = request.get_json(force=True)
    crop = body.get("crop")
    season = body.get("season")
    state = body.get("state")
    try:
        area = float(body.get("area", 1))
        rainfall = float(body.get("rainfall", 1200))
        fert_per_ha = float(body.get("fertilizer", 120))
        pest_per_ha = float(body.get("pesticide", 0.5))
    except (TypeError, ValueError):
        return jsonify({"error": "invalid numeric input"}), 400

    if crop not in RAW_CROPS or season not in RAW_SEASONS or state not in RAW_STATES:
        return jsonify({"error": "unknown crop, season or state"}), 400
    if area <= 0:
        return jsonify({"error": "area must be greater than zero"}), 400

    row = pd.DataFrame([{
        "Crop": crop_enc.transform([crop])[0],
        "Season": season_enc.transform([season])[0],
        "State": state_enc.transform([state])[0],
        "Area": area,
        "Annual_Rainfall": rainfall,
        "Fertilizer": fert_per_ha * area,
        "Pesticide": pest_per_ha * area,
    }])
    pred = float(model.predict(row)[0])
    return jsonify({"yield": round(max(pred, 0), 3)})


# ------------------------------------------------------------------
# API: historical analysis views
# ------------------------------------------------------------------
@app.route("/api/crop-history")
def api_crop_history():
    crop = request.args.get("crop")
    if crop not in RAW_CROPS:
        return jsonify({"error": "unknown crop"}), 400
    sub = df[df["Crop"] == crop]
    grouped = sub.groupby("Crop_Year")["Yield"].mean().round(3)
    years = sorted(int(y) for y in grouped.index)
    return jsonify({
        "crop": CROP_DISPLAY[crop],
        "years": years,
        "values": [float(grouped[y]) for y in years],
        "records": int(len(sub)),
        "best_year": int(grouped.idxmax()) if len(grouped) else None,
    })


@app.route("/api/state-history")
def api_state_history():
    state = request.args.get("state")
    if state not in RAW_STATES:
        return jsonify({"error": "unknown state"}), 400
    sub = df[df["State"] == state]
    grouped = sub.groupby("Crop_Year")["Yield"].mean().round(3)
    years = sorted(int(y) for y in grouped.index)
    top_crops = sub.groupby("Crop")["Area"].sum().sort_values(ascending=False).head(6)
    return jsonify({
        "state": STATE_DISPLAY[state],
        "years": years,
        "values": [float(grouped[y]) for y in years],
        "records": int(len(sub)),
        "top_crops": [CROP_DISPLAY[c] for c in top_crops.index],
    })


@app.route("/api/year-history")
def api_year_history():
    try:
        year = int(request.args.get("year"))
    except (TypeError, ValueError):
        return jsonify({"error": "invalid year"}), 400
    sub = df[df["Crop_Year"] == year]
    if sub.empty:
        return jsonify({"error": "no records for that year"}), 404
    top = sub.groupby("Crop")["Area"].sum().sort_values(ascending=False).head(12).index
    grouped = sub[sub["Crop"].isin(top)].groupby("Crop")["Yield"].mean().round(3)
    grouped = grouped.reindex(top)
    return jsonify({
        "year": year,
        "crops": [CROP_DISPLAY[c] for c in grouped.index],
        "values": [float(v) for v in grouped.values],
        "records": int(len(sub)),
    })


@app.route("/api/years")
def api_years():
    years = sorted(int(y) for y in df["Crop_Year"].unique())
    return jsonify({"years": years})


# ------------------------------------------------------------------
# API: dashboard — smart recommendation + alternative crops
# ------------------------------------------------------------------
@app.route("/api/recommendation")
def api_recommendation():
    crop = request.args.get("crop")
    if crop not in RAW_CROPS:
        return jsonify({"error": "unknown crop"}), 400
    facts = crop_facts(crop)
    tips = CURATED_TIPS.get(crop, {})
    label = CROP_DISPLAY[crop]
    return jsonify({
        "crop": label,
        "season": facts["season"],
        "fertilizer": tips.get("fertilizer") or (
            f"No curated tip yet for {label} — records show an average yield of {facts['avg_yield']} t/ha; "
            f"a balanced NPK dose suited to {facts['season']} planting is a reasonable starting point."),
        "irrigation": tips.get("irrigation") or (
            f"Match irrigation timing to the {facts['season']} season and local rainfall pattern; "
            f"{facts['best_state']} shows the strongest yields for {label} in our records."),
        "care": tips.get("care") or (
            f"No curated pest notes yet for {label} — consult local agricultural extension guidance for "
            f"season- and region-specific pest pressure."),
        "best_state": facts["best_state"],
        "avg_yield": facts["avg_yield"],
    })


@app.route("/api/alternatives")
def api_alternatives():
    crop = request.args.get("crop")
    if crop not in RAW_CROPS:
        return jsonify({"error": "unknown crop"}), 400
    facts = crop_facts(crop)
    candidates = df[(df["Season"] == facts["raw_season"]) & (df["Crop"] != crop)]
    top = candidates.groupby("Crop")["Area"].sum().sort_values(ascending=False).head(2).index.tolist()
    alts = [{
        "name": CROP_DISPLAY[c],
        "reason": f"Also widely grown in {facts['season']} with strong cultivated area in our records — "
                  f"worth considering as a rotation partner or substitute."
    } for c in top]
    return jsonify({"crop": CROP_DISPLAY[crop], "alternatives": alts})


# ------------------------------------------------------------------
# API: chatbot
# Layer 1: curated agronomy tips for well-known crops.
# Layer 2: data-driven facts pulled straight from the dataset for
#          every one of the 55 crops (season, top state, avg yield).
# Layer 3: general smalltalk / help fallback.
# ------------------------------------------------------------------
GREETINGS = ["hello", "hi", "hey", "namaste", "good morning", "good evening"]
THANKS = ["thank", "thanks", "shukriya", "dhanyavad"]

SMALLTALK = {
    "who are you": "I'm the Harvest Ledger assistant — ask me about any crop, state, or season, or just say hi.",
    "what can you do": "I can talk crop seasons, fertilizer, irrigation, pests, state-wise yield, or just chat generally — try asking about a crop or a state.",
    "how are you": "Doing well, thanks for asking! Ready to talk crops whenever you are.",
}


def chat_reply(message: str) -> str:
    m = message.lower().strip()
    if not m:
        return "Go ahead, ask me anything — a crop, a state, or just say hello."

    for key, resp in SMALLTALK.items():
        if key in m:
            return resp
    if any(g in m for g in GREETINGS):
        return random.choice([
            "Namaste! Ask me about any crop's season, fertilizer, irrigation or yield — or just chat.",
            "Hello! What's on your mind today — a crop question, or something else?",
        ])
    if any(t in m for t in THANKS):
        return "Happy to help — ask anytime."

    crop_hit = next((c for c in RAW_CROPS if c.lower() in m or CROP_DISPLAY[c].lower() in m), None)
    state_hit = next((s for s in RAW_STATES if s.lower() in m or STATE_DISPLAY[s].lower() in m), None)

    if crop_hit:
        label = CROP_DISPLAY[crop_hit]
        facts = crop_facts(crop_hit)
        tips = CURATED_TIPS.get(crop_hit)
        if ("fertiliz" in m or "fertilis" in m) and tips:
            return f"{label}: {tips['fertilizer']}"
        if "irrigat" in m or "water" in m:
            if tips:
                return f"{label} irrigation: {tips['irrigation']}"
            return f"{label} is typically grown in {facts['season']} — check local extension guidance for exact irrigation timing."
        if "care" in m or "pest" in m or "disease" in m:
            if tips:
                return f"{label} care: {tips['care']}"
            return f"I don't have curated pest notes for {label} yet, but our records show it's mostly grown in {facts['season']}, best yields in {facts['best_state']}."
        if "season" in m:
            return f"{label} is most commonly grown in the {facts['season']} season, based on our records."
        if "state" in m and not state_hit:
            return f"{label} performs best in {facts['best_state']} in our historical data."
        if "trend" in m or "yield" in m or "average" in m:
            return f"{label}'s average recorded yield is {facts['avg_yield']} t/ha across {facts['records']} records, most recently updated for {facts['latest_year']}."
        return (f"{label}: typically grown in {facts['season']}, with {facts['best_state']} showing the strongest "
                f"average yield in our records ({facts['avg_yield']} t/ha overall). Ask about its fertilizer, "
                f"irrigation, care or yield trend for more.")

    if state_hit:
        label = STATE_DISPLAY[state_hit]
        sub = df[df["State"] == state_hit]
        top_crop = sub.groupby("Crop")["Area"].sum().idxmax()
        return f"In {label}, {CROP_DISPLAY[top_crop]} has the largest recorded cultivated area in our dataset. Check the Analysis → State view tab for the full breakdown."

    return ("I can help with crop season, fertilizer, irrigation, pests, state-wise yield, or just casual chat — "
            "try naming a crop or state, e.g. \"wheat irrigation\" or \"tell me about Punjab\".")


@app.route("/api/chat", methods=["POST"])
def api_chat():
    body = request.get_json(force=True) or {}
    message = str(body.get("message", ""))
    return jsonify({"reply": chat_reply(message)})


# ------------------------------------------------------------------
# Serve the frontend
# ------------------------------------------------------------------
@app.route("/")
def index():
    return send_from_directory(BASE_DIR, "index.html")


if __name__ == "__main__":
    print(f"Loaded {len(df):,} records | {len(RAW_CROPS)} crops | {len(RAW_STATES)} states")
    app.run(debug=True, port=5000)
