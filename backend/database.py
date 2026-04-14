from motor.motor_asyncio import AsyncIOMotorClient

MONGO_DETAILS = "mongodb://localhost:27017"
client = AsyncIOMotorClient(MONGO_DETAILS)

database = client.healbite_db
user_collection = database.get_collection("users")
food_collection = database.get_collection("foods")
alt_collection  = database.get_collection("alternatives")
log_collection   = database.get_collection("meal_logs")
report_collection = database.get_collection("medical_reports")
plan_collection   = database.get_collection("weekly_plans")
