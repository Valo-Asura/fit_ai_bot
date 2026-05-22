import re
import json
import logging
import httpx
import asyncio
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Tuple
from app.config import settings
from app.models import LLMParsedResponse, LLMParsedItem

logger = logging.getLogger("fit_ai.parser")

# Detect meal from text
def detect_meal(text: str) -> str:
    text_lower = text.lower()
    if "breakfast" in text_lower:
        return "breakfast"
    elif "lunch" in text_lower:
        return "lunch"
    elif "dinner" in text_lower:
        return "dinner"
    elif "snack" in text_lower:
        return "snack"
    return "snack"  # default

# Detect date from text
def detect_date(text: str) -> str:
    text_lower = text.lower()
    today = datetime.now()
    if "yesterday" in text_lower:
        return (today - timedelta(days=1)).strftime("%Y-%m-%d")
    elif "today" in text_lower:
        return today.strftime("%Y-%m-%d")
    
    # Try matching YYYY-MM-DD
    match = re.search(r"\b(\d{4}-\d{2}-\d{2})\b", text)
    if match:
        return match.group(1)
    return today.strftime("%Y-%m-%d")

# Convert fractions to float
def parse_fraction(val: str) -> float:
    val = val.strip()
    if "/" in val:
        try:
            num, denom = val.split("/")
            return float(num) / float(denom)
        except (ValueError, ZeroDivisionError):
            return 1.0
    try:
        return float(val)
    except ValueError:
        return 1.0

# Rule-based parser
def parse_rule_based(text: str) -> Optional[List[Dict]]:
    meal = detect_meal(text)
    
    # Clean meal & date keywords to avoid interference
    clean_text = re.sub(
        r"\b(breakfast|lunch|dinner|snacks?|today|yesterday|\d{4}-\d{2}-\d{2})\b", 
        " ", 
        text, 
        flags=re.IGNORECASE
    )
    clean_text = re.sub(r"\s+", " ", clean_text).strip()
    
    # Regex matching: quantity (optional space) unit (optional space) food name
    # Looks ahead for next quantity or separators
    pattern = re.compile(
        r"(?P<quantity>\d+/\d+|\d+(?:\.\d+)?)\s*"
        r"(?P<unit>g|ml|grams?|millilitres?|cups?|bowls?|plates?|servings?|glasses?|pcs?|pieces?|scoops?|slices?|spoons?|tbsp|tsp)?\s*"
        r"(?P<name>[a-zA-Z\s/-]+?)(?=\s*(?:\d|\b(?:and|with|,|\.|\n)\b|$))",
        re.IGNORECASE
    )
    
    matches = list(pattern.finditer(clean_text))
    if not matches:
        return None
        
    parsed_items = []
    for m in matches:
        qty_str = m.group("quantity")
        unit_str = m.group("unit")
        name_str = m.group("name").strip()
        
        # Clean name
        name_str = re.sub(r"^(and|with|,|\.|\s)+", "", name_str, flags=re.IGNORECASE)
        name_str = re.sub(r"(and|with|,|\.|\s)+$", "", name_str, flags=re.IGNORECASE).strip()
        
        if not name_str:
            continue
            
        qty = parse_fraction(qty_str)
        unit = unit_str.lower().strip() if unit_str else "piece"
        
        # Map units to standard representation
        if unit in ["gram", "grams"]:
            unit = "g"
        elif unit in ["millilitre", "millilitres"]:
            unit = "ml"
        elif unit in ["pcs", "pc", "piece", "pieces"]:
            unit = "piece"
        elif unit in ["cups", "cup"]:
            unit = "cup"
        elif unit in ["bowls", "bowl"]:
            unit = "bowl"
        elif unit in ["plates", "plate"]:
            unit = "plate"
        elif unit in ["servings", "serving"]:
            unit = "serving"
        elif unit in ["glasses", "glass"]:
            unit = "glass"
        elif unit in ["scoops", "scoop"]:
            unit = "scoop"
        elif unit in ["slices", "slice"]:
            unit = "slice"
        elif unit in ["spoons", "spoon", "tbsp", "tsp"]:
            unit = "spoon"
            
        parsed_items.append({
            "name": name_str,
            "quantity": qty,
            "unit": unit,
            "meal": meal
        })
        
    return parsed_items if len(parsed_items) > 0 else None

# LLM Prompts and Parsing Callers
SYSTEM_PROMPT = """You are a food parser assistant. Convert messy user text describing food eaten into a structured JSON format.
CRITICAL RULES:
1. NEVER calculate calories or macros.
2. Return ONLY valid JSON matching the schema. No explanations, no markdown markdown blocks (do not wrap in ```json).
3. If meal is not specified, default it to "snack".

JSON Schema:
{
  "items": [
    {
      "name": "food item name",
      "quantity": 1.0,
      "unit": "g|ml|piece|cup|bowl|plate|serving|glass|scoop|slice|spoon",
      "meal": "breakfast|lunch|dinner|snack"
    }
  ]
}
"""

async def call_groq(text: str, provider_model: str, api_key: str) -> Optional[str]:
    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": provider_model or "llama3-70b-8192",
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": text}
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.0
    }
    async with httpx.AsyncClient() as client:
        response = await client.post(url, json=payload, headers=headers, timeout=5.0)
        if response.status_code == 200:
            return response.json()["choices"][0]["message"]["content"]
    return None

async def call_gemini(text: str, provider_model: str, api_key: str) -> Optional[str]:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{provider_model or 'gemini-1.5-flash'}:generateContent?key={api_key}"
    payload = {
        "contents": [{
            "parts": [{
                "text": f"{SYSTEM_PROMPT}\n\nUser input: {text}"
            }]
        }],
        "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": 0.0
        }
    }
    async with httpx.AsyncClient() as client:
        response = await client.post(url, json=payload, timeout=5.0)
        if response.status_code == 200:
            try:
                res_data = response.json()
                text_out = res_data["candidates"][0]["content"]["parts"][0]["text"]
                return text_out
            except Exception as e:
                logger.error(f"Error parsing Gemini response: {e}")
    return None

async def call_ollama(text: str, base_url: str, model: str) -> Optional[str]:
    url = f"{base_url}/api/generate"
    payload = {
        "model": model or "qwen3:4b",
        "prompt": f"{SYSTEM_PROMPT}\n\nUser Input: {text}",
        "format": "json",
        "stream": False,
        "options": {"temperature": 0.0}
    }
    async with httpx.AsyncClient() as client:
        response = await client.post(url, json=payload, timeout=5.0)
        if response.status_code == 200:
            return response.json().get("response")
    return None

# General Parser with Timeout and Fallbacks
async def parse_with_llm(text: str, provider: str = None) -> List[Dict]:
    if not provider:
        provider = settings.LLM_PROVIDER
        
    providers_order = [provider]
    all_providers = ["gemini", "groq", "ollama"]
    for p in all_providers:
        if p not in providers_order:
            providers_order.append(p)
            
    last_error = None
    for p in providers_order:
        logger.info(f"Attempting to parse food with LLM provider: {p}")
        try:
            res_content = None
            if p == "groq" and settings.GROQ_API_KEY:
                res_content = await call_groq(text, settings.GROQ_MODEL, settings.GROQ_API_KEY)
            elif p == "gemini" and settings.GEMINI_API_KEY:
                res_content = await call_gemini(text, settings.GEMINI_MODEL, settings.GEMINI_API_KEY)
            elif p == "ollama":
                res_content = await call_ollama(text, settings.OLLAMA_BASE_URL, settings.OLLAMA_MODEL)
                
            if res_content:
                # Clean up markdown output blocks if model ignored instructions
                res_content = res_content.strip()
                if res_content.startswith("```"):
                    res_content = re.sub(r"^```(?:json)?\n", "", res_content)
                    res_content = re.sub(r"\n```$", "", res_content)
                
                data = json.loads(res_content)
                # Validate with Pydantic
                parsed = LLMParsedResponse(**data)
                return [item.model_dump() for item in parsed.items]
        except Exception as e:
            logger.warning(f"Provider {p} failed parsing: {e}")
            last_error = e
            
    # Mock fallback to test offline / empty api key modes
    logger.warning("All LLM providers failed or API keys missing. Falling back to Mock parser.")
    # Return a basic parsed item from regex or simple split as mock fallback
    rule_parsed = parse_rule_based(text)
    if rule_parsed:
        return rule_parsed
        
    # Standard dummy fallback
    return [{
        "name": "unknown food",
        "quantity": 1.0,
        "unit": "serving",
        "meal": detect_meal(text)
    }]

async def parse_food_input(text: str, provider: str = None) -> Tuple[List[Dict], str, str]:
    """
    Parses messy user text. First tries rule-based, then LLM.
    Returns: (parsed_items, meal_type, date_str)
    """
    meal = detect_meal(text)
    date_str = detect_date(text)
    
    # 1. Try rule-based parser first
    parsed_items = parse_rule_based(text)
    if parsed_items:
        logger.info("Successfully parsed food input via Rule Parser.")
        return parsed_items, meal, date_str
        
    # 2. Fallback to switchable LLM
    parsed_items = await parse_with_llm(text, provider)
    logger.info("Parsed food input via LLM Parser.")
    return parsed_items, meal, date_str
