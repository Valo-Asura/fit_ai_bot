from typing import List, Dict, Optional
from pydantic import BaseModel, Field

# User targets
class UserTargets(BaseModel):
    user_id: str = "default"
    calories: float = 1550.0
    protein: float = 100.0
    carbs: float = 160.0
    fat: float = 30.0
    fiber: float = 25.0

# Food Item in DB
class Food(BaseModel):
    name: str
    calories: float  # per 100g (or per unit if unit matches)
    protein: float
    carbs: float
    fat: float
    fiber: float
    serving_size: float = 100.0
    serving_unit: str = "g"  # g, ml, or piece
    is_packaged: bool = False

# Food alias mappings
class FoodAlias(BaseModel):
    alias: str
    food_name: str

# Food presets mapping (e.g. 1 roti = 43g wheat flour)
class FoodPreset(BaseModel):
    user_id: str = "default"
    preset_name: str        # e.g., "roti"
    preset_quantity: float  # e.g., 1.0
    preset_unit: str        # e.g., "piece"
    target_food_name: str   # e.g., "wheat flour"
    target_quantity: float  # e.g., 43.0
    target_unit: str        # e.g., "g"

# Recipe item input
class RecipeItemInput(BaseModel):
    food_name: str
    quantity: float
    unit: str

# Recipe creation request
class RecipeCreate(BaseModel):
    user_id: str = "default"
    name: str
    description: str = ""
    total_servings: float = 1.0
    items: List[RecipeItemInput]

# Daily Log Item logged by user
class DailyLogItem(BaseModel):
    food_name: str
    quantity: float
    unit: str
    meal: Optional[str] = None  # breakfast, lunch, dinner, snack
    calories: float
    protein: float
    carbs: float
    fat: float
    fiber: float
    accuracy: str  # EXACT, PRESET, EST
    rich_tags: List[str] = []  # HP, HC, HF, HFi

class LogMealRequest(BaseModel):
    user_id: str = "default"
    date: str  # YYYY-MM-DD
    meal: str  # breakfast, lunch, dinner, snack
    items: List[DailyLogItem]
    overwrite: bool = False


# Parse food request
class ParseFoodRequest(BaseModel):
    text: str
    user_id: str = "default"
    date: Optional[str] = None  # defaults to today

# LLM output parsed item schema
class LLMParsedItem(BaseModel):
    name: str
    quantity: float
    unit: str
    meal: str

class LLMParsedResponse(BaseModel):
    items: List[LLMParsedItem]

# Knowledge base schemas
class KnowledgeUploadRequest(BaseModel):
    text: str
    source: str = "upload"

class KnowledgeQueryRequest(BaseModel):
    query: str

class MoveMealItemRequest(BaseModel):
    user_id: str = "default"
    date: str
    from_meal: str
    to_meal: str
    item_index: int

class UserProfileCreate(BaseModel):
    user_id: str
    name: str
    role: str = "user"
    calories: float = 1550.0
    protein: float = 100.0
    carbs: float = 160.0
    fat: float = 30.0
    fiber: float = 25.0

