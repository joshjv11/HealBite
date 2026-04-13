from pydantic import BaseModel
from typing import List, Optional


class UserCreate(BaseModel):
    name: str
    language: str
    region: str
    current_weight: float
    target_weight: float
    height_cm: float
    allergies: List[str] = []
    medical_conditions: List[str] = []


class AlternativeRequest(BaseModel):
    craving: str


class PromptRequest(BaseModel):
    prompt: str
    allergies: List[str] = []


class PantryRequest(BaseModel):
    ingredients: str
    allergies: List[str] = []
    target_cal: int


class LogMealRequest(BaseModel):
    user_id: str
    meal_name: str
    calories: int
    protein: int
