import pytest
from app.parser import (
    detect_meal,
    detect_date,
    parse_rule_based,
    parse_food_input
)
from datetime import datetime, timedelta

def test_detect_meal():
    assert detect_meal("Today breakfast 2 eggs") == "breakfast"
    assert detect_meal("had a large lunch") == "lunch"
    assert detect_meal("dinner with family") == "dinner"
    assert detect_meal("random mid-day snack") == "snack"
    assert detect_meal("just 2 apples") == "snack"

def test_detect_date():
    today_str = datetime.now().strftime("%Y-%m-%d")
    yesterday_str = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
    
    assert detect_date("today breakfast 2 eggs") == today_str
    assert detect_date("yesterday lunch dal chawal") == yesterday_str
    assert detect_date("2026-05-15 dinner salad") == "2026-05-15"

def test_parse_rule_based():
    # Simple items
    parsed = parse_rule_based("2 roti 5g oil 70ml milk 2 boiled eggs")
    assert parsed is not None
    assert len(parsed) == 4
    
    assert parsed[0]["name"] == "roti"
    assert parsed[0]["quantity"] == 2.0
    assert parsed[0]["unit"] == "piece"
    assert parsed[0]["meal"] == "snack" # no meal keyword in this snippet
    
    assert parsed[1]["name"] == "oil"
    assert parsed[1]["quantity"] == 5.0
    assert parsed[1]["unit"] == "g"
    
    assert parsed[2]["name"] == "milk"
    assert parsed[2]["quantity"] == 70.0
    assert parsed[2]["unit"] == "ml"
    
    assert parsed[3]["name"] == "boiled eggs"
    assert parsed[3]["quantity"] == 2.0
    assert parsed[3]["unit"] == "piece"

def test_parse_rule_based_fractions():
    parsed = parse_rule_based("1/2 cup cooked dal")
    assert parsed is not None
    assert len(parsed) == 1
    assert parsed[0]["name"] == "cooked dal"
    assert parsed[0]["quantity"] == 0.5
    assert parsed[0]["unit"] == "cup"

@pytest.mark.asyncio
async def test_parse_food_input_e2e():
    # Rule based succeeds
    parsed, meal, date_str = await parse_food_input("breakfast 2 roti 10g ghee")
    assert meal == "breakfast"
    assert len(parsed) == 2
    assert parsed[0]["name"] == "roti"
    assert parsed[1]["name"] == "ghee"
    assert parsed[1]["quantity"] == 10.0
    assert parsed[1]["unit"] == "g"

    # Rule based fails (messy input), falls back to LLM (which runs mock in testing when keys are empty)
    parsed_llm, meal_llm, date_llm = await parse_food_input("I had some complex curry and bread for lunch today")
    assert meal_llm == "lunch"
    assert len(parsed_llm) > 0
