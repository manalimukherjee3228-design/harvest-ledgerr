# Harvest Ledger — Crop Yield Prediction Using Historical Data

A real backend (Flask + scikit-learn) trained on `data/cleaned_crop_yield.csv`
(Indian crop records, 1997–2020: Crop, Season, State, Area, Annual Rainfall,
Fertilizer, Pesticide, Yield), serving the site you already have.

## Run it

```
pip install -r requirements.txt
python app.py
```

Then open the link the terminal prints — usually **http://127.0.0.1:5000**.

The Flask server serves both the API and the website itself, so you only
need to run one thing. Don't open `index.html` directly by double-clicking
it — it needs to be loaded through the server so it can reach `/api/...`.

First start takes ~10–15 seconds while the model trains on the CSV.

## What's on each page

- **Home** — hero, how-it-works, team/about, login (Sign up + Admin tabs).
  Name field only accepts letters and spaces — no numbers or symbols.
- **Prediction** — pick Crop, State, Season and Field area, then Predict.
  (Rainfall and fertilizer are sent to the model using typical averages
  behind the scenes — they're no longer asked on the form.) Results include
  a "Try a Scenario" button (adjust rainfall/fertilizer and see the yield
  move) and an "Estimate profit" calculator.
- **Analysis** — Crop view / State view / Year view charts, all built live
  from the CSV, plus a chatbot tab.
- **Dashboard** — smart recommendation, alternative crops, and prediction
  history (delete any row), based on your last prediction.
- **Profile** — shows who's logged in.
- **Dark mode** — the moon/sun icon next to "Admin" toggles a dark theme;
  the choice is remembered on your next visit.
- **Floating chatbot** — the round button, bottom-right, on every page.

## What's real vs. demo

- **Real / data-driven:** every crop, state and season in the dropdowns; the
  prediction model (a Random Forest trained on the actual CSV); the
  Crop/State/Year analysis charts; the dashboard's smart recommendations and
  alternative-crop suggestions (pulled from the dataset for crops without a
  hand-written tip); the chatbot's facts (season, top state, average yield).
- **Hand-written on top of the data:** detailed agronomy tips (fertilizer /
  irrigation / pest notes) for 14 common crops — Rice, Wheat, Maize,
  Sugarcane, Cotton, Bajra, Jowar, Barley, Gram, Soybean, Groundnut, Mustard,
  Potato, Onion. Every other crop in the dataset still gets a real,
  data-driven answer, just without the curated detail.
- **Still a demo, worth saying out loud if asked:** the dataset is
  state/year-level aggregate data (like a government agri-census), not
  individual farm records — so predictions are indicative at that
  granularity, not exact for one small plot. The chatbot is a rule-based +
  data-driven assistant, not a general-purpose LLM; `api_chat()` in
  `app.py` is the one place you'd wire in an OpenAI/Anthropic API key later
  for fully open-ended conversation.

## Project structure

```
app.py            — Flask backend: trains the model, serves the API + site
requirements.txt
data/
  cleaned_crop_yield.csv
index.html
style.css
script.js
```

## Team split (matches the original wireframes)

- **Rishika** — Home, navigation, login (`#page-home`, login modal)
- **Saba** — Prediction (`#page-prediction`, `/api/predict`)
- **Manali** — Analysis + chatbot (`#page-analysis`, `/api/crop-history`,
  `/api/state-history`, `/api/year-history`, `/api/chat`)
- **Amruta** — Dashboard (`#page-dashboard`, `/api/recommendation`,
  `/api/alternatives`)
