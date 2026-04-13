from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from models import UserCreate, AlternativeRequest
from database import user_collection, food_collection, alt_collection
from bson import ObjectId
from bson.errors import InvalidId

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

    height_m = data['height_cm'] / 100
    data['bmi'] = round(data['current_weight'] / (height_m * height_m), 2) if height_m > 0 else 0

    if data['current_weight'] > data['target_weight']:
        data['target_cal'] = 1600
    else:
        data['target_cal'] = 2200

    data['target_protein'] = round(data['current_weight'] * 1.2)

    new_user = await user_collection.insert_one(data)
    created = await user_collection.find_one({"_id": new_user.inserted_id})
    return format_doc(created)


@app.get("/api/meals/{user_id}")
async def get_personalized_meals(user_id: str):
    oid = parse_object_id(user_id)
    user = await user_collection.find_one({"_id": oid})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # If the user chose "All" regions, include every region; otherwise include
    # their specific region plus items tagged "All" (available everywhere)
    if user["region"] == "All":
        region_filter = {"$in": ["North", "South", "All"]}
    else:
        region_filter = {"$in": [user["region"], "All"]}

    query = {
        "region": region_filter,
        "allergens": {"$nin": user["allergies"]}
    }

    meals = []
    async for food in food_collection.find(query):
        meals.append(format_doc(food))

    return {"meals": meals, "user": format_doc(user)}


@app.post("/api/alternatives/")
async def get_alternative(req: AlternativeRequest):
    craving = req.craving.strip().lower()
    alt_mapping = await alt_collection.find_one({"trigger": craving})

    if alt_mapping:
        healthy_food = await food_collection.find_one({"name": alt_mapping["healthy_option"]})
        if healthy_food:
            return format_doc(healthy_food)

    raise HTTPException(
        status_code=404,
        detail="No healthy alternative found. Try searching for 'chocolate' or 'chips'."
    )


@app.post("/api/seed/")
async def seed_db():
    await food_collection.delete_many({})
    await alt_collection.delete_many({})

    foods = [
        {
            "name": "Poha",
            "category": "Small Meal",
            "region": "North",
            "calories": 250,
            "protein": 5,
            "carbs": 45,
            "fats": 7,
            "allergens": ["peanut"],
            "image_url": "https://images.unsplash.com/photo-1606491956689-2ea866880c84?w=500",
            "video_url": "https://youtube.com"
        },
        {
            "name": "Idli Sambar",
            "category": "Avg Meal",
            "region": "South",
            "calories": 300,
            "protein": 10,
            "carbs": 50,
            "fats": 5,
            "allergens": [],
            "image_url": "https://images.unsplash.com/photo-1589301760014-d929f39ce9b1?w=500",
            "video_url": "https://youtube.com"
        },
        {
            "name": "Dal Makhani & Roti",
            "category": "Avg Meal",
            "region": "North",
            "calories": 450,
            "protein": 15,
            "carbs": 60,
            "fats": 12,
            "allergens": ["dairy", "gluten"],
            "image_url": "https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=500",
            "video_url": "https://youtube.com"
        },
        {
            "name": "Jaggery Peanut Chikki",
            "category": "Tiny/Craving",
            "region": "All",
            "calories": 150,
            "protein": 6,
            "carbs": 20,
            "fats": 8,
            "allergens": ["peanut"],
            "image_url": "https://m.media-amazon.com/images/I/61H4N+R98VL.jpg",
            "video_url": "https://youtube.com"
        },
        {
            "name": "Roasted Makhana",
            "category": "Tiny/Craving",
            "region": "All",
            "calories": 100,
            "protein": 3,
            "carbs": 20,
            "fats": 2,
            "allergens": [],
            "image_url": "https://images.unsplash.com/photo-1596560548464-f010549b84d7?w=500",
            "video_url": "https://youtube.com"
        }
    ]
    await food_collection.insert_many(foods)

    alts = [
        {"trigger": "chocolate", "healthy_option": "Jaggery Peanut Chikki"},
        {"trigger": "chips", "healthy_option": "Roasted Makhana"}
    ]
    await alt_collection.insert_many(alts)

    return {"message": "Database successfully populated!"}
