import os
import json
import asyncio
import logging
import re
from datetime import datetime

import pytz
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from bson import ObjectId
from bson.errors import InvalidId
from dotenv import load_dotenv
from google import genai
from google.genai import types

from database import user_collection, log_collection, food_collection, alt_collection
from models import UserCreate, AlternativeRequest, PromptRequest, PantryRequest, LogMealRequest

load_dotenv()

# ── Logging ──────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("aaharvoice")

# ── Gemini client ────────────────────────────────────────────
api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    raise RuntimeError("GEMINI_API_KEY is not set in backend/.env")

client = genai.Client(api_key=api_key)
JSON_CONFIG   = types.GenerateContentConfig(response_mime_type="application/json")
GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.0-flash-lite"]

IST = pytz.timezone("Asia/Kolkata")

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)

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
    """Strip Markdown code fences Gemini sometimes wraps around JSON."""
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

# ── Smart suggest fallbacks ───────────────────────────────────
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
# ── Pantry fallbacks (keyword-matched) ───────────────────────
_PANTRY_FALLBACKS = [
    {
        "pattern": r"egg|eggs",
        "name": "Masala Egg Bhurji with Rice",
        "emoji": "🍳",
        "calories": 370,
        "protein": 22,
        "instructions": (
            "Sauté finely chopped garlic and tomato in minimal oil until soft, "
            "add your spices and stir for 30 seconds. Beat 2–3 eggs, pour in, and "
            "scramble on medium heat until just set. Serve over steamed rice."
        ),
        "missing_basics": "oil, onion (optional)",
    },
    {
        "pattern": r"paneer|cottage cheese",
        "name": "Paneer Bhurji Wrap",
        "emoji": "🧀",
        "calories": 340,
        "protein": 20,
        "instructions": (
            "Crumble paneer and sauté with diced tomato, garlic, and spices for 5 minutes. "
            "Warm a roti or flatbread, fill with the paneer mixture, roll tightly, and serve."
        ),
        "missing_basics": "roti / flatbread",
    },
    {
        "pattern": r"chicken|murgh",
        "name": "Quick Garlic Chicken Stir-fry",
        "emoji": "🍗",
        "calories": 320,
        "protein": 34,
        "instructions": (
            "Cut chicken into small pieces and marinate with spices for 5 minutes. "
            "Sauté garlic until golden, add chicken, cook on high heat for 8–10 minutes "
            "turning often. Finish with a squeeze of lemon."
        ),
        "missing_basics": "oil, lemon",
    },
    {
        "pattern": r"potato|aloo",
        "name": "Spiced Aloo Tomato Sabzi",
        "emoji": "🥔",
        "calories": 280,
        "protein": 6,
        "instructions": (
            "Cube potatoes and boil until just tender, about 10 minutes. "
            "Sauté garlic and chopped tomatoes with your spices until oil separates, "
            "then add the potatoes and toss to coat. Cook another 5 minutes."
        ),
        "missing_basics": "oil, onion (optional)",
    },
    {
        "pattern": r"rice|chawal",
        "name": "Egg & Vegetable Fried Rice",
        "emoji": "🍚",
        "calories": 400,
        "protein": 16,
        "instructions": (
            "Heat oil on high, scramble 2 eggs, then push to the side. "
            "Add leftover or cooked rice and stir-fry for 3 minutes. "
            "Mix in chopped tomato, garlic, salt and pepper, and toss everything together."
        ),
        "missing_basics": "oil, soy sauce (optional)",
    },
    {
        "pattern": r"dal|lentil|moong|chana|masoor",
        "name": "Simple Tadka Dal",
        "emoji": "🍲",
        "calories": 300,
        "protein": 15,
        "instructions": (
            "Pressure-cook or boil your lentils until soft. "
            "In a small pan heat oil, add garlic and spices until fragrant, "
            "pour the tadka over the dal, stir and simmer 5 minutes. Serve with rice."
        ),
        "missing_basics": "oil, cumin seeds",
    },
]

_PANTRY_DEFAULT = {
    "name": "Spiced Scrambled Eggs on Toast",
    "emoji": "🥚",
    "calories": 280,
    "protein": 18,
    "instructions": (
        "Beat your eggs with a pinch of salt, pepper, and any spice you have. "
        "Cook in a lightly oiled pan on medium heat, stirring gently until just set. "
        "Serve on toasted bread or with rice for a complete meal."
    ),
    "missing_basics": "oil, bread or rice",
}

def _pantry_fallback(ingredients: str) -> dict:
    lower = ingredients.lower()
    for entry in _PANTRY_FALLBACKS:
        if re.search(entry["pattern"], lower):
            result = {k: v for k, v in entry.items() if k != "pattern"}
            log.info("Pantry fallback matched pattern: '%s'", entry["pattern"])
            return result
    log.info("Pantry fallback: no keyword match, using default.")
    return _PANTRY_DEFAULT

_DEFAULT_SUGGESTIONS = [
    {"name": "Vegetable Oats Upma",  "emoji": "🥣", "calories": 220, "protein": 7,  "reasoning": "Light, filling, and packed with fibre to keep you energised.", "youtube_query": "Vegetable Oats Upma recipe"},
    {"name": "Moong Dal Chilla",     "emoji": "🥞", "calories": 190, "protein": 11, "reasoning": "High-protein, quick to make, and naturally satisfying.", "youtube_query": "Moong Dal Chilla healthy recipe"},
    {"name": "Roasted Makhana Bowl", "emoji": "🟤", "calories": 110, "protein": 4,  "reasoning": "Crunchy, guilt-free, and perfect as a light snack anytime.", "youtube_query": "Roasted Makhana snack recipe"},
]

def _smart_fallback(user_prompt: str) -> list:
    lower = user_prompt.lower()
    for pattern, suggestions in _SUGGEST_FALLBACKS.items():
        if re.search(pattern, lower):
            log.info("Smart fallback matched pattern: '%s'", pattern)
            return suggestions
    log.info("Smart fallback: no keyword match, using defaults.")
    return _DEFAULT_SUGGESTIONS

# ══════════════════════════════════════════════════════════════
#  ENDPOINTS
# ══════════════════════════════════════════════════════════════

# ── 1. USERS ──────────────────────────────────────────────────
@app.post("/api/users/")
async def create_user(user_data: UserCreate):
    data = user_data.model_dump()
    h = data["height_cm"] / 100
    data["bmi"] = round(data["current_weight"] / (h * h), 2) if h > 0 else 0
    data["target_cal"]     = 1600 if data["current_weight"] > data["target_weight"] else 2200
    data["target_protein"] = round(data["current_weight"] * 1.2)
    data["clinical_data"]  = None
    new = await user_collection.insert_one(data)
    created = await user_collection.find_one({"_id": new.inserted_id})
    return format_doc(created)

# ── 2. MEDICAL REPORT SCANNER ─────────────────────────────────
@app.post("/api/scan-report/")
async def scan_medical_report(
    user_id: str = Form(...),
    file: UploadFile = File(...)
):
    ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Invalid file type. Please upload a JPG, PNG, or WEBP image.")

    oid = parse_object_id(user_id)
    image_bytes = await file.read()

    if len(image_bytes) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Maximum 5 MB.")

    image_part = types.Part.from_bytes(data=image_bytes, mime_type=file.content_type)

    prompt = """
You are a world-class Clinical Pathologist and Indian Dietitian AI.
Analyze this medical lab report image. Look specifically for Lipid Profiles, Blood Sugar (HbA1c / Fasting Glucose), Thyroid (TSH/T3/T4), Liver, or CBC profiles.

Return STRICT JSON (no markdown) with this exact structure:
{
  "is_medical_report": true,
  "markers": {
    "Total_Cholesterol": {"value": 210, "unit": "mg/dL", "status": "High"},
    "LDL": {"value": 140, "unit": "mg/dL", "status": "High"},
    "HDL": {"value": 38, "unit": "mg/dL", "status": "Low"},
    "Triglycerides": {"value": 180, "unit": "mg/dL", "status": "Borderline"}
  },
  "clinical_directive": "Patient has high LDL and low HDL. STRICTLY AVOID saturated fats, butter, ghee, red meat. PRIORITIZE soluble fibre, oats, flaxseed, and omega-3 rich foods."
}

If the image is NOT a medical lab report, return: {"is_medical_report": false, "markers": {}, "clinical_directive": ""}
"""
    try:
        raw = _call_gemini(prompt=prompt, contents=[prompt, image_part])
        clinical_data = json.loads(raw)

        if not clinical_data.get("is_medical_report"):
            raise HTTPException(status_code=400, detail="This image does not appear to be a medical lab report. Please upload a clear photo of a blood test or lipid profile.")

        await user_collection.update_one(
            {"_id": oid},
            {"$set": {"clinical_data": clinical_data}}
        )
        updated = await user_collection.find_one({"_id": oid})
        log.info("Medical report scanned successfully for user %s", user_id)
        return {"message": "Report analyzed successfully!", "user": format_doc(updated)}

    except HTTPException:
        raise
    except json.JSONDecodeError as e:
        log.error("JSON parse error after clean: %s", e)
        raise HTTPException(status_code=500, detail="Gemini returned malformed data. Please try with a clearer image.")
    except Exception as e:
        log.error("Medical scan error: %s", e)
        if _is_quota_error(e):
            raise HTTPException(
                status_code=503,
                detail=(
                    "API quota exhausted (limit: 0). Your Gemini key belongs to a project "
                    "with zero free-tier quota. Go to aistudio.google.com/apikey → copy the key "
                    "from the 'Default Gemini Project' row → paste it into backend/.env and restart."
                ),
            )
        raise HTTPException(status_code=500, detail="Failed to analyze report. Please ensure the image is clear and well-lit.")

# ── 3. PERSONALIZED MEALS (CLINICAL-AWARE) ────────────────────
@app.get("/api/meals/{user_id}")
async def get_personalized_meals(user_id: str):
    oid = parse_object_id(user_id)
    user = await user_collection.find_one({"_id": oid})
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    allergies_str  = ", ".join(user["allergies"]) if user["allergies"] else "none"
    region         = user.get("region", "All")
    clinical_block = ""

    if user.get("clinical_data") and user["clinical_data"].get("clinical_directive"):
        directive = user["clinical_data"]["clinical_directive"]
        clinical_block = f"\n⚠ CRITICAL MEDICAL DIRECTIVE (OBEY IMPLICITLY): {directive}\n"

    cuisine_map = {
        "North":   "North Indian (roti, dal, paneer, sabzi)",
        "South":   "South Indian (rice, sambar, idli, dosa)",
        "All":     "pan-Indian mixing North and South",
        "Western": "Western / continental (salads, wraps, grilled proteins, bowls)",
    }
    cuisine_desc = cuisine_map.get(region, "Indian")

    prompt = (
        f"You are a clinical nutritionist. Return a JSON array of exactly 6 meal objects for {cuisine_desc} cuisine.\n"
        f"Allergies to STRICTLY avoid: {allergies_str}.\n"
        f"Daily target: {user['target_cal']} kcal, {user['target_protein']}g protein.\n"
        f"{clinical_block}"
        "Categories (exactly 2 of each): 'Small Meal', 'Avg Meal', 'Tiny/Craving'.\n"
        "Each object keys: name, category, calories(int), protein(int), carbs(int), fats(int), emoji, youtube_query.\n"
        "Return ONLY the JSON array, no extra text or markdown."
    )

    log.info("Meals request — user: %s | region: %s | medical: %s", user.get("name"), region, bool(clinical_block))

    try:
        raw = await asyncio.wait_for(
            asyncio.get_event_loop().run_in_executor(None, _call_gemini, prompt),
            timeout=20.0,
        )
        meals = json.loads(raw)
        if not isinstance(meals, list):
            meals = [meals]
        for i, meal in enumerate(meals):
            meal["id"] = f"meal_{i}"
        log.info("Meals: returning %d AI-generated meals.", len(meals))
        return {"meals": meals, "user": format_doc(user)}
    except Exception as e:
        log.error("Meals: Gemini failed → static fallback. Error: %s", e)
        fallback = FALLBACK_MEALS.get(region, FALLBACK_MEALS["All"])
        return {"meals": fallback, "user": format_doc(user), "fallback": True}

# ── 4. PANTRY CHEF ────────────────────────────────────────────
@app.post("/api/pantry/")
async def pantry_chef(req: PantryRequest):
    if len(req.ingredients.strip()) < 3:
        raise HTTPException(status_code=400, detail="Please describe your ingredients in more detail.")

    allergies_str = ", ".join(req.allergies) if req.allergies else "nothing"
    meal_cal_target = max(int(req.target_cal / 3), 200)

    prompt = (
        f'The user wants to cook a healthy dish. They have: "{req.ingredients}".\n'
        f"They are allergic to: {allergies_str}.\n"
        f"Target calories for this meal: ~{meal_cal_target} kcal.\n"
        "Create an inventive, healthy recipe using mostly what they have.\n"
        "Return STRICT JSON without markdown:\n"
        '{"name": "Dish Name", "emoji": "🍲", "calories": 300, "protein": 12, '
        '"instructions": "Short 3-sentence recipe instructions.", "missing_basics": "e.g., oil, salt"}'
    )

    try:
        raw = await asyncio.wait_for(
            asyncio.get_event_loop().run_in_executor(None, _call_gemini, prompt),
            timeout=20.0,
        )
        return json.loads(raw)
    except Exception as e:
        log.error("Pantry chef error: %s", e)
        # Graceful offline fallback — never show a 500 for this feature
        fallback = _pantry_fallback(req.ingredients)
        log.info("Pantry: returning offline fallback recipe '%s'", fallback["name"])
        return {**fallback, "source": "fallback"}

# ── 5. DAILY TRACKER ──────────────────────────────────────────
@app.post("/api/log-meal/")
async def log_meal(req: LogMealRequest):
    date_str = datetime.now(IST).strftime("%Y-%m-%d")
    entry = {
        "user_id":   req.user_id,
        "date":      date_str,
        "meal_name": req.meal_name,
        "calories":  req.calories,
        "protein":   req.protein,
        "timestamp": datetime.now(IST),
    }
    await log_collection.insert_one(entry)
    return await _build_today_log(req.user_id, date_str)

@app.delete("/api/log-meal/{user_id}/{meal_name}")
async def delete_log(user_id: str, meal_name: str):
    date_str = datetime.now(IST).strftime("%Y-%m-%d")
    await log_collection.delete_one(
        {"user_id": user_id, "date": date_str, "meal_name": meal_name}
    )
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

    cursor = log_collection.find(
        {"user_id": user_id, "date": date_str}
    ).sort("timestamp", -1)
    eaten = [
        {"id": str(m["_id"]), "name": m["meal_name"], "calories": m["calories"]}
        async for m in cursor
    ]
    stats["eaten_meals"] = eaten
    return stats

# ── 6. SMART SUGGESTIONS ──────────────────────────────────────
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
        "Strictly avoid allergens. Make suggestions feel exciting.\n"
        "Return ONLY a JSON array of 3 objects, each with keys:\n"
        "name(string), emoji(string), calories(int), protein(int), "
        "reasoning(string — one warm encouraging sentence), youtube_query(string)"
    )

    log.info("Suggest — prompt: '%s' | allergies: %s", user_prompt[:80], req.allergies)
    try:
        raw = await asyncio.wait_for(
            asyncio.get_event_loop().run_in_executor(None, _call_gemini, gemini_prompt),
            timeout=20.0,
        )
        suggestions = json.loads(raw)
        if not isinstance(suggestions, list):
            suggestions = [suggestions]
        log.info("Suggest: returning %d AI suggestions.", len(suggestions[:3]))
        return {"suggestions": suggestions[:3], "source": "gemini"}
    except Exception as e:
        log.error("Suggest: Gemini failed → smart fallback. Error: %s", e)
        return {"suggestions": _smart_fallback(user_prompt), "source": "fallback"}

# ── 7. ALTERNATIVES (LEGACY) ──────────────────────────────────
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
