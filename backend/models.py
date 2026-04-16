from pydantic import BaseModel
from typing import List, Optional


class UserCreate(BaseModel):
    name: str
    language: str
    region: str
    age: int
    current_weight: float
    target_weight: float
    height_cm: float
    allergies: List[str] = []
    medical_conditions: List[str] = []


class AlternativeRequest(BaseModel):
    craving: str
    language: str = "en-IN"


class PromptRequest(BaseModel):
    prompt: str
    allergies: List[str] = []
    language: str = "en-IN"


class PantryRequest(BaseModel):
    ingredients: str
    allergies: List[str] = []
    target_cal: int
    language: str = "en-IN"


class LogMealRequest(BaseModel):
    user_id: str
    meal_name: str
    calories: int
    protein: int


class FeedbackRequest(BaseModel):
    user_id: Optional[str] = None
    name: str
    feedback_type: str
    message: str
