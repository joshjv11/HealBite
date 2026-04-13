import os
import json
import asyncio
import logging
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from database import user_collection
from models import UserCreate, AlternativeRequest, PromptRequest
from bson import ObjectId
from bson.errors import InvalidId
from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv()

# ── Logging setup ─────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("aaharvoice")

api_key = os.getenv("GEMINI_API_KEY")
if not api_key or api_key == "your_actual_api_key_goes_here":
    raise RuntimeError("GEMINI_API_KEY is not set in backend/.env")

client = genai.Client(api_key=api_key)
JSON_CONFIG = types.GenerateContentConfig(response_mime_type="application/json")

# Models to try in order (fastest/cheapest first)
GEMINI_MODELS = ["gemini-2.0-flash-lite", "gemini-2.0-flash", "gemini-2.5-flash"]

# Static fallback meals (6 per region) shown when Gemini is unavailable
FALLBACK_MEALS = {
    "North": [
        {"id": "f0", "name": "Poha with Peanuts",       "category": "Small Meal",   "calories": 250, "protein": 6,  "carbs": 45, "fats": 7,  "emoji": "🍚", "youtube_query": "Poha recipe healthy breakfast"},
        {"id": "f1", "name": "Besan Chilla",             "category": "Small Meal",   "calories": 200, "protein": 9,  "carbs": 28, "fats": 6,  "emoji": "🥞", "youtube_query": "Besan Chilla healthy recipe"},
        {"id": "f2", "name": "Dal Tadka with Roti",      "category": "Avg Meal",     "calories": 420, "protein": 16, "carbs": 58, "fats": 10, "emoji": "🫓", "youtube_query": "Dal Tadka recipe"},
        {"id": "f3", "name": "Paneer Bhurji with Rice",  "category": "Avg Meal",     "calories": 490, "protein": 22, "carbs": 55, "fats": 14, "emoji": "🍛", "youtube_query": "Paneer Bhurji healthy recipe"},
        {"id": "f4", "name": "Roasted Makhana",          "category": "Tiny/Craving", "calories": 100, "protein": 3,  "carbs": 20, "fats": 2,  "emoji": "🟤", "youtube_query": "Roasted Makhana recipe"},
        {"id": "f5", "name": "Lassi (Low Fat)",          "category": "Tiny/Craving", "calories": 120, "protein": 6,  "carbs": 18, "fats": 2,  "emoji": "🥛", "youtube_query": "Low fat lassi recipe"},
    ],
    "South": [
        {"id": "f0", "name": "Idli Sambar",              "category": "Small Meal",   "calories": 200, "protein": 8,  "carbs": 38, "fats": 3,  "emoji": "🤍", "youtube_query": "Idli Sambar recipe"},
        {"id": "f1", "name": "Pesarattu",                "category": "Small Meal",   "calories": 180, "protein": 10, "carbs": 30, "fats": 3,  "emoji": "🥗", "youtube_query": "Pesarattu moong dal dosa recipe"},
        {"id": "f2", "name": "Vegetable Upma",           "category": "Avg Meal",     "calories": 300, "protein": 9,  "carbs": 50, "fats": 7,  "emoji": "🍲", "youtube_query": "Vegetable Upma recipe"},
        {"id": "f3", "name": "Curd Rice with Pickle",    "category": "Avg Meal",     "calories": 360, "protein": 12, "carbs": 60, "fats": 6,  "emoji": "🍚", "youtube_query": "Curd rice recipe South Indian"},
        {"id": "f4", "name": "Banana",                   "category": "Tiny/Craving", "calories": 90,  "protein": 1,  "carbs": 23, "fats": 0,  "emoji": "🍌", "youtube_query": "healthy snack banana"},
        {"id": "f5", "name": "Coconut Chutney",          "category": "Tiny/Craving", "calories": 80,  "protein": 1,  "carbs": 5,  "fats": 7,  "emoji": "🥥", "youtube_query": "Coconut chutney recipe"},
    ],
    "All": [
        {"id": "f0", "name": "Vegetable Oats",           "category": "Small Meal",   "calories": 220, "protein": 7,  "carbs": 40, "fats": 5,  "emoji": "🥣", "youtube_query": "Vegetable Oats recipe healthy"},
        {"id": "f1", "name": "Moong Dal Chilla",         "category": "Small Meal",   "calories": 190, "protein": 11, "carbs": 26, "fats": 4,  "emoji": "🥞", "youtube_query": "Moong dal chilla healthy recipe"},
        {"id": "f2", "name": "Rajma Chawal",             "category": "Avg Meal",     "calories": 450, "protein": 18, "carbs": 68, "fats": 8,  "emoji": "🍛", "youtube_query": "Rajma Chawal recipe"},
        {"id": "f3", "name": "Khichdi with Ghee",        "category": "Avg Meal",     "calories": 400, "protein": 14, "carbs": 62, "fats": 9,  "emoji": "🫕", "youtube_query": "Khichdi healthy recipe"},
        {"id": "f4", "name": "Roasted Chana",            "category": "Tiny/Craving", "calories": 120, "protein": 7,  "carbs": 18, "fats": 3,  "emoji": "🫘", "youtube_query": "Roasted Chana healthy snack"},
        {"id": "f5", "name": "Sprouts Salad",            "category": "Tiny/Craving", "calories": 110, "protein": 8,  "carbs": 15, "fats": 2,  "emoji": "🌱", "youtube_query": "Sprouts salad recipe healthy"},
    ],
    "Western": [
        {"id": "f0", "name": "Greek Yogurt Parfait",     "category": "Small Meal",   "calories": 210, "protein": 14, "carbs": 28, "fats": 4,  "emoji": "🫙", "youtube_query": "Greek yogurt parfait healthy recipe"},
        {"id": "f1", "name": "Avocado Toast on Multigrain", "category": "Small Meal","calories": 240, "protein": 8,  "carbs": 30, "fats": 11, "emoji": "🥑", "youtube_query": "healthy avocado toast recipe"},
        {"id": "f2", "name": "Grilled Chicken Wrap",     "category": "Avg Meal",     "calories": 410, "protein": 32, "carbs": 38, "fats": 10, "emoji": "🌯", "youtube_query": "healthy grilled chicken wrap recipe"},
        {"id": "f3", "name": "Quinoa Power Bowl",        "category": "Avg Meal",     "calories": 430, "protein": 18, "carbs": 52, "fats": 12, "emoji": "🥗", "youtube_query": "quinoa power bowl healthy recipe"},
        {"id": "f4", "name": "Mixed Nuts & Dried Fruit", "category": "Tiny/Craving", "calories": 130, "protein": 4,  "carbs": 14, "fats": 8,  "emoji": "🥜", "youtube_query": "healthy mixed nuts dried fruit snack"},
        {"id": "f5", "name": "Hummus with Veggie Sticks","category": "Tiny/Craving", "calories": 100, "protein": 4,  "carbs": 10, "fats": 5,  "emoji": "🥕", "youtube_query": "hummus veggie sticks healthy snack"},
    ],
}

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def format_doc(doc) -> dict:
    doc["id"] = str(doc["_id"])
    del doc["_id"]
    return doc


def parse_object_id(user_id: str) -> ObjectId:
    try:
        return ObjectId(user_id)
    except (InvalidId, Exception):
        raise HTTPException(status_code=400, detail="Invalid user ID format")


@app.post("/api/users/")
async def create_user(user_data: UserCreate):
    data = user_data.model_dump()

    height_m = data["height_cm"] / 100
    data["bmi"] = round(data["current_weight"] / (height_m * height_m), 2) if height_m > 0 else 0

    if data["current_weight"] > data["target_weight"]:
        data["target_cal"] = 1600
    else:
        data["target_cal"] = 2200

    data["target_protein"] = round(data["current_weight"] * 1.2)

    new_user = await user_collection.insert_one(data)
    created = await user_collection.find_one({"_id": new_user.inserted_id})
    return format_doc(created)


def _call_gemini(prompt: str) -> str:
    """Try each model in cascade order; log every attempt. Return raw text or raise."""
    log.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    log.info("PROMPT SENT TO GEMINI:\n%s", prompt)
    log.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    last_err = None
    for model in GEMINI_MODELS:
        try:
            log.info("Trying model: %s", model)
            response = client.models.generate_content(
                model=model,
                contents=prompt,
                config=JSON_CONFIG,
            )
            log.info("SUCCESS with model: %s", model)
            log.info("RAW RESPONSE:\n%s", response.text)
            return response.text
        except Exception as e:
            log.warning("  [%s] FAILED: %s", model, str(e)[:120])
            last_err = e
    log.error("ALL MODELS FAILED — raising last error")
    raise last_err


@app.get("/api/meals/{user_id}")
async def get_personalized_meals(user_id: str):
    oid = parse_object_id(user_id)
    user = await user_collection.find_one({"_id": oid})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    allergies_str = ", ".join(user["allergies"]) if user["allergies"] else "none"
    region = user.get("region", "All")

    cuisine_desc = {
        "North":   "North Indian (roti, dal, paneer, sabzi style dishes)",
        "South":   "South Indian (rice, sambar, idli, dosa style dishes)",
        "All":     "pan-Indian mixing North and South Indian dishes",
        "Western": "Western / continental (salads, wraps, grilled proteins, bowls, smoothies)",
    }.get(region, "Indian")

    prompt = (
        f"You are a nutritionist. Return a JSON array of exactly 6 meal objects suited for {cuisine_desc} cuisine.\n"
        f"Allergies to avoid: {allergies_str}. Daily target: {user['target_cal']} kcal, {user['target_protein']}g protein.\n"
        "Categories (2 of each): 'Small Meal', 'Avg Meal', 'Tiny/Craving'.\n"
        "Each object keys: name, category, calories(int), protein(int), carbs(int), fats(int), emoji, youtube_query.\n"
        "Return ONLY the JSON array, no extra text."
    )

    log.info("Meals request — user: %s | region: %s | allergies: %s | cal: %s",
             user.get("name"), region, allergies_str, user["target_cal"])
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
        log.info("Meals: returning %d AI-generated meals for user '%s'", len(meals), user.get("name"))
        return {"meals": meals, "user": format_doc(user)}
    except Exception as e:
        log.error("Meals: Gemini cascade failed → using static fallback. Error: %s", e)
        fallback = FALLBACK_MEALS.get(region, FALLBACK_MEALS["All"])
        return {"meals": fallback, "user": format_doc(user), "fallback": True}


@app.post("/api/alternatives/")
async def get_alternative(req: AlternativeRequest):
    craving = req.craving.strip()
    if not craving:
        raise HTTPException(status_code=400, detail="Craving cannot be empty.")

    prompt = f"""
    The user is craving the following unhealthy food: "{craving}".
    Suggest a healthy, culturally relevant Indian alternative that satisfies the same craving type
    (e.g. sweet craving → healthy Indian sweet; crunchy craving → healthy Indian snack).

    Return a strict JSON object with exactly these keys:
    "name" (string - the healthy Indian alternative dish name),
    "calories" (number - approximate per serving),
    "protein" (number - grams per serving),
    "emoji" (string - a single food emoji representing it),
    "reasoning" (string - one encouraging sentence explaining why this is better than {craving})
    """

    try:
        raw = await asyncio.wait_for(
            asyncio.get_event_loop().run_in_executor(None, _call_gemini, prompt),
            timeout=15.0,
        )
        alternative = json.loads(raw)
        return alternative
    except Exception as e:
        print(f"Gemini Error: {e}")
        return {
            "name": "Roasted Makhana",
            "calories": 100,
            "protein": 3,
            "emoji": "🟤",
            "reasoning": "Roasted makhana is a great low-calorie Indian snack that satisfies cravings without guilt!"
        }


# Keyword-aware fallback pools for the suggest endpoint
_SUGGEST_FALLBACKS = {
    "italian|pizza|pasta|lasagna|risotto|carbonara": [
        {"name": "Whole Wheat Pasta Primavera", "emoji": "🍝", "calories": 340, "protein": 12, "reasoning": "Packed with veggies and whole-grain pasta — Italian comfort without the guilt.", "youtube_query": "healthy whole wheat pasta primavera recipe"},
        {"name": "Paneer Tikka Pizza (Whole Wheat)", "emoji": "🍕", "calories": 310, "protein": 16, "reasoning": "A desi-Italian fusion that satisfies your pizza craving with a protein boost.", "youtube_query": "healthy paneer tikka pizza recipe"},
        {"name": "Minestrone Soup with Multigrain Bread", "emoji": "🥣", "calories": 280, "protein": 10, "reasoning": "Warm, hearty, and rich in fibre — an Italian classic made light.", "youtube_query": "minestrone soup healthy recipe"},
    ],
    "chinese|noodles|fried rice|dim sum|manchurian": [
        {"name": "Vegetable Hakka Noodles (Less Oil)", "emoji": "🍜", "calories": 290, "protein": 9, "reasoning": "Stir-fried with minimal oil and loads of veggies to keep it light.", "youtube_query": "healthy vegetable hakka noodles recipe"},
        {"name": "Steamed Momos with Chilli Sauce", "emoji": "🥟", "calories": 220, "protein": 11, "reasoning": "Steamed momos are low-calorie and protein-rich — a much healthier alternative to fried.", "youtube_query": "healthy steamed momos recipe"},
        {"name": "Tofu & Broccoli Stir Fry", "emoji": "🥦", "calories": 250, "protein": 18, "reasoning": "High protein, low carb, and packed with nutrients — your body will thank you.", "youtube_query": "tofu broccoli stir fry healthy recipe"},
    ],
    "sweet|chocolate|dessert|ice cream|cake|cookie|mithai|gulab|halwa": [
        {"name": "Dark Chocolate Banana Nice Cream", "emoji": "🍫", "calories": 160, "protein": 3, "reasoning": "Frozen banana blended with dark cocoa — creamy, chocolatey, and totally guilt-free.", "youtube_query": "banana nice cream chocolate healthy recipe"},
        {"name": "Kheer with Jaggery & Almonds", "emoji": "🍮", "calories": 200, "protein": 6, "reasoning": "A lighter kheer sweetened with jaggery — satisfies your sweet tooth the Indian way.", "youtube_query": "healthy kheer jaggery recipe"},
        {"name": "Mango Lassi (Low Fat)", "emoji": "🥭", "calories": 150, "protein": 5, "reasoning": "Cool, naturally sweet, and refreshing — a perfect Indian dessert drink.", "youtube_query": "low fat mango lassi recipe"},
    ],
    "spicy|hot|fiery|chilli|masala|biryani|curry": [
        {"name": "Egg White Bhurji with Multigrain Roti", "emoji": "🍳", "calories": 280, "protein": 22, "reasoning": "Spicy masala egg white bhurji delivers the heat you want with serious protein.", "youtube_query": "egg white bhurji healthy recipe"},
        {"name": "Vegetable Biryani (Brown Rice)", "emoji": "🍛", "calories": 380, "protein": 10, "reasoning": "Aromatic spices and brown rice make this a fibre-rich, satisfying meal.", "youtube_query": "healthy vegetable biryani brown rice recipe"},
        {"name": "Chicken Tikka (Grilled, No Cream)", "emoji": "🍗", "calories": 250, "protein": 30, "reasoning": "Marinated in spices and grilled dry — all the bold flavour, none of the excess fat.", "youtube_query": "healthy grilled chicken tikka recipe"},
    ],
    "burger|cheeseburger|sandwich|patty|bun|fast food|junk": [
        {"name": "Whole Wheat Chicken Burger (Grilled)", "emoji": "🍔", "calories": 380, "protein": 28, "reasoning": "All the burger vibes — grilled chicken, whole wheat bun, fresh veggies, way less guilt.", "youtube_query": "healthy grilled chicken burger whole wheat recipe"},
        {"name": "Rajma Patty Wrap",                    "emoji": "🌯", "calories": 320, "protein": 14, "reasoning": "A desi burger alternative — spiced rajma patty in a multigrain wrap with mint chutney.", "youtube_query": "rajma patty wrap healthy recipe"},
        {"name": "Egg White Omelette Sandwich",          "emoji": "🥚", "calories": 260, "protein": 22, "reasoning": "High-protein egg white omelette stacked between multigrain toast — satisfies that handheld craving.", "youtube_query": "egg white omelette sandwich healthy recipe"},
    ],
    "crunchy|crispy|chips|fries|snack|namkeen": [
        {"name": "Roasted Chana with Chaat Masala", "emoji": "🫘", "calories": 130, "protein": 8, "reasoning": "Super crunchy, high in protein, and way more satisfying than any packet of chips.", "youtube_query": "roasted chana chaat masala healthy snack"},
        {"name": "Baked Sweet Potato Fries", "emoji": "🍠", "calories": 150, "protein": 2, "reasoning": "Oven-baked and lightly spiced — crispy fries without the deep fryer.", "youtube_query": "baked sweet potato fries healthy recipe"},
        {"name": "Makhana Bhel", "emoji": "🟤", "calories": 110, "protein": 4, "reasoning": "Puffed lotus seeds tossed with spices — the perfect crunchy guilt-free snack.", "youtube_query": "makhana bhel healthy snack recipe"},
    ],
}

_DEFAULT_FALLBACK = [
    {"name": "Vegetable Oats Upma",  "emoji": "🥣", "calories": 220, "protein": 7,  "reasoning": "Light, filling, and packed with fibre to keep you energised.", "youtube_query": "Vegetable Oats Upma recipe"},
    {"name": "Moong Dal Chilla",     "emoji": "🥞", "calories": 190, "protein": 11, "reasoning": "High-protein, quick to make, and naturally satisfying.", "youtube_query": "Moong Dal Chilla healthy recipe"},
    {"name": "Roasted Makhana Bowl", "emoji": "🟤", "calories": 110, "protein": 4,  "reasoning": "Crunchy, guilt-free, and perfect as a light snack anytime.", "youtube_query": "Roasted Makhana snack recipe"},
]


def _smart_fallback(user_prompt: str) -> list:
    """Return keyword-matched fallback suggestions based on the user's prompt text."""
    import re
    lower = user_prompt.lower()
    for pattern, suggestions in _SUGGEST_FALLBACKS.items():
        if re.search(pattern, lower):
            log.info("Smart fallback matched pattern: '%s'", pattern)
            return suggestions
    log.info("Smart fallback: no keyword match, returning default suggestions")
    return _DEFAULT_FALLBACK


@app.post("/api/suggest/")
async def get_suggestions(req: PromptRequest):
    user_prompt = req.prompt.strip()
    if not user_prompt:
        raise HTTPException(status_code=400, detail="Prompt cannot be empty.")

    allergies_str = ", ".join(req.allergies) if req.allergies else "none"

    gemini_prompt = (
        f'The user said: "{user_prompt}"\n'
        f"Their food allergies: {allergies_str}.\n"
        "You are a smart, friendly Indian nutritionist. Understand the mood and craving from the user's message "
        "and suggest exactly 3 healthy, satisfying meal ideas. "
        "Prefer Indian dishes but allow global cuisine if the user explicitly asks for it (e.g. Italian, Chinese). "
        "Strictly avoid any allergens listed. Make suggestions feel exciting and achievable.\n"
        "Return ONLY a JSON array of 3 objects, each with these exact keys:\n"
        "name(string), emoji(string), calories(int), protein(int), "
        "reasoning(string — one warm, encouraging sentence tailored to their specific request), youtube_query(string)"
    )

    log.info("Suggest request — user prompt: '%s' | allergies: %s", user_prompt, req.allergies)

    try:
        raw = await asyncio.wait_for(
            asyncio.get_event_loop().run_in_executor(None, _call_gemini, gemini_prompt),
            timeout=20.0,
        )
        suggestions = json.loads(raw)
        if not isinstance(suggestions, list):
            suggestions = [suggestions]
        log.info("Suggest: returning %d AI suggestions", len(suggestions[:3]))
        return {"suggestions": suggestions[:3], "source": "gemini"}
    except Exception as e:
        log.error("Suggest: Gemini failed → using smart fallback. Error: %s", e)
        return {"suggestions": _smart_fallback(user_prompt), "source": "fallback"}
