import re
import logging
from typing import List, Dict, Tuple, Optional
from rapidfuzz import process, utils
from app.database import foods_collection, food_aliases_collection, user_food_presets_collection, recipes_collection, recipe_items_collection
from app.models import DailyLogItem

logger = logging.getLogger("fit_ai.calculator")

# Local cache for performance
_food_cache: List[Dict] = []
_alias_cache: List[Dict] = []
_preset_cache: List[Dict] = []

async def refresh_caches():
    global _food_cache, _alias_cache, _preset_cache
    try:
        # Load all foods
        cursor = foods_collection.find()
        _food_cache = await cursor.to_list()
        
        # Load all aliases
        cursor = food_aliases_collection.find()
        _alias_cache = await cursor.to_list()
        
        # Load all default/user presets
        cursor = user_food_presets_collection.find()
        _preset_cache = await cursor.to_list()
        
        logger.info(f"Caches refreshed. Foods: {len(_food_cache)}, Aliases: {len(_alias_cache)}, Presets: {len(_preset_cache)}")
    except Exception as e:
        logger.error(f"Error refreshing caches: {e}")

# Helper to look up a recipe
async def get_recipe_macros(recipe_name: str, logged_qty: float, logged_unit: str) -> Optional[Dict]:
    # Check if a recipe exists with this name (case-insensitive regex)
    recipe = await recipes_collection.find_one({"name": {"$regex": f"^{re.escape(recipe_name)}$", "$options": "i"}})
    if not recipe:
        return None
        
    recipe_id = recipe["_id"]
    # Get recipe items
    items_cursor = recipe_items_collection.find({"recipe_id": recipe_id})
    items = await items_cursor.to_list()
    
    total_cal = 0.0
    total_p = 0.0
    total_c = 0.0
    total_f = 0.0
    total_fi = 0.0
    
    for item in items:
        # Resolve each ingredient recursively
        # We calculate the macros of each ingredient item
        ing_macros = await calculate_single_item_macros(
            item["food_name"], 
            item["quantity"], 
            item["unit"], 
            user_id=recipe.get("user_id", "default"),
            is_recipe_ingredient=True
        )
        total_cal += ing_macros["calories"]
        total_p += ing_macros["protein"]
        total_c += ing_macros["carbs"]
        total_f += ing_macros["fat"]
        total_fi += ing_macros["fiber"]
        
    # Scale by logged quantity / total_servings
    total_servings = recipe.get("total_servings", 1.0)
    scale = logged_qty / total_servings
    
    return {
        "food_name": recipe["name"],
        "quantity": logged_qty,
        "unit": logged_unit,
        "calories": round(total_cal * scale, 1),
        "protein": round(total_p * scale, 1),
        "carbs": round(total_c * scale, 1),
        "fat": round(total_f * scale, 1),
        "fiber": round(total_fi * scale, 1),
        "accuracy": "EXACT",  # recipe calculation is EXACT
        "rich_tags": generate_rich_tags(total_cal * scale, total_p * scale, total_c * scale, total_f * scale, total_fi * scale)
    }

import re

# Match food names/aliases
async def find_matching_food(query_name: str, user_id: str = "default") -> Tuple[Optional[Dict], Optional[str]]:
    """
    Finds matching food in cache or DB.
    Returns: (food_doc, matched_alias_or_name)
    """
    if not _food_cache:
        await refresh_caches()
        
    query_clean = query_name.lower().strip()
    
    # 1. Exact food match
    for food in _food_cache:
        if food["name"].lower() == query_clean:
            return food, food["name"]
            
    # 2. Exact alias match
    for alias in _alias_cache:
        if alias["alias"].lower() == query_clean:
            # Find the linked food
            target = alias["food_name"]
            for food in _food_cache:
                if food["name"].lower() == target.lower():
                    return food, alias["alias"]
                    
    # 3. Fuzzy matching using RapidFuzz
    choices = {}
    for food in _food_cache:
        choices[food["name"]] = ("food", food)
    for alias in _alias_cache:
        choices[alias["alias"]] = ("alias", alias)
        
    if not choices:
        return None, None
        
    match = process.extractOne(query_clean, list(choices.keys()), processor=utils.default_process, score_cutoff=60.0)
    if match:
        matched_str = match[0]
        match_type, obj = choices[matched_str]
        if match_type == "food":
            return obj, obj["name"]
        else:
            # It's an alias, find its target food
            target = obj["food_name"]
            for food in _food_cache:
                if food["name"].lower() == target.lower():
                    return food, obj["alias"]
                    
    return None, None

# Rich tags logic
def generate_rich_tags(cal: float, p: float, c: float, f: float, fi: float) -> List[str]:
    tags = []
    # HP (High Protein): P > 15g per 100g, or P kcal >= 20% of total food kcal (protein has 4 kcal/g)
    if p > 15 or (cal > 0 and (p * 4 / cal) >= 0.20):
        tags.append("HP")
    # HC (High Carb): C > 60g per 100g, or C kcal >= 60% of total food kcal
    if c > 60 or (cal > 0 and (c * 4 / cal) >= 0.60):
        tags.append("HC")
    # HF (High Fat): F > 20g per 100g, or F kcal >= 50% of total food kcal
    if f > 20 or (cal > 0 and (f * 9 / cal) >= 0.50):
        tags.append("HF")
    # HFi (High Fiber): Fi > 5g per 100g, or fiber is a significant component
    if fi > 5:
        tags.append("HFi")
    return tags

async def calculate_single_item_macros(
    name: str, 
    quantity: float, 
    unit: str, 
    user_id: str = "default",
    is_recipe_ingredient: bool = False
) -> Dict:
    """
    Calculates macros for a single item.
    """
    # Clean inputs
    name = name.strip()
    unit = unit.lower().strip()
    
    # 0. Check if it is a custom recipe
    if not is_recipe_ingredient:
        recipe_result = await get_recipe_macros(name, quantity, unit)
        if recipe_result:
            return recipe_result

    # 1. Check presets first
    preset_match = None
    for p in _preset_cache:
        # Check both user_id scope and preset name match
        if p["preset_name"].lower() == name.lower() and p["preset_unit"].lower() == unit.lower() and p.get("user_id", "default") in [user_id, "default"]:
            preset_match = p
            break
            
    if preset_match:
        # Resolve preset (e.g. 1 roti = 43g wheat flour)
        target_food_name = preset_match["target_food_name"]
        target_qty = quantity * preset_match["target_quantity"]
        target_unit = preset_match["target_unit"]
        
        # Recurse with target food
        result = await calculate_single_item_macros(target_food_name, target_qty, target_unit, user_id, is_recipe_ingredient)
        result["food_name"] = name  # Keep original preset name for display
        result["quantity"] = quantity
        result["unit"] = unit
        result["accuracy"] = "PRESET"
        return result

    # 2. Match food in database
    food_doc, matched_term = await find_matching_food(name, user_id)
    
    if not food_doc:
        # If no food found, return a default estimate matching "sabji" or generic food item
        # to ensure the backend never crashes and behaves gracefully.
        logger.warning(f"Food match not found for: {name}. Falling back to default estimate.")
        # Default estimate values
        cal = 100.0 * quantity
        p = 2.0 * quantity
        c = 12.0 * quantity
        f = 5.0 * quantity
        fi = 2.0 * quantity
        return {
            "food_name": name,
            "quantity": quantity,
            "unit": unit,
            "calories": round(cal, 1),
            "protein": round(p, 1),
            "carbs": round(c, 1),
            "fat": round(f, 1),
            "fiber": round(fi, 1),
            "accuracy": "EST",
            "rich_tags": generate_rich_tags(cal, p, c, f, fi)
        }

    # 3. Calculate macros based on matched food
    # Standard food macros are stored per 100g or 100ml
    food_unit = food_doc.get("serving_unit", "g").lower()
    serving_size = food_doc.get("serving_size", 100.0)
    
    # Determine scale factor and accuracy label
    accuracy = "EST"
    
    if unit in ["g", "ml"]:
        # Weighed gram/ml is EXACT
        scale = quantity / 100.0
        accuracy = "EXACT"
    elif unit == food_unit:
        # Logged unit matches food DB unit (e.g. piece or scoop)
        # Check if food is packaged or unit is standard preset-like
        scale = (quantity * serving_size) / 100.0
        # Check if packaged label or standard preset
        if food_doc.get("is_packaged", False):
            accuracy = "EXACT"
        else:
            accuracy = "PRESET"
    else:
        # Unit mismatch, estimate based on average values
        # Default unit weight mapping
        unit_weights = {
            "piece": 50.0,
            "egg": 50.0,
            "scoop": 33.0,
            "cup": 150.0,
            "bowl": 200.0,
            "plate": 300.0,
            "serving": 150.0,
            "glass": 250.0,
            "slice": 25.0,
            "spoon": 10.0
        }
        weight = unit_weights.get(unit, 100.0)
        scale = (quantity * weight) / 100.0
        
        # If it's a rough volume unit, label it EST
        if unit in ["bowl", "plate", "serving", "glass"]:
            accuracy = "EST"
        else:
            accuracy = "PRESET"

    cal = food_doc["calories"] * scale
    p = food_doc["protein"] * scale
    c = food_doc["carbs"] * scale
    f = food_doc["fat"] * scale
    fi = food_doc["fiber"] * scale

    return {
        "food_name": food_doc["name"],
        "quantity": quantity,
        "unit": unit,
        "calories": round(cal, 1),
        "protein": round(p, 1),
        "carbs": round(c, 1),
        "fat": round(f, 1),
        "fiber": round(fi, 1),
        "accuracy": accuracy,
        "rich_tags": generate_rich_tags(cal, p, c, f, fi)
    }

async def calculate_macros_for_items(items: List[Dict], user_id: str = "default") -> List[Dict]:
    results = []
    for item in items:
        res = await calculate_single_item_macros(
            item["name"], 
            item["quantity"], 
            item["unit"], 
            user_id
        )
        results.append(res)
    return results

def format_output_string(item: Dict) -> str:
    # Format: Name - Cal:X | P:Xg | C:Xg | F:Xg | Fi:Xg [HP/HC/HF/HFi] [EXACT/PRESET/EST]
    tags_str = f" [{' / '.join(item['rich_tags'])}]" if item["rich_tags"] else ""
    return (
        f"{item['food_name']} - Cal:{item['calories']} | P:{item['protein']}g | "
        f"C:{item['carbs']}g | F:{item['fat']}g | Fi:{item['fiber']}g{tags_str} [{item['accuracy']}]"
    )
