import time
import logging
from typing import List, Dict, Optional
from fastapi import FastAPI, Request, HTTPException, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime

from app.config import settings
from app.database import (
    init_db,
    users_collection,
    daily_logs_collection,
    foods_collection,
    recipes_collection,
    recipe_items_collection,
    user_food_presets_collection,
    food_aliases_collection
)
from app.models import (
    UserTargets,
    DailyLogItem,
    LogMealRequest,
    ParseFoodRequest,
    RecipeCreate,
    FoodPreset,
    KnowledgeUploadRequest,
    KnowledgeQueryRequest,
    MoveMealItemRequest,
    UserProfileCreate,
    Food
)
from app.parser import parse_food_input
from app.calculator import (
    calculate_macros_for_items,
    format_output_string,
    refresh_caches
)
from app.rag import add_document, query_rag

logger = logging.getLogger("fit_ai.main")

app = FastAPI(title="FitAI Calorie & Fitness Tracker API")

@app.on_event("startup")
async def startup_event():
    await init_db()
    await refresh_caches()

# Setup CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Custom In-Memory Rate Limiter
IP_REQUESTS: Dict[str, List[float]] = {}
LIMIT_WINDOW = 60.0  # seconds
LIMIT_MAX = 60       # requests per minute

@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    # Simple rate limiter
    client_ip = request.client.host if request.client else "127.0.0.1"
    now = time.time()
    
    # Initialize
    if client_ip not in IP_REQUESTS:
        IP_REQUESTS[client_ip] = []
        
    # Clean old requests
    IP_REQUESTS[client_ip] = [t for t in IP_REQUESTS[client_ip] if now - t < LIMIT_WINDOW]
    
    if len(IP_REQUESTS[client_ip]) >= LIMIT_MAX:
        logger.warning(f"Rate limit exceeded for IP: {client_ip}")
        raise HTTPException(status_code=429, detail="Rate limit exceeded. Please try again in a minute.")
        
    IP_REQUESTS[client_ip].append(now)
    response = await call_next(request)
    return response

# Get targets helper
async def get_user_targets(user_id: str) -> UserTargets:
    user_doc = await users_collection.find_one({"user_id": user_id})
    if user_doc:
        # Map values safely
        return UserTargets(
            user_id=user_doc.get("user_id", user_id),
            calories=user_doc.get("calories", 1550.0),
            protein=user_doc.get("protein", 100.0),
            carbs=user_doc.get("carbs", 160.0),
            fat=user_doc.get("fat", 30.0),
            fiber=user_doc.get("fiber", 25.0)
        )
    return UserTargets()

# Get empty/default daily log helper
def get_empty_log(user_id: str, date: str) -> Dict:
    return {
        "user_id": user_id,
        "date": date,
        "meals": {
            "breakfast": [],
            "lunch": [],
            "dinner": [],
            "snack": []
        },
        "totals": {
            "calories": 0.0,
            "protein": 0.0,
            "carbs": 0.0,
            "fat": 0.0,
            "fiber": 0.0
        }
    }

# Dynamic DB load of daily log
async def fetch_or_create_log(user_id: str, date: str) -> Dict:
    log_doc = await daily_logs_collection.find_one({"user_id": user_id, "date": date})
    if not log_doc:
        return get_empty_log(user_id, date)
    return log_doc

# Calculate total macros for list of items
def sum_item_macros(items: List[Dict]) -> Dict:
    totals = {"calories": 0.0, "protein": 0.0, "carbs": 0.0, "fat": 0.0, "fiber": 0.0}
    for item in items:
        totals["calories"] += item.get("calories", 0.0)
        totals["protein"] += item.get("protein", 0.0)
        totals["carbs"] += item.get("carbs", 0.0)
        totals["fat"] += item.get("fat", 0.0)
        totals["fiber"] += item.get("fiber", 0.0)
    # Round all values
    for k in totals:
        totals[k] = round(totals[k], 1)
    return totals

# API Endpoints

@app.get("/api/health")
async def health_check():
    from app.database import use_mock_db
    return {
        "status": "ok",
        "timestamp": datetime.now().isoformat(),
        "database": "in-memory" if use_mock_db else "mongodb",
        "llm_provider": settings.LLM_PROVIDER
    }

@app.post("/api/parse-food")
async def parse_food(
    payload: ParseFoodRequest, 
    x_llm_provider: Optional[str] = Header(None)
):
    # Determine the LLM provider to use (Header overrides Env config)
    active_provider = x_llm_provider if x_llm_provider else settings.LLM_PROVIDER
    
    # 1. Parse food input (Rule parser -> LLM fallback)
    parsed_items, meal, date_str = await parse_food_input(payload.text, active_provider)
    
    # 2. Run calculations
    calculated_items = await calculate_macros_for_items(parsed_items, payload.user_id)
    
    # 3. Calculate this meal's totals
    meal_total = sum_item_macros(calculated_items)
    
    # 4. Fetch day logs to calculate running totals
    actual_date = payload.date if payload.date else date_str
    day_log = await fetch_or_create_log(payload.user_id, actual_date)
    
    # Accumulate macros across logged meals + this new meal
    all_logged_items = []
    for m_type, m_items in day_log.get("meals", {}).items():
        all_logged_items.extend(m_items)
        
    day_total_without_this = sum_item_macros(all_logged_items)
    
    day_total = {
        "calories": round(day_total_without_this["calories"] + meal_total["calories"], 1),
        "protein": round(day_total_without_this["protein"] + meal_total["protein"], 1),
        "carbs": round(day_total_without_this["carbs"] + meal_total["carbs"], 1),
        "fat": round(day_total_without_this["fat"] + meal_total["fat"], 1),
        "fiber": round(day_total_without_this["fiber"] + meal_total["fiber"], 1)
    }
    
    # 5. Remaining calculation
    targets = await get_user_targets(payload.user_id)
    remaining = {
        "calories": round(max(0.0, targets.calories - day_total["calories"]), 1),
        "protein": round(max(0.0, targets.protein - day_total["protein"]), 1),
        "carbs": round(max(0.0, targets.carbs - day_total["carbs"]), 1),
        "fat": round(max(0.0, targets.fat - day_total["fat"]), 1),
        "fiber": round(max(0.0, targets.fiber - day_total["fiber"]), 1)
    }
    
    # 6. Format output text strings
    item_lines = [format_output_string(item) for item in calculated_items]
    items_block = "\n".join(item_lines)
    
    formatted_output = (
        f"{items_block}\n\n"
        f"Meal TOTAL - Cal:{meal_total['calories']} | P:{meal_total['protein']}g | C:{meal_total['carbs']}g | F:{meal_total['fat']}g | Fi:{meal_total['fiber']}g\n"
        f"Day TOTAL - Cal:{day_total['calories']} | P:{day_total['protein']}g | C:{day_total['carbs']}g | F:{day_total['fat']}g | Fi:{day_total['fiber']}g\n"
        f"REMAINING - Cal:{remaining['calories']} | P:{remaining['protein']}g | C:{remaining['carbs']}g | F:{remaining['fat']}g | Fi:{remaining['fiber']}g"
    )
    
    return {
        "items": calculated_items,
        "meal": meal,
        "date": actual_date,
        "meal_total": meal_total,
        "day_total": day_total,
        "remaining": remaining,
        "targets": targets,
        "formatted_output": formatted_output
    }

@app.post("/api/log-meal")
async def log_meal(payload: LogMealRequest):
    # Fetch existing
    log_doc = await daily_logs_collection.find_one({"user_id": payload.user_id, "date": payload.date})
    if not log_doc:
        log_doc = get_empty_log(payload.user_id, payload.date)
        
    # Append or overwrite items for the target meal list
    meal_key = payload.meal.lower()
    if payload.overwrite:
        log_doc["meals"][meal_key] = []
    elif meal_key not in log_doc["meals"]:
        log_doc["meals"][meal_key] = []
        
    # Standardize input items
    for item in payload.items:
        log_doc["meals"][meal_key].append(item.model_dump())
        
    # Recalculate day totals
    all_items = []
    for m_type, m_items in log_doc["meals"].items():
        all_items.extend(m_items)
        
    log_doc["totals"] = sum_item_macros(all_items)
    
    # Pop _id to avoid immutable field update error in MongoDB
    log_doc.pop("_id", None)
    
    # Save back to database
    await daily_logs_collection.update_one(
        {"user_id": payload.user_id, "date": payload.date},
        {"$set": log_doc},
        upsert=True
    )
    
    return {
        "status": "success",
        "message": "Meal logged successfully",
        "log": log_doc
    }

@app.get("/api/day-log")
async def get_day_log(user_id: str = "default", date: str = None):
    if not date:
        date = datetime.now().strftime("%Y-%m-%d")
        
    log_doc = await daily_logs_collection.find_one({"user_id": user_id, "date": date})
    if not log_doc:
        log_doc = get_empty_log(user_id, date)
    else:
        log_doc.pop("_id", None)
        
    targets = await get_user_targets(user_id)
    totals = log_doc["totals"]
    
    remaining = {
        "calories": round(max(0.0, targets.calories - totals["calories"]), 1),
        "protein": round(max(0.0, targets.protein - totals["protein"]), 1),
        "carbs": round(max(0.0, targets.carbs - totals["carbs"]), 1),
        "fat": round(max(0.0, targets.fat - totals["fat"]), 1),
        "fiber": round(max(0.0, targets.fiber - totals["fiber"]), 1)
    }
    
    return {
        "log": log_doc,
        "targets": targets,
        "remaining": remaining
    }

@app.post("/api/set-targets")
async def set_targets(payload: UserTargets):
    await users_collection.update_one(
        {"user_id": payload.user_id},
        {"$set": payload.model_dump()},
        upsert=True
    )
    return payload

@app.post("/api/set-food-preset")
async def set_food_preset(payload: FoodPreset):
    await user_food_presets_collection.update_one(
        {
            "user_id": payload.user_id, 
            "preset_name": payload.preset_name,
            "preset_unit": payload.preset_unit
        },
        {"$set": payload.model_dump()},
        upsert=True
    )
    await refresh_caches()
    return {"status": "success", "message": f"Preset '{payload.preset_name}' updated successfully."}

@app.get("/api/foods/search")
async def search_foods(q: str):
    if len(q.strip()) < 2:
        return []
    # Search name or alias case-insensitive
    import re
    regex = {"$regex": re.escape(q), "$options": "i"}
    
    # Find matching foods directly
    foods = await foods_collection.find({"name": regex}).limit(10).to_list()
    
    # Find matching aliases
    aliases = await food_aliases_collection.find({"alias": regex}).limit(10).to_list()
    
    # Merge matches
    results = []
    seen = set()
    
    for f in foods:
        if f["name"] not in seen:
            seen.add(f["name"])
            results.append({
                "name": f["name"],
                "calories": f["calories"],
                "protein": f["protein"],
                "carbs": f["carbs"],
                "fat": f["fat"],
                "fiber": f["fiber"],
                "serving_unit": f.get("serving_unit", "g")
            })
            
    for a in aliases:
        target = a["food_name"]
        if target not in seen:
            # Find the actual food
            f = await foods_collection.find_one({"name": target})
            if f:
                seen.add(target)
                results.append({
                    "name": f["name"],
                    "calories": f["calories"],
                    "protein": f["protein"],
                    "carbs": f["carbs"],
                    "fat": f["fat"],
                    "fiber": f["fiber"],
                    "serving_unit": f.get("serving_unit", "g"),
                    "matched_alias": a["alias"]
                })
                
    return results

@app.post("/api/recipes")
async def create_recipe(payload: RecipeCreate):
    # Generate recipe document
    recipe_doc = {
        "user_id": payload.user_id,
        "name": payload.name,
        "description": payload.description,
        "total_servings": payload.total_servings
    }
    
    # Save recipe
    rec_res = await recipes_collection.insert_one(recipe_doc)
    recipe_id = rec_res.inserted_id
    
    # Save recipe items
    items_to_insert = []
    for item in payload.items:
        items_to_insert.append({
            "recipe_id": recipe_id,
            "food_name": item.food_name,
            "quantity": item.quantity,
            "unit": item.unit
        })
        
    if items_to_insert:
        await recipe_items_collection.insert_many(items_to_insert)
        
    await refresh_caches()
    return {"status": "success", "recipe_id": str(recipe_id), "name": payload.name}

@app.post("/api/knowledge/upload")
async def upload_knowledge(payload: KnowledgeUploadRequest):
    if not payload.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty.")
    doc_id = await add_document(payload.text, payload.source)
    return {"status": "success", "document_id": doc_id}

@app.post("/api/knowledge/query")
async def query_knowledge(payload: KnowledgeQueryRequest):
    if not payload.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty.")
    matches = await query_rag(payload.query)
    return {"status": "success", "matches": matches}

# User Profile list and creation
@app.get("/api/users")
async def list_users():
    cursor = users_collection.find()
    users = await cursor.to_list()
    # If the default user is not in the db, we add it automatically
    has_default = any(u.get("user_id") == "default" for u in users)
    if not has_default:
        default_user = {
            "user_id": "default",
            "name": "Default User",
            "role": "user",
            "calories": 1550.0,
            "protein": 100.0,
            "carbs": 160.0,
            "fat": 30.0,
            "fiber": 25.0
        }
        await users_collection.insert_one(default_user)
        users.append(default_user)
        
    # Also guarantee an admin user exists for testing
    has_admin = any(u.get("user_id") == "admin" for u in users)
    if not has_admin:
        admin_user = {
            "user_id": "admin",
            "name": "System Admin",
            "role": "admin",
            "calories": 2000.0,
            "protein": 130.0,
            "carbs": 200.0,
            "fat": 50.0,
            "fiber": 30.0
        }
        await users_collection.insert_one(admin_user)
        users.append(admin_user)
        
    for u in users:
        u.pop("_id", None)
    return users

@app.post("/api/users")
async def save_user(payload: UserProfileCreate):
    existing = await users_collection.find_one({"user_id": payload.user_id})
    doc = payload.model_dump()
    if existing:
        await users_collection.update_one({"user_id": payload.user_id}, {"$set": doc})
    else:
        await users_collection.insert_one(doc)
    return {"status": "success", "user": doc}

@app.delete("/api/users/{user_id}")
async def delete_user(user_id: str):
    if user_id in ["default", "admin"]:
        raise HTTPException(status_code=400, detail="Cannot delete default or admin user.")
    await users_collection.delete_one({"user_id": user_id})
    return {"status": "success"}

# Move items between meal slots
@app.post("/api/move-meal-item")
async def move_meal_item(payload: MoveMealItemRequest):
    log_doc = await daily_logs_collection.find_one({"user_id": payload.user_id, "date": payload.date})
    if not log_doc:
        raise HTTPException(status_code=404, detail="Daily log not found.")
        
    from_meal = payload.from_meal.lower()
    to_meal = payload.to_meal.lower()
    
    if from_meal not in log_doc["meals"] or to_meal not in log_doc["meals"]:
        raise HTTPException(status_code=400, detail="Invalid meal categories.")
        
    items = log_doc["meals"][from_meal]
    if payload.item_index < 0 or payload.item_index >= len(items):
        raise HTTPException(status_code=400, detail="Invalid item index.")
        
    # Pop and insert
    moved_item = items.pop(payload.item_index)
    log_doc["meals"][to_meal].append(moved_item)
    
    # Recalculate totals
    all_items = []
    for m_type, m_items in log_doc["meals"].items():
        all_items.extend(m_items)
    log_doc["totals"] = sum_item_macros(all_items)
    
    log_doc.pop("_id", None)
    await daily_logs_collection.update_one(
        {"user_id": payload.user_id, "date": payload.date},
        {"$set": log_doc},
        upsert=True
    )
    return {"status": "success", "log": log_doc}

# Foods management for Admin Page
@app.get("/api/foods")
async def list_all_foods():
    cursor = foods_collection.find()
    foods = await cursor.to_list()
    for f in foods:
        f.pop("_id", None)
    return foods

@app.post("/api/foods")
async def save_food(payload: Food):
    existing = await foods_collection.find_one({"name": payload.name})
    doc = payload.model_dump()
    if existing:
        await foods_collection.update_one({"name": payload.name}, {"$set": doc})
    else:
        await foods_collection.insert_one(doc)
    await refresh_caches()
    return {"status": "success", "food": doc}

@app.delete("/api/foods/{food_name}")
async def delete_food(food_name: str):
    await foods_collection.delete_one({"name": food_name})
    await refresh_caches()
    return {"status": "success"}

# Presets list for Admin Page
@app.get("/api/presets")
async def list_all_presets():
    cursor = user_food_presets_collection.find()
    presets = await cursor.to_list()
    for p in presets:
        p.pop("_id", None)
    return presets

@app.delete("/api/presets/{preset_name}")
async def delete_preset(preset_name: str, user_id: str = "default"):
    await user_food_presets_collection.delete_one({"preset_name": preset_name, "user_id": user_id})
    await refresh_caches()
    return {"status": "success"}

