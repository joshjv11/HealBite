import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

# MONGODB_URI in .env overrides the local default — set it to your Atlas URI for cloud deployment
MONGO_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
client    = AsyncIOMotorClient(MONGO_URI)

database = client.poshanpal_db
user_collection = database.get_collection("users")
food_collection = database.get_collection("foods")
alt_collection  = database.get_collection("alternatives")
log_collection   = database.get_collection("meal_logs")
report_collection = database.get_collection("medical_reports")
plan_collection   = database.get_collection("weekly_plans")
