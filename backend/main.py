import os
import json
import asyncio
import logging
import re
import shutil
from datetime import datetime, timedelta

import pytz
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from bson import ObjectId
from bson.errors import InvalidId
from dotenv import load_dotenv
from google import genai
from google.genai import types

from database import user_collection, log_collection, database
from models import UserCreate, AlternativeRequest, PromptRequest, PantryRequest, LogMealRequest

# Medical Vault: uploads directory
os.makedirs("uploads", exist_ok=True)

load_dotenv()

# ── Logging ──────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("poshanpal")

# ── Gemini client ────────────────────────────────────────────
api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    raise RuntimeError("GEMINI_API_KEY is not set in backend/.env")

client = genai.Client(api_key=api_key)
JSON_CONFIG   = types.GenerateContentConfig(response_mime_type="application/json")
GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.0-flash-lite"]

IST = pytz.timezone("Asia/Kolkata")

# ── New collection for longitudinal Medical Vault ────────────
report_collection = database.get_collection("medical_reports")
plan_collection   = database.get_collection("weekly_plans")

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)

# Serve saved report images
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# ── Helpers ──────────────────────────────────────────────────
def format_doc(doc: dict) -> dict:
    doc["id"] = str(doc["_id"])
    del doc["_id"]
    return doc

def parse_object_id(user_id: str) -> ObjectId:
    try:
        return ObjectId(user_id)
    except (InvalidId, Exception):
        raise HTTPException(status_code=400, detail="Invalid user ID format.")

def clean_json(raw: str) -> str:
    cleaned = re.sub(r"```json\s*", "", raw)
    cleaned = re.sub(r"```\s*", "", cleaned)
    return cleaned.strip()

def _is_quota_error(e: Exception) -> bool:
    return "429" in str(e) or "RESOURCE_EXHAUSTED" in str(e)

def _call_gemini(prompt: str, contents: list = None) -> str:
    payload = contents if contents else [prompt]
    log.info("━━━━━━━━━━━━ GEMINI REQUEST ━━━━━━━━━━━━")
    log.info("PROMPT: %s", prompt[:300])
    last_err = None
    for model in GEMINI_MODELS:
        try:
            log.info("Trying model: %s", model)
            response = client.models.generate_content(
                model=model, contents=payload, config=JSON_CONFIG
            )
            cleaned = clean_json(response.text)
            log.info("SUCCESS [%s] → %s", model, cleaned[:200])
            return cleaned
        except Exception as e:
            log.warning("  [%s] FAILED: %s", model, str(e)[:120])
            last_err = e
    log.error("ALL MODELS FAILED.")
    raise last_err

# ── Static fallbacks ─────────────────────────────────────────
FALLBACK_MEALS = {
    "North": [
        {"id": "f0", "name": "Dal Tadka + Roti",          "category": "Avg Meal",     "calories": 420, "protein": 18, "carbs": 58, "fats": 10, "emoji": "🫓", "youtube_query": "dal tadka recipe"},
        {"id": "f1", "name": "Palak Paneer",               "category": "Avg Meal",     "calories": 380, "protein": 20, "carbs": 22, "fats": 18, "emoji": "🟢", "youtube_query": "palak paneer recipe"},
        {"id": "f2", "name": "Moong Dal Chilla",           "category": "Small Meal",   "calories": 190, "protein": 11, "carbs": 25, "fats": 4,  "emoji": "🥞", "youtube_query": "moong dal chilla recipe"},
        {"id": "f3", "name": "Sprouts Chaat",              "category": "Small Meal",   "calories": 150, "protein": 9,  "carbs": 22, "fats": 2,  "emoji": "🫘", "youtube_query": "sprouts chaat recipe"},
        {"id": "f4", "name": "Roasted Makhana",            "category": "Tiny/Craving", "calories": 110, "protein": 4,  "carbs": 18, "fats": 3,  "emoji": "🟤", "youtube_query": "roasted makhana recipe"},
        {"id": "f5", "name": "Banana with Peanut Butter",  "category": "Tiny/Craving", "calories": 180, "protein": 5,  "carbs": 28, "fats": 7,  "emoji": "🍌", "youtube_query": "banana peanut butter snack"},
    ],
    "South": [
        {"id": "f0", "name": "Idli Sambar",                "category": "Small Meal",   "calories": 200, "protein": 7,  "carbs": 38, "fats": 2,  "emoji": "🍚", "youtube_query": "idli sambar recipe"},
        {"id": "f1", "name": "Pesarattu",                  "category": "Small Meal",   "calories": 220, "protein": 12, "carbs": 30, "fats": 5,  "emoji": "🥞", "youtube_query": "pesarattu recipe"},
        {"id": "f2", "name": "Curd Rice",                  "category": "Avg Meal",     "calories": 350, "protein": 10, "carbs": 55, "fats": 8,  "emoji": "🍚", "youtube_query": "curd rice recipe"},
        {"id": "f3", "name": "Kootu Curry",                "category": "Avg Meal",     "calories": 320, "protein": 13, "carbs": 42, "fats": 9,  "emoji": "🟢", "youtube_query": "kootu curry recipe"},
        {"id": "f4", "name": "Sundal",                     "category": "Tiny/Craving", "calories": 130, "protein": 6,  "carbs": 18, "fats": 3,  "emoji": "🫘", "youtube_query": "sundal recipe"},
        {"id": "f5", "name": "Ragi Ladoo",                 "category": "Tiny/Craving", "calories": 160, "protein": 4,  "carbs": 24, "fats": 5,  "emoji": "🟤", "youtube_query": "ragi ladoo recipe"},
    ],
    "Western": [
        {"id": "f0", "name": "Grilled Chicken Salad",      "category": "Avg Meal",     "calories": 380, "protein": 36, "carbs": 18, "fats": 14, "emoji": "🥗", "youtube_query": "grilled chicken salad recipe"},
        {"id": "f1", "name": "Egg White Omelette",         "category": "Small Meal",   "calories": 180, "protein": 22, "carbs": 4,  "fats": 6,  "emoji": "🥚", "youtube_query": "egg white omelette recipe"},
        {"id": "f2", "name": "Greek Yogurt Parfait",       "category": "Small Meal",   "calories": 220, "protein": 14, "carbs": 28, "fats": 5,  "emoji": "🫙", "youtube_query": "greek yogurt parfait recipe"},
        {"id": "f3", "name": "Quinoa Buddha Bowl",         "category": "Avg Meal",     "calories": 420, "protein": 18, "carbs": 52, "fats": 14, "emoji": "🥣", "youtube_query": "quinoa buddha bowl recipe"},
        {"id": "f4", "name": "Protein Smoothie",           "category": "Tiny/Craving", "calories": 180, "protein": 24, "carbs": 18, "fats": 3,  "emoji": "🥤", "youtube_query": "protein smoothie recipe"},
        {"id": "f5", "name": "Rice Cake with Avocado",     "category": "Tiny/Craving", "calories": 140, "protein": 3,  "carbs": 16, "fats": 8,  "emoji": "🥑", "youtube_query": "rice cake avocado recipe"},
    ],
}
FALLBACK_MEALS["All"] = FALLBACK_MEALS["North"]

_SUGGEST_FALLBACKS = {
    r"burger|cheeseburger|sandwich|patty|bun|fast.?food|junk": [
        {"name": "Whole Wheat Chicken Burger (Grilled)", "emoji": "🍔", "calories": 380, "protein": 28, "reasoning": "All the burger vibes — grilled chicken, whole wheat bun, fresh veggies, way less guilt.", "youtube_query": "healthy grilled chicken burger whole wheat recipe"},
        {"name": "Rajma Patty Wrap",                    "emoji": "🌯", "calories": 320, "protein": 14, "reasoning": "A desi burger alternative — spiced rajma patty in a multigrain wrap with mint chutney.", "youtube_query": "rajma patty wrap healthy recipe"},
        {"name": "Egg White Omelette Sandwich",          "emoji": "🥚", "calories": 260, "protein": 22, "reasoning": "High-protein egg white omelette stacked between multigrain toast.", "youtube_query": "egg white omelette sandwich healthy recipe"},
    ],
    r"italian|pizza|pasta|lasagna|risotto|carbonara": [
        {"name": "Whole Wheat Pasta Primavera",          "emoji": "🍝", "calories": 380, "protein": 14, "reasoning": "All the pasta comfort, high-fibre whole wheat, loaded with colourful vegetables.", "youtube_query": "healthy whole wheat pasta primavera recipe"},
        {"name": "Zucchini Noodles with Pesto",          "emoji": "🥒", "calories": 220, "protein": 8,  "reasoning": "Low-carb 'pasta' with homemade basil pesto and cherry tomatoes.", "youtube_query": "zucchini noodles pesto recipe healthy"},
        {"name": "Caprese Salad with Quinoa",            "emoji": "🍅", "calories": 310, "protein": 12, "reasoning": "Fresh tomato, basil, low-fat mozzarella on a bed of protein-packed quinoa.", "youtube_query": "caprese quinoa salad recipe"},
    ],
    r"chinese|noodles|fried.?rice|dim.?sum|manchurian": [
        {"name": "Vegetable Cauliflower Fried Rice",     "emoji": "🍚", "calories": 220, "protein": 9,  "reasoning": "Cauliflower rice gives you that fried-rice satisfaction with a fraction of the carbs.", "youtube_query": "cauliflower fried rice healthy recipe"},
        {"name": "Tofu & Veggie Stir Fry",               "emoji": "🥢", "calories": 280, "protein": 16, "reasoning": "High-protein tofu tossed with colourful veggies in a light soy-ginger sauce.", "youtube_query": "tofu vegetable stir fry healthy recipe"},
        {"name": "Steamed Momos (Whole Wheat)",          "emoji": "🥟", "calories": 250, "protein": 12, "reasoning": "Desi-Chinese classic made healthy with whole wheat wrappers and a veggie filling.", "youtube_query": "healthy whole wheat momos recipe"},
    ],
    r"sweet|chocolate|dessert|ice.?cream|cake|cookie|mithai|gulab|halwa": [
        {"name": "Dark Chocolate Banana Smoothie",       "emoji": "🍫", "calories": 240, "protein": 8,  "reasoning": "Rich chocolate hit with frozen banana base — zero added sugar, all the satisfaction.", "youtube_query": "healthy dark chocolate banana smoothie"},
        {"name": "Dates & Nut Energy Balls",             "emoji": "🟤", "calories": 180, "protein": 5,  "reasoning": "Natural sweetness from medjool dates with cashews and coconut — no refined sugar.", "youtube_query": "dates energy balls healthy recipe"},
        {"name": "Ragi Banana Pancakes",                 "emoji": "🥞", "calories": 210, "protein": 7,  "reasoning": "Finger-millet pancakes sweetened naturally with banana — calcium-rich and light.", "youtube_query": "ragi banana pancake healthy recipe"},
    ],
    r"spicy|hot|fiery|chilli|masala|biryani|curry": [
        {"name": "Spicy Egg Bhurji",                     "emoji": "🍳", "calories": 220, "protein": 18, "reasoning": "Protein-packed scrambled eggs loaded with green chillies and masala.", "youtube_query": "spicy egg bhurji healthy recipe"},
        {"name": "Chicken Tikka (Grilled)",              "emoji": "🍗", "calories": 280, "protein": 32, "reasoning": "Marinated in yogurt and spices then grilled — all the tikka heat, minimal fat.", "youtube_query": "healthy chicken tikka recipe"},
        {"name": "Masala Oats Khichdi",                  "emoji": "🥣", "calories": 260, "protein": 10, "reasoning": "Warming, spiced oats khichdi that fills you up without the heavy carb load.", "youtube_query": "masala oats khichdi recipe healthy"},
    ],
    r"crunchy|crispy|chips|fries|snack|namkeen": [
        {"name": "Roasted Chana",                        "emoji": "🫘", "calories": 130, "protein": 7,  "reasoning": "Ultra-crunchy, protein-rich roasted chickpeas — your guilt-free chip replacement.", "youtube_query": "roasted chana spicy recipe"},
        {"name": "Baked Sweet Potato Fries",             "emoji": "🍠", "calories": 160, "protein": 2,  "reasoning": "Crispy baked fries with natural sweetness and fibre — no oil bath required.", "youtube_query": "baked sweet potato fries recipe healthy"},
        {"name": "Flaxseed Crackers",                    "emoji": "🟫", "calories": 100, "protein": 4,  "reasoning": "Omega-3 rich crunchy crackers — satisfies the snack urge and supports your heart.", "youtube_query": "healthy flaxseed crackers recipe"},
    ],
}

_PANTRY_FALLBACKS = [
    {"pattern": r"egg|eggs",               "name": "Masala Egg Bhurji with Rice",       "emoji": "🍳", "calories": 370, "protein": 22, "instructions": "Sauté garlic and tomato in minimal oil until soft, add spices and stir 30s. Beat 2–3 eggs, pour in, scramble on medium heat until just set. Serve over steamed rice.", "missing_basics": "oil, onion (optional)"},
    {"pattern": r"paneer|cottage cheese",  "name": "Paneer Bhurji Wrap",                "emoji": "🧀", "calories": 340, "protein": 20, "instructions": "Crumble paneer and sauté with diced tomato, garlic, and spices for 5 minutes. Warm a roti, fill with the paneer mixture, roll tightly, and serve.", "missing_basics": "roti / flatbread"},
    {"pattern": r"chicken|murgh",          "name": "Quick Garlic Chicken Stir-fry",     "emoji": "🍗", "calories": 320, "protein": 34, "instructions": "Cut chicken into small pieces and marinate with spices for 5 minutes. Sauté garlic until golden, add chicken, cook on high heat 8–10 minutes. Finish with a squeeze of lemon.", "missing_basics": "oil, lemon"},
    {"pattern": r"potato|aloo",            "name": "Spiced Aloo Tomato Sabzi",          "emoji": "🥔", "calories": 280, "protein": 6,  "instructions": "Cube potatoes and boil until just tender, about 10 minutes. Sauté garlic and chopped tomatoes with spices until oil separates, then add potatoes and toss. Cook another 5 minutes.", "missing_basics": "oil, onion (optional)"},
    {"pattern": r"rice|chawal",            "name": "Egg & Vegetable Fried Rice",        "emoji": "🍚", "calories": 400, "protein": 16, "instructions": "Heat oil on high, scramble 2 eggs, push to side. Add rice and stir-fry 3 minutes. Mix in chopped tomato, garlic, salt and pepper, toss everything together.", "missing_basics": "oil, soy sauce (optional)"},
    {"pattern": r"dal|lentil|moong|chana|masoor", "name": "Simple Tadka Dal",           "emoji": "🍲", "calories": 300, "protein": 15, "instructions": "Pressure-cook or boil lentils until soft. In a small pan heat oil, add garlic and spices until fragrant, pour tadka over dal, stir and simmer 5 minutes. Serve with rice.", "missing_basics": "oil, cumin seeds"},
]

_PANTRY_DEFAULT = {"name": "Spiced Scrambled Eggs on Toast", "emoji": "🥚", "calories": 280, "protein": 18, "instructions": "Beat eggs with a pinch of salt, pepper, and any spice you have. Cook in a lightly oiled pan on medium heat, stirring gently until just set. Serve on toasted bread or with rice for a complete meal.", "missing_basics": "oil, bread or rice"}

_DEFAULT_SUGGESTIONS = [
    {"name": "Vegetable Oats Upma",  "emoji": "🥣", "calories": 220, "protein": 7,  "reasoning": "Light, filling, and packed with fibre to keep you energised.", "youtube_query": "Vegetable Oats Upma recipe"},
    {"name": "Moong Dal Chilla",     "emoji": "🥞", "calories": 190, "protein": 11, "reasoning": "High-protein, quick to make, and naturally satisfying.", "youtube_query": "Moong Dal Chilla healthy recipe"},
    {"name": "Roasted Makhana Bowl", "emoji": "🟤", "calories": 110, "protein": 4,  "reasoning": "Crunchy, guilt-free, and perfect as a light snack anytime.", "youtube_query": "Roasted Makhana snack recipe"},
]

def _pantry_fallback(ingredients: str) -> dict:
    lower = ingredients.lower()
    for entry in _PANTRY_FALLBACKS:
        if re.search(entry["pattern"], lower):
            return {k: v for k, v in entry.items() if k != "pattern"}
    return _PANTRY_DEFAULT

def _smart_fallback(user_prompt: str) -> list:
    lower = user_prompt.lower()
    for pattern, suggestions in _SUGGEST_FALLBACKS.items():
        if re.search(pattern, lower):
            return suggestions
    return _DEFAULT_SUGGESTIONS

# ══════════════════════════════════════════════════════════════
#  ENDPOINTS
# ══════════════════════════════════════════════════════════════

# ── 1. USERS ──────────────────────────────────────────────────
@app.post("/api/users/")
async def create_user(user_data: UserCreate):
    data = user_data.model_dump()
    w, h_cm, age = data["current_weight"], data["height_cm"], data["age"]

    # ── Mifflin-St Jeor BMR (gender-neutral average offset: (5 + -161) / 2 = -78) ──
    bmr  = 10 * w + 6.25 * h_cm - 5 * age - 78
    # Lightly-active multiplier (desk job + occasional walk — typical urban Indian)
    tdee = round(bmr * 1.375)

    # Calorie target: deficit for loss, surplus for gain, maintenance otherwise
    cw, tw = data["current_weight"], data["target_weight"]
    if cw > tw:
        target_cal = max(1200, tdee - 400)   # moderate deficit, never crash diet
    elif cw < tw:
        target_cal = tdee + 300              # lean bulk
    else:
        target_cal = tdee                    # maintenance

    h = h_cm / 100
    data["bmi"]                      = round(w / (h * h), 2) if h > 0 else 0
    data["tdee"]                     = tdee
    data["target_cal"]               = round(target_cal)
    data["target_protein"]           = round(w * 1.6)   # 1.6 g/kg — evidence-based for active adults
    data["clinical_data"]            = None
    data["master_clinical_directive"] = None
    new = await user_collection.insert_one(data)
    created = await user_collection.find_one({"_id": new.inserted_id})
    return format_doc(created)

# ── 2. MEDICAL VAULT: PROFILE MERGER ─────────────────────────
@app.post("/api/scan-report/")
async def scan_medical_report(
    user_id: str = Form(...),
    file: UploadFile = File(...)
):
    ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Invalid file type. Please upload a JPG, PNG, or WEBP image.")

    oid = parse_object_id(user_id)

    # Fetch user first — needed to load existing clinical_profile for merging
    user = await user_collection.find_one({"_id": oid})
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    # Securely persist the image to the vault
    timestamp = datetime.now(IST).strftime("%Y%m%d%H%M%S")
    safe_filename = re.sub(r"[^\w.\-]", "_", file.filename or "report.jpg")
    filename = f"{user_id}_{timestamp}_{safe_filename}"
    filepath = os.path.join("uploads", filename)

    with open(filepath, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    if os.path.getsize(filepath) > 10 * 1024 * 1024:
        os.remove(filepath)
        raise HTTPException(status_code=400, detail="File too large. Maximum 10 MB.")

    with open(filepath, "rb") as f:
        image_bytes = f.read()
    image_part = types.Part.from_bytes(data=image_bytes, mime_type=file.content_type)

    # Pass existing profile so Gemini MERGES rather than overwrites
    existing_profile = user.get("clinical_profile") or {}
    existing_profile_str = json.dumps(existing_profile) if existing_profile else "None — this is the patient's first report."
    user_lang = user.get("language", "en-IN")

    prompt = f"""
You are an elite Clinical Pathologist and Dietitian AI.

EXISTING PATIENT PROFILE (what we already know):
{existing_profile_str}

Analyze the attached new medical document (lab report, prescription, or clinical note).

Your job is to MERGE the new data with the existing profile:
- Update marker values if a newer reading is found (update trend: "up", "down", or "stable" vs previous).
- Add any new chronic conditions discovered (e.g. "Hypertension", "Pre-Diabetic"). Never remove existing ones.
- If a marker already exists and has a new reading, update its value and compute the trend.
- Include ALL markers seen — both abnormal and normal.

Return STRICT JSON (no markdown, no code fences):
{{
  "is_medical_report": boolean,
  "document_name": "string (e.g. Lipid Profile, CBC, Clinical Summary, Prescription)",
  "date_on_report": "YYYY-MM-DD or unknown",
  "updated_profile": {{
    "chronic_conditions": ["Hypertension", "Pre-Diabetic"],
    "latest_markers": [
      {{
        "name": "LDL Cholesterol",
        "value": 160,
        "unit": "mg/dL",
        "status": "High",
        "trend": "up",
        "description": "Stage 1 elevation. Increases risk of arterial plaque and cardiac events."
      }},
      {{
        "name": "HDL Cholesterol",
        "value": 52,
        "unit": "mg/dL",
        "status": "Normal",
        "trend": "stable",
        "description": ""
      }}
    ],
    "overall_health_score": 62,
    "ai_protocols": [
      "Restrict sodium intake to under 1500 mg/day to manage Hypertension.",
      "Eliminate refined sugars and white rice to prevent Pre-Diabetic progression.",
      "Increase soluble fibre (oats, flaxseed) to actively reduce LDL Cholesterol."
    ],
    "master_directive": "Patient has high LDL and Hypertension. Strictly avoid fried foods, refined sugars, and sodium. Prioritise oats, leafy greens, fatty fish, and DASH-diet principles."
  }}
}}

LANGUAGE INSTRUCTION: Write ALL text values — 'description', 'ai_protocols' (every item in the array), and 'master_directive' — in the language matching BCP-47 code: {user_lang}. All JSON keys must remain in English.

Set "is_medical_report": false ONLY if the image is completely unrelated to health
(e.g. a food photo, ID card, receipt, or blank page).
"""
    # keep_file flag — True only on full success. finally block cleans up on any failure.
    keep_file = False
    try:
        loop = asyncio.get_running_loop()
        raw = await asyncio.wait_for(
            loop.run_in_executor(None, _call_gemini, prompt, [prompt, image_part]),
            timeout=60.0,
        )
        analysis = json.loads(raw)

        if not analysis.get("is_medical_report"):
            raise HTTPException(
                status_code=400,
                detail="Image doesn't appear to contain medical information. Please upload a blood test, prescription, or doctor's note.",
            )

        updated_profile = analysis.get("updated_profile", {})
        directive = updated_profile.get("master_directive")

        # Build backward-compat abnormal_markers list for the meals endpoint
        abnormal_compat = [
            m for m in updated_profile.get("latest_markers", [])
            if m.get("status", "").lower() not in ("normal", "")
        ]

        # Store the document in the vault collection
        report_doc = {
            "user_id":       user_id,
            "upload_date":   datetime.now(IST),
            "file_url":      f"http://127.0.0.1:8000/uploads/{filename}",
            "document_name": analysis.get("document_name"),
            "date_on_report": analysis.get("date_on_report"),
            "extracted_data": updated_profile,
            # Keep old field for any legacy reads
            "data": {
                "report_type":        analysis.get("document_name"),
                "overall_health_score": updated_profile.get("overall_health_score"),
                "abnormal_markers":   abnormal_compat,
                "normal_markers":     [m for m in updated_profile.get("latest_markers", []) if m.get("status", "").lower() == "normal"],
                "clinical_directive": directive,
            },
        }
        await report_collection.insert_one(report_doc)

        # Persist merged profile + backward-compat clinical_data on the user document
        await user_collection.update_one(
            {"_id": oid},
            {"$set": {
                "clinical_profile":          updated_profile,
                "master_clinical_directive": directive,
                "clinical_data": {
                    "abnormal_markers":  abnormal_compat,
                    "clinical_directive": directive,
                },
            }}
        )

        updated_user = await user_collection.find_one({"_id": oid})
        log.info("Profile merged for user %s | score=%s | conditions=%s",
                 user_id, updated_profile.get("overall_health_score"),
                 updated_profile.get("chronic_conditions"))
        keep_file = True
        return {"message": "Clinical profile updated!", "user": format_doc(updated_user)}

    except HTTPException:
        raise
    except json.JSONDecodeError as e:
        log.error("JSON parse error: %s", e)
        raise HTTPException(status_code=500, detail="Gemini returned malformed data. Please try with a clearer image.")
    except asyncio.TimeoutError:
        log.error("Medical scan: Gemini timed out after 60s.")
        raise HTTPException(status_code=504, detail="Analysis timed out. Please try again.")
    except Exception as e:
        log.error("Medical scan error: %s", e)
        if _is_quota_error(e):
            raise HTTPException(
                status_code=503,
                detail="API quota exhausted. Go to aistudio.google.com/apikey → copy key from 'Default Gemini Project' row → paste into backend/.env and restart.",
            )
        raise HTTPException(status_code=500, detail="Failed to analyze report. Please ensure the image is clear and well-lit.")
    finally:
        if not keep_file and os.path.exists(filepath):
            try:
                os.remove(filepath)
            except OSError as exc:
                log.warning("Could not clean up orphaned upload %s: %s", filepath, exc)

# ── 3. MEDICAL VAULT: HISTORY FOR GRAPHS ──────────────────────
@app.get("/api/medical-history/{user_id}")
async def get_medical_history(user_id: str):
    cursor = report_collection.find({"user_id": user_id}).sort("upload_date", -1)
    reports = []
    async for doc in cursor:
        doc["id"] = str(doc["_id"])
        del doc["_id"]
        doc["upload_date"] = doc["upload_date"].strftime("%b %d, %Y %H:%M")
        reports.append(doc)
    return {"reports": reports}

# ── 3b. DOCTOR'S BRIEFING ─────────────────────────────────────
@app.get("/api/doctor-briefing/{user_id}")
async def get_doctor_briefing(user_id: str):
    oid = parse_object_id(user_id)
    user = await user_collection.find_one({"_id": oid})
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    # Today's calorie intake
    today_str = datetime.now(IST).strftime("%Y-%m-%d")
    pipeline = [
        {"$match": {"user_id": user_id, "date": today_str}},
        {"$group": {"_id": None, "total_cal": {"$sum": "$calories"}}},
    ]
    totals = await log_collection.aggregate(pipeline).to_list(length=1)
    calories_today = totals[0]["total_cal"] if totals else 0

    profile = user.get("clinical_profile", {})
    profile_str = json.dumps(profile, indent=2) if profile else "No clinical profile on record."
    user_lang = user.get("language", "en-IN")

    prompt = (
        f"You are a medical assistant AI. Synthesize the following patient data into a concise, one-page clinical summary "
        f"a busy doctor can read in under two minutes.\n"
        f"Use plain text with clear section headers (e.g. ### Vitals). DO NOT give medical advice — only summarise the data.\n\n"
        f"PATIENT DATA:\n"
        f"- Name: {user.get('name')}\n"
        f"- BMI: {user.get('bmi')}\n"
        f"- Daily Calorie Target: {user.get('target_cal')} kcal\n"
        f"- Today's Calorie Intake: {calories_today} kcal\n"
        f"- Allergies: {', '.join(user.get('allergies', [])) or 'None'}\n"
        f"- Active AI Dietary Directive: {user.get('master_clinical_directive') or 'None'}\n"
        f"- Full Clinical Profile:\n{profile_str}\n\n"
        f"LANGUAGE INSTRUCTION: Write the 'briefing_markdown' value in the language matching BCP-47 code: {user_lang}. "
        "The JSON key 'briefing_markdown' must remain in English.\n"
        "Return a STRICT JSON object: {\"briefing_markdown\": \"your summary text here\"}. "
        "No markdown code fences around the JSON itself."
    )

    try:
        loop = asyncio.get_running_loop()
        raw = await asyncio.wait_for(
            loop.run_in_executor(None, _call_gemini, prompt),
            timeout=45.0,
        )
        return json.loads(raw)
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Briefing generation timed out. Please try again.")
    except Exception as e:
        log.error("Doctor's Briefing failed: %s", e)
        raise HTTPException(status_code=500, detail="Failed to generate clinical summary.")

# ── 4. STATEFUL 7-DAY MEAL PLAN ───────────────────────────────
DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

def _meals_to_weekly_fallback(meals: list) -> dict:
    """Wrap a flat meal list into a 7-day structure for graceful fallback."""
    days = []
    for i, day in enumerate(DAYS_OF_WEEK):
        # Rotate through the flat meals so each day gets a different trio
        offset = (i * 3) % len(meals)
        trio = [meals[(offset + j) % len(meals)] for j in range(3)]
        days.append({"day": day, "meals": trio})
    return {"days": days}

@app.get("/api/meals/{user_id}")
async def get_or_generate_meals(user_id: str, force_refresh: bool = False):
    oid = parse_object_id(user_id)
    user = await user_collection.find_one({"_id": oid})
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    now = datetime.now(IST)
    directive = user.get("master_clinical_directive") or (
        user.get("clinical_data", {}) or {}
    ).get("clinical_directive")

    # ── Return the cached plan if it's still valid and not a forced refresh ──
    if not force_refresh:
        current_plan = await plan_collection.find_one(
            {"user_id": user_id, "valid_until": {"$gte": now}},
            sort=[("created_at", -1)],
        )
        if current_plan:
            current_plan["id"] = str(current_plan["_id"])
            del current_plan["_id"]
            log.info("Returning cached 7-day plan for user %s", user_id)
            return {"plan": current_plan, "user": format_doc(user)}

    # ── Generate a fresh 7-day plan ──
    region       = user.get("region", "All")
    user_lang    = user.get("language", "en-IN")
    allergies_str = ", ".join(user["allergies"]) if user["allergies"] else "none"
    cuisine_map   = {
        "North":   "North Indian (roti, dal, paneer, sabzi)",
        "South":   "South Indian (rice, sambar, idli, dosa)",
        "All":     "pan-Indian mixing North and South",
        "Western": "Western / continental (salads, wraps, grilled proteins, bowls)",
    }
    cuisine_desc = cuisine_map.get(region, "Indian")

    # Abnormal markers for per-meal clinical links
    abnormal_markers = (user.get("clinical_data") or {}).get("abnormal_markers", [])
    if not abnormal_markers:
        abnormal_markers = [
            m for m in (user.get("clinical_profile") or {}).get("latest_markers", [])
            if m.get("status", "").lower() not in ("normal", "")
        ]
    markers_context = ""
    if directive and abnormal_markers:
        marker_lines = ", ".join(
            f"{m['name']} {m['value']} {m.get('unit','')} ({m.get('status','Abnormal')})"
            for m in abnormal_markers if m.get("value") is not None
        )
        markers_context = f"Patient's abnormal markers: {marker_lines}.\n"

    if directive:
        meal_keys = (
            "name, category, calories(int), protein(int), carbs(int), fats(int), emoji, youtube_query, "
            "clinical_problem(\"exact marker targeted e.g. LDL: 160 mg/dL (High)\"), "
            "clinical_reasoning(\"one sentence on how this meal helps that marker\")"
        )
        clinical_block = f"\n⚠ CRITICAL MEDICAL DIRECTIVE (OBEY IMPLICITLY): {directive}\n"
    else:
        meal_keys = (
            "name, category, calories(int), protein(int), carbs(int), fats(int), emoji, youtube_query, "
            "reasoning(\"one sentence on why this is a healthy choice\")"
        )
        clinical_block = ""

    prompt = (
        f"You are a master clinical nutritionist. Create a complete 7-DAY meal plan for {cuisine_desc} cuisine.\n"
        f"Allergies to STRICTLY avoid: {allergies_str}.\n"
        f"Daily target: {user['target_cal']} kcal, {user['target_protein']}g protein.\n"
        f"{markers_context}"
        f"{clinical_block}"
        f"LANGUAGE INSTRUCTION: Translate only the 'name' value of each meal into the language matching BCP-47 code: {user_lang}. "
        "All other keys ('category', 'youtube_query', etc.) must remain in English.\n"
        "Return a JSON object with one key 'days' — an array of exactly 7 day-objects.\n"
        "Each day-object: {\"day\": \"Monday\", \"meals\": [3 meal objects]}\n"
        f"Categories per day (exactly one of each): 'Small Meal', 'Avg Meal', 'Tiny/Craving'.\n"
        f"Each meal object keys: {meal_keys}.\n"
        "Vary meals across days — no two days should have the same breakfast.\n"
        "Return ONLY the JSON object. No markdown, no code fences."
    )

    log.info("Generating new 7-day plan — user: %s | directive: %s", user.get("name"), bool(directive))

    try:
        loop = asyncio.get_running_loop()
        raw = await asyncio.wait_for(
            loop.run_in_executor(None, _call_gemini, prompt),
            timeout=60.0,
        )
        plan_data = json.loads(raw)
        if "days" not in plan_data:
            raise ValueError("Gemini response missing 'days' key")

        # Expire any existing plans and save the new one
        await plan_collection.delete_many({"user_id": user_id})
        plan_doc = {
            "user_id":          user_id,
            "created_at":       now,
            "valid_until":      now + timedelta(days=7),
            "directive_used":   directive or "",
            "plan_data":        plan_data,
        }
        result    = await plan_collection.insert_one(plan_doc)
        saved     = await plan_collection.find_one({"_id": result.inserted_id})
        saved["id"] = str(saved["_id"])
        del saved["_id"]

        log.info("7-day plan saved for user %s (expires %s)", user_id, plan_doc["valid_until"].date())
        return {"plan": saved, "user": format_doc(user)}

    except asyncio.TimeoutError:
        log.error("7-day plan: Gemini timed out → fallback")
        fallback = FALLBACK_MEALS.get(region, FALLBACK_MEALS["All"])
        plan_doc = {"plan_data": _meals_to_weekly_fallback(fallback), "fallback": True}
        return {"plan": plan_doc, "user": format_doc(user)}
    except Exception as e:
        log.error("7-day plan generation failed: %s", e)
        if _is_quota_error(e):
            raise HTTPException(status_code=503, detail="API quota exhausted.")
        fallback = FALLBACK_MEALS.get(region, FALLBACK_MEALS["All"])
        plan_doc = {"plan_data": _meals_to_weekly_fallback(fallback), "fallback": True}
        return {"plan": plan_doc, "user": format_doc(user)}

# ── 5. PANTRY CHEF ────────────────────────────────────────────
@app.post("/api/pantry/")
async def pantry_chef(req: PantryRequest):
    if len(req.ingredients.strip()) < 3:
        raise HTTPException(status_code=400, detail="Please describe your ingredients in more detail.")

    allergies_str   = ", ".join(req.allergies) if req.allergies else "nothing"
    meal_cal_target = max(int(req.target_cal / 3), 200)

    prompt = (
        f'The user wants to cook a healthy dish. They have: "{req.ingredients}".\n'
        f"They are allergic to: {allergies_str}.\n"
        f"Target calories for this meal: ~{meal_cal_target} kcal.\n"
        "Create an inventive, healthy recipe using mostly what they have.\n"
        f"LANGUAGE INSTRUCTION: Translate 'name', 'instructions', and 'missing_basics' values into the language matching BCP-47 code: {req.language}. Keep all JSON keys in English.\n"
        "Return STRICT JSON without markdown:\n"
        '{"name": "Dish Name", "emoji": "🍲", "calories": 300, "protein": 12, '
        '"instructions": "Short 3-sentence recipe instructions.", "missing_basics": "e.g., oil, salt"}'
    )

    try:
        loop = asyncio.get_running_loop()
        raw = await asyncio.wait_for(
            loop.run_in_executor(None, _call_gemini, prompt),
            timeout=40.0,
        )
        return json.loads(raw)
    except Exception as e:
        log.error("Pantry chef error: %s", e)
        fallback = _pantry_fallback(req.ingredients)
        return {**fallback, "source": "fallback"}

# ── 6. DAILY TRACKER ──────────────────────────────────────────
@app.post("/api/log-meal/")
async def log_meal(req: LogMealRequest):
    date_str = datetime.now(IST).strftime("%Y-%m-%d")
    await log_collection.insert_one({
        "user_id":   req.user_id,
        "date":      date_str,
        "meal_name": req.meal_name,
        "calories":  req.calories,
        "protein":   req.protein,
        "timestamp": datetime.now(IST),
    })
    return await _build_today_log(req.user_id, date_str)

@app.delete("/api/log-meal/{user_id}/{meal_name}")
async def delete_log(user_id: str, meal_name: str):
    date_str = datetime.now(IST).strftime("%Y-%m-%d")
    await log_collection.delete_one({"user_id": user_id, "date": date_str, "meal_name": meal_name})
    return await _build_today_log(user_id, date_str)

@app.get("/api/today-log/{user_id}")
async def get_today_log(user_id: str):
    date_str = datetime.now(IST).strftime("%Y-%m-%d")
    return await _build_today_log(user_id, date_str)

async def _build_today_log(user_id: str, date_str: str) -> dict:
    pipeline = [
        {"$match": {"user_id": user_id, "date": date_str}},
        {"$group": {"_id": None, "total_cal": {"$sum": "$calories"}, "total_pro": {"$sum": "$protein"}}},
    ]
    result = await log_collection.aggregate(pipeline).to_list(length=1)
    stats  = result[0] if result else {"total_cal": 0, "total_pro": 0}
    stats.pop("_id", None)  # remove MongoDB internal key from aggregate output

    cursor = log_collection.find({"user_id": user_id, "date": date_str}).sort("timestamp", -1)
    stats["eaten_meals"] = [
        {"id": str(m["_id"]), "name": m["meal_name"], "calories": m["calories"]}
        async for m in cursor
    ]
    return stats

# ── 7. SMART SUGGESTIONS ──────────────────────────────────────
@app.post("/api/suggest/")
async def get_suggestions(req: PromptRequest):
    user_prompt = req.prompt.strip()
    if not user_prompt:
        raise HTTPException(status_code=400, detail="Prompt cannot be empty.")

    allergies_str = ", ".join(req.allergies) if req.allergies else "none"
    gemini_prompt = (
        f'The user said: "{user_prompt}"\n'
        f"Their food allergies: {allergies_str}.\n"
        "You are a smart, friendly Indian nutritionist. Understand the mood and craving "
        "and suggest exactly 3 healthy, satisfying meal ideas. "
        "Prefer Indian dishes but allow global cuisine if explicitly requested. "
        "Strictly avoid allergens.\n"
        f"LANGUAGE INSTRUCTION: Translate 'name' and 'reasoning' values into the language matching BCP-47 code: {req.language}. Keep all JSON keys in English.\n"
        "Return ONLY a JSON array of 3 objects, each with keys:\n"
        "name(string), emoji(string), calories(int), protein(int), "
        "reasoning(string — one warm encouraging sentence), youtube_query(string)"
    )

    try:
        loop = asyncio.get_running_loop()
        raw = await asyncio.wait_for(
            loop.run_in_executor(None, _call_gemini, gemini_prompt),
            timeout=40.0,
        )
        suggestions = json.loads(raw)
        if not isinstance(suggestions, list):
            suggestions = [suggestions]
        return {"suggestions": suggestions[:3], "source": "gemini"}
    except Exception as e:
        log.error("Suggest: Gemini failed → smart fallback. Error: %s", e)
        return {"suggestions": _smart_fallback(user_prompt), "source": "fallback"}

# ── 8. ALTERNATIVES (LEGACY) ──────────────────────────────────
@app.post("/api/alternatives/")
async def get_alternative(req: AlternativeRequest):
    craving = req.craving.strip()
    prompt  = (
        f'The user is craving "{craving}". Suggest one healthy Indian alternative.\n'
        'Return STRICT JSON without markdown: {"name": "...", "calories": 0, "protein": 0, "emoji": "...", "reasoning": "..."}'
    )
    try:
        raw = _call_gemini(prompt)
        return json.loads(raw)
    except Exception as e:
        log.error("Alternative error: %s", e)
        raise HTTPException(status_code=500, detail="Could not generate alternative.")
