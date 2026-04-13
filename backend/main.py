import os
import json
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


@app.get("/api/meals/{user_id}")
async def get_personalized_meals(user_id: str):
    oid = parse_object_id(user_id)
    user = await user_collection.find_one({"_id": oid})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    allergies_str = ", ".join(user["allergies"]) if user["allergies"] else "None"

    prompt = f"""
    You are an expert Indian clinical nutritionist.
    Create a highly personalized 1-day meal plan for an Indian user.

    User Profile:
    - Region Preference: {user["region"]} Indian
    - Allergies / Foods to Avoid: {allergies_str}
    - Daily Calorie Target: {user["target_cal"]} kcal
    - Daily Protein Target: {user["target_protein"]} g

    Generate exactly 3 meals with these categories (one each):
    "Small Meal", "Avg Meal", "Tiny/Craving"

    Rules:
    - Total calories should be close to the calorie target.
    - Strictly avoid all allergens listed above.
    - All dishes must be authentic and commonly eaten in India.

    Return a strict JSON Array of objects. Each object must have exactly these keys:
    "name" (string - dish name),
    "category" (string - one of the three categories above),
    "calories" (number),
    "protein" (number in grams),
    "carbs" (number in grams),
    "fats" (number in grams),
    "emoji" (string - a single food emoji representing the dish),
    "youtube_query" (string - what to search YouTube for, e.g. "Healthy Poha recipe")
    """

    try:
        response = client.models.generate_content(
            model="gemini-1.5-flash",
            contents=prompt,
            config=JSON_CONFIG,
        )
        meals = json.loads(response.text)
        if not isinstance(meals, list):
            meals = [meals]
        for i, meal in enumerate(meals):
            meal["id"] = f"gemini_meal_{i}"
        return {"meals": meals, "user": format_doc(user)}
    except Exception as e:
        print(f"Gemini Error: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate AI meal plan.")


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
        response = client.models.generate_content(
            model="gemini-1.5-flash",
            contents=prompt,
            config=JSON_CONFIG,
        )
        alternative = json.loads(response.text)
        return alternative
    except Exception as e:
        print(f"Gemini Error: {e}")
        raise HTTPException(status_code=500, detail="AI could not process this craving right now.")
