import asyncio
import logging
from app.database import (
    init_db,
    foods_collection,
    food_aliases_collection,
    user_food_presets_collection,
    users_collection,
    db
)

logger = logging.getLogger("fit_ai.seed")
logging.basicConfig(level=logging.INFO)

# Seed Foods definition
seed_foods = [
    {"name": "wheat flour", "calories": 364.0, "protein": 10.0, "carbs": 76.0, "fat": 1.0, "fiber": 11.0, "serving_size": 100.0, "serving_unit": "g", "is_packaged": False},
    {"name": "rice raw", "calories": 350.0, "protein": 7.0, "carbs": 78.0, "fat": 0.5, "fiber": 1.0, "serving_size": 100.0, "serving_unit": "g", "is_packaged": False},
    {"name": "rice cooked", "calories": 130.0, "protein": 2.7, "carbs": 28.0, "fat": 0.2, "fiber": 0.4, "serving_size": 100.0, "serving_unit": "g", "is_packaged": False},
    {"name": "dal raw", "calories": 343.0, "protein": 24.0, "carbs": 60.0, "fat": 1.5, "fiber": 15.0, "serving_size": 100.0, "serving_unit": "g", "is_packaged": False},
    {"name": "dal cooked", "calories": 100.0, "protein": 7.0, "carbs": 18.0, "fat": 0.5, "fiber": 4.5, "serving_size": 100.0, "serving_unit": "g", "is_packaged": False},
    {"name": "egg whole", "calories": 143.0, "protein": 13.0, "carbs": 1.0, "fat": 10.0, "fiber": 0.0, "serving_size": 50.0, "serving_unit": "piece", "is_packaged": False},
    {"name": "egg white", "calories": 52.0, "protein": 11.0, "carbs": 0.7, "fat": 0.2, "fiber": 0.0, "serving_size": 33.0, "serving_unit": "piece", "is_packaged": False},
    {"name": "milk", "calories": 60.0, "protein": 3.2, "carbs": 4.8, "fat": 3.2, "fiber": 0.0, "serving_size": 100.0, "serving_unit": "ml", "is_packaged": False},
    {"name": "oil", "calories": 900.0, "protein": 0.0, "carbs": 0.0, "fat": 100.0, "fiber": 0.0, "serving_size": 100.0, "serving_unit": "g", "is_packaged": False},
    {"name": "ghee", "calories": 900.0, "protein": 0.0, "carbs": 0.0, "fat": 100.0, "fiber": 0.0, "serving_size": 100.0, "serving_unit": "g", "is_packaged": False},
    {"name": "potato", "calories": 77.0, "protein": 2.0, "carbs": 17.0, "fat": 0.1, "fiber": 2.2, "serving_size": 100.0, "serving_unit": "g", "is_packaged": False},
    {"name": "onion", "calories": 40.0, "protein": 1.1, "carbs": 9.3, "fat": 0.1, "fiber": 1.7, "serving_size": 100.0, "serving_unit": "g", "is_packaged": False},
    {"name": "tomato", "calories": 18.0, "protein": 0.9, "carbs": 3.9, "fat": 0.2, "fiber": 1.2, "serving_size": 100.0, "serving_unit": "g", "is_packaged": False},
    {"name": "sabji", "calories": 120.0, "protein": 2.0, "carbs": 15.0, "fat": 6.0, "fiber": 3.0, "serving_size": 150.0, "serving_unit": "serving", "is_packaged": False},
    {"name": "soya chunks", "calories": 345.0, "protein": 52.0, "carbs": 33.0, "fat": 0.5, "fiber": 13.0, "serving_size": 100.0, "serving_unit": "g", "is_packaged": False},
    {"name": "chicken", "calories": 120.0, "protein": 25.0, "carbs": 0.0, "fat": 2.0, "fiber": 0.0, "serving_size": 100.0, "serving_unit": "g", "is_packaged": False},
    {"name": "mutton", "calories": 143.0, "protein": 20.0, "carbs": 0.0, "fat": 7.0, "fiber": 0.0, "serving_size": 100.0, "serving_unit": "g", "is_packaged": False},
    {"name": "whey", "calories": 390.0, "protein": 75.0, "carbs": 9.0, "fat": 6.0, "fiber": 0.0, "serving_size": 33.0, "serving_unit": "scoop", "is_packaged": True},
    {"name": "isabgol", "calories": 180.0, "protein": 0.0, "carbs": 80.0, "fat": 0.0, "fiber": 80.0, "serving_size": 100.0, "serving_unit": "g", "is_packaged": True},
    {"name": "banana", "calories": 89.0, "protein": 1.1, "carbs": 23.0, "fat": 0.3, "fiber": 2.6, "serving_size": 120.0, "serving_unit": "piece", "is_packaged": False},
    {"name": "apple", "calories": 52.0, "protein": 0.3, "carbs": 14.0, "fat": 0.2, "fiber": 2.4, "serving_size": 150.0, "serving_unit": "piece", "is_packaged": False},
    {"name": "orange", "calories": 47.0, "protein": 0.9, "carbs": 12.0, "fat": 0.1, "fiber": 2.4, "serving_size": 130.0, "serving_unit": "piece", "is_packaged": False},
    {"name": "cucumber", "calories": 15.0, "protein": 0.7, "carbs": 3.6, "fat": 0.1, "fiber": 0.5, "serving_size": 100.0, "serving_unit": "g", "is_packaged": False},
    {"name": "energy drink", "calories": 45.0, "protein": 0.0, "carbs": 11.0, "fat": 0.0, "fiber": 0.0, "serving_size": 100.0, "serving_unit": "ml", "is_packaged": True}
]

# Seed Aliases definition
seed_aliases = [
    {"alias": "roti", "food_name": "wheat flour"}, # preset target will redirect
    {"alias": "egg", "food_name": "egg whole"},
    {"alias": "boiled egg", "food_name": "egg whole"},
    {"alias": "boiled eggs", "food_name": "egg whole"},
    {"alias": "eggs", "food_name": "egg whole"},
    {"alias": "egg whites", "food_name": "egg white"},
    {"alias": "cooked rice", "food_name": "rice cooked"},
    {"alias": "cooked dal", "food_name": "dal cooked"},
    {"alias": "raw rice", "food_name": "rice raw"},
    {"alias": "raw dal", "food_name": "dal raw"},
    {"alias": "atta", "food_name": "wheat flour"},
    {"alias": "whey protein", "food_name": "whey"},
    {"alias": "whey scoop", "food_name": "whey"},
    {"alias": "isabgol husk", "food_name": "isabgol"},
    {"alias": "psyllium husk", "food_name": "isabgol"}
]

# Seed Presets definition
seed_presets = [
    {"user_id": "default", "preset_name": "roti", "preset_quantity": 1.0, "preset_unit": "piece", "target_food_name": "wheat flour", "target_quantity": 43.0, "target_unit": "g"},
    {"user_id": "default", "preset_name": "whey", "preset_quantity": 1.0, "preset_unit": "scoop", "target_food_name": "whey", "target_quantity": 33.0, "target_unit": "g"}
]

# Default User Targets
default_targets = {
    "user_id": "default",
    "calories": 1550.0,
    "protein": 100.0,
    "carbs": 160.0,
    "fat": 30.0,
    "fiber": 25.0
}

async def run_seed():
    logger.info("Initializing database...")
    await init_db()
    
    # Check if we are using real MongoDB or Mock DB
    from app.database import use_mock_db
    
    if not use_mock_db:
        # Clear collections
        logger.info("Clearing existing collections in MongoDB...")
        await foods_collection.delete_many({})
        await food_aliases_collection.delete_many({})
        await user_food_presets_collection.delete_many({})
        await users_collection.delete_many({})
    else:
        logger.info("Clearing in-memory database lists...")
        foods_collection.documents = []
        food_aliases_collection.documents = []
        user_food_presets_collection.documents = []
        users_collection.documents = []
        
    # Insert Foods
    logger.info(f"Seeding {len(seed_foods)} foods...")
    await foods_collection.insert_many(seed_foods)
    
    # Insert Aliases
    logger.info(f"Seeding {len(seed_aliases)} aliases...")
    await food_aliases_collection.insert_many(seed_aliases)
    
    # Insert Presets
    logger.info(f"Seeding {len(seed_presets)} presets...")
    await user_food_presets_collection.insert_many(seed_presets)
    
    # Insert Targets
    logger.info("Seeding default targets...")
    await users_collection.insert_one(default_targets)
    
    logger.info("Seeding complete successfully!")

if __name__ == "__main__":
    asyncio.run(run_seed())
