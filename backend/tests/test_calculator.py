import pytest
import pytest_asyncio
import asyncio
from app.database import init_db
from seed import run_seed
from app.calculator import (
    calculate_single_item_macros,
    find_matching_food,
    refresh_caches
)
from app.database import recipes_collection, recipe_items_collection

# Set up test database fixtures
@pytest_asyncio.fixture(scope="function", autouse=True)
async def setup_db():
    # Run seed to populate the database
    await run_seed()
    await refresh_caches()
    yield

@pytest.mark.asyncio
async def test_find_matching_food():
    # Exact match
    food, match = await find_matching_food("chicken")
    assert food is not None
    assert food["name"] == "chicken"
    assert match == "chicken"

    # Alias match
    food_alias, match_alias = await find_matching_food("boiled eggs")
    assert food_alias is not None
    assert food_alias["name"] == "egg whole"
    assert match_alias == "boiled eggs"

    # Fuzzy match
    food_fuzzy, match_fuzzy = await find_matching_food("chiken brest")
    assert food_fuzzy is not None
    assert food_fuzzy["name"] == "chicken"

@pytest.mark.asyncio
async def test_calculate_exact_macros():
    # Weighed grams
    res = await calculate_single_item_macros("chicken", 200, "g")
    assert res["food_name"] == "chicken"
    assert res["calories"] == 240.0
    assert res["protein"] == 50.0
    assert res["carbs"] == 0.0
    assert res["fat"] == 4.0
    assert res["accuracy"] == "EXACT"
    assert "HP" in res["rich_tags"]

    # Weighed ml
    res_milk = await calculate_single_item_macros("milk", 250, "ml")
    assert res_milk["food_name"] == "milk"
    assert res_milk["calories"] == 150.0
    assert res_milk["protein"] == 8.0
    assert res_milk["carbs"] == 12.0
    assert res_milk["fat"] == 8.0
    assert res_milk["accuracy"] == "EXACT"

@pytest.mark.asyncio
async def test_calculate_preset_macros():
    # Roti preset: 1 roti = 43g wheat flour
    # Wheat flour: 364 kcal, 10g P, 76g C, 1g F, 11g Fi per 100g
    # 2 roti = 86g wheat flour
    res = await calculate_single_item_macros("roti", 2, "piece")
    assert res["food_name"] == "roti"
    assert res["quantity"] == 2
    assert res["unit"] == "piece"
    assert res["accuracy"] == "PRESET"
    
    # 86g * 3.64 = 313.04 kcal
    assert abs(res["calories"] - 313.0) <= 0.5
    # 86g * 0.1 = 8.6g protein
    assert abs(res["protein"] - 8.6) <= 0.1
    # 86g * 0.76 = 65.36g carbs
    assert abs(res["carbs"] - 65.4) <= 0.2

@pytest.mark.asyncio
async def test_calculate_estimate_macros():
    # Unweighed home food default fallback
    res = await calculate_single_item_macros("aloo sabji", 1, "bowl")
    # Matches "sabji" (calories: 120, protein: 2, carbs: 15, fat: 6, fiber: 3 per 150g serving)
    # Unit bowl translates to default weight 200g (200 / 150 = 1.33 scale)
    # Let's verify accuracy label is EST
    assert res["accuracy"] == "EST"
    assert res["calories"] > 0
    assert res["protein"] > 0

@pytest.mark.asyncio
async def test_recipe_calculation():
    # Create a custom recipe
    recipe_doc = {
        "user_id": "default",
        "name": "home paneer",
        "description": "simple paneer curry",
        "total_servings": 2.0
    }
    rec_res = await recipes_collection.insert_one(recipe_doc)
    recipe_id = rec_res.inserted_id
    
    # Ingredients: 100g chicken (120 kcal) + 10g oil (90 kcal) = 210 kcal total
    ingredients = [
        {"recipe_id": recipe_id, "food_name": "chicken", "quantity": 100.0, "unit": "g"},
        {"recipe_id": recipe_id, "food_name": "oil", "quantity": 10.0, "unit": "g"}
    ]
    await recipe_items_collection.insert_many(ingredients)
    await refresh_caches()
    
    # Calculate for 1 serving of "home paneer"
    # Total recipe macros = 210 kcal. For 1 serving (1/2 recipe) = 105 kcal
    res = await calculate_single_item_macros("home paneer", 1, "serving")
    
    assert res["food_name"] == "home paneer"
    assert res["accuracy"] == "EXACT"
    assert abs(res["calories"] - 105.0) <= 0.5
    # Clean up
    await recipes_collection.delete_one({"_id": recipe_id})
    await recipe_items_collection.delete_many({"recipe_id": recipe_id})
    await refresh_caches()
