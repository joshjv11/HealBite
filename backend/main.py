import os
import json
import asyncio
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from database import user_collection
from models import UserCreate, AlternativeRequest
from bson import ObjectId
from bson.errors import InvalidId
from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv()

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
    """Try each model in cascade order; return raw text or raise."""
    last_err = None
    for model in GEMINI_MODELS:
        try:
            response = client.models.generate_content(
                model=model,
                contents=prompt,
                config=JSON_CONFIG,
            )
            return response.text
        except Exception as e:
            print(f"  [{model}] failed: {str(e)[:80]}")
            last_err = e
    raise last_err


@app.get("/api/meals/{user_id}")
async def get_personalized_meals(user_id: str):
    oid = parse_object_id(user_id)
    user = await user_collection.find_one({"_id": oid})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    allergies_str = ", ".join(user["allergies"]) if user["allergies"] else "none"
    region = user.get("region", "All")

    prompt = (
        f"Indian nutritionist. Return a JSON array of exactly 6 meal objects for a {region} Indian user.\n"
        f"Allergies to avoid: {allergies_str}. Daily target: {user['target_cal']} kcal, {user['target_protein']}g protein.\n"
        "Categories (2 of each): 'Small Meal', 'Avg Meal', 'Tiny/Craving'.\n"
        "Each object keys: name, category, calories(int), protein(int), carbs(int), fats(int), emoji, youtube_query.\n"
        "Return ONLY the JSON array, no extra text."
    )

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
        return {"meals": meals, "user": format_doc(user)}
    except Exception as e:
        print(f"Gemini cascade failed: {e}")
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
