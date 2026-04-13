from pydantic import BaseModel
from typing import List


class UserCreate(BaseModel):
    name: str
    language: str
    region: str
    current_weight: float
    target_weight: float
    height_cm: float
    allergies: List[str] = []
    medical_conditions: List[str] = []


class FoodItem(BaseModel):
    name: str
    category: str  # "Tiny/Craving", "Small Meal", "Avg Meal"
    region: str    # "North", "South", "All"
    calories: int
    protein: int
    carbs: int
    fats: int
    allergens: List[str] = []
    image_url: str
    video_url: str


class AlternativeRequest(BaseModel):
    craving: str
