import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, 
  Trash2, 
  Sparkles, 
  Settings, 
  BookOpen, 
  ChevronDown, 
  ChevronUp, 
  Search, 
  Loader2, 
  Calendar,
  AlertCircle,
  CheckCircle,
  ChefHat,
  Bookmark
} from 'lucide-react';
import './App.css';

const API_BASE = "http://localhost:8000/api";

interface TargetMacros {
  user_id: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

interface FoodItem {
  food_name: string;
  quantity: number;
  unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  accuracy: 'EXACT' | 'PRESET' | 'EST';
  rich_tags: string[];
}

interface MealLogs {
  [key: string]: FoodItem[];
}

interface DayLog {
  user_id: string;
  date: string;
  meals: MealLogs;
  totals: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
  };
}

interface SearchResult {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  serving_unit: string;
  matched_alias?: string;
}

export default function App() {


  // Navigation tab
  const [activeTab, setActiveTab] = useState<'dashboard' | 'presets' | 'recipes' | 'rag'>('dashboard');

  // Core User Log Data
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [dayLog, setDayLog] = useState<DayLog | null>(null);
  const [targets, setTargets] = useState<TargetMacros>({
    user_id: "default",
    calories: 1550,
    protein: 100,
    carbs: 160,
    fat: 30,
    fiber: 25
  });
  const [remaining, setRemaining] = useState<Record<string, number>>({});

  // AI Parse Inputs
  const [aiText, setAiText] = useState<string>("");
  const [llmProvider, setLlmProvider] = useState<string>("groq");
  const [parsingLoading, setParsingLoading] = useState<boolean>(false);
  const [parseResultString, setParseResultString] = useState<string>("");
  const [apiSuccessMsg, setApiSuccessMsg] = useState<string>("");
  const [apiErrorMsg, setApiErrorMsg] = useState<string>("");

  // Autocomplete search states
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showDropdown, setShowDropdown] = useState<boolean>(false);
  const [activeSearchMeal, setActiveSearchMeal] = useState<string>("breakfast");
  const [selectedSearchItem, setSelectedSearchItem] = useState<SearchResult | null>(null);
  const [searchItemQty, setSearchItemQty] = useState<number>(100);
  const [searchItemUnit, setSearchItemUnit] = useState<string>("g");

  // Collapse/Expand state for meals
  const [collapsedMeals, setCollapsedMeals] = useState<Record<string, boolean>>({
    breakfast: false,
    lunch: false,
    dinner: false,
    snack: false
  });

  // Presets Panel State
  const [presetForm, setPresetForm] = useState({
    preset_name: "",
    preset_quantity: 1,
    preset_unit: "piece",
    target_food_name: "",
    target_quantity: 50,
    target_unit: "g"
  });

  // Targets Panel State
  const [targetForm, setTargetForm] = useState<TargetMacros>({
    user_id: "default",
    calories: 1550,
    protein: 100,
    carbs: 160,
    fat: 30,
    fiber: 25
  });

  // Custom Recipe Creation State
  const [recipeForm, setRecipeForm] = useState({
    name: "",
    description: "",
    total_servings: 2
  });
  const [recipeIngredients, setRecipeIngredients] = useState<Array<{ food_name: string; quantity: number; unit: string }>>([
    { food_name: "", quantity: 100, unit: "g" }
  ]);

  // RAG Search & Document States
  const [ragDocText, setRagDocText] = useState<string>("");
  const [ragDocSource, setRagDocSource] = useState<string>("custom_diet_doc");
  const [ragQuery, setRagQuery] = useState<string>("");
  const [ragMatches, setRagMatches] = useState<Array<{ text: string; source: string; score: number }>>([]);

  // Refs for debouncing search
  const debounceTimer = useRef<number | null>(null);

  // Health check and backend connection
  const [dbStatus, setDbStatus] = useState<string>("connecting");



  // Fetch log on date or view change
  useEffect(() => {
    fetchDayLog();
    checkHealth();
  }, [selectedDate]);

  const checkHealth = async () => {
    try {
      const res = await fetch(`${API_BASE}/health`);
      if (res.ok) {
        const data = await res.json();
        setDbStatus(data.database);
      } else {
        setDbStatus("unknown");
      }
    } catch {
      setDbStatus("offline");
    }
  };

  const fetchDayLog = async () => {
    try {
      const res = await fetch(`${API_BASE}/day-log?user_id=default&date=${selectedDate}`);
      if (res.ok) {
        const data = await res.json();
        setDayLog(data.log);
        setTargets(data.targets);
        setTargetForm(data.targets);
        setRemaining(data.remaining);
      }
    } catch (err) {
      console.error("Error fetching day log:", err);
      showError("Failed to load daily log from server.");
    }
  };

  const showSuccess = (msg: string) => {
    setApiSuccessMsg(msg);
    setTimeout(() => setApiSuccessMsg(""), 4000);
  };

  const showError = (msg: string) => {
    setApiErrorMsg(msg);
    setTimeout(() => setApiErrorMsg(""), 4500);
  };

  // AI input parsing handler
  const handleAIParse = async () => {
    if (!aiText.trim()) return;
    setParsingLoading(true);
    setParseResultString("");
    setApiErrorMsg("");

    try {
      const res = await fetch(`${API_BASE}/parse-food`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-LLM-Provider': llmProvider
        },
        body: JSON.stringify({
          text: aiText,
          user_id: "default",
          date: selectedDate
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to parse input via AI.");
      }

      const data = await res.json();
      setParseResultString(data.formatted_output);
      
      // Auto log meal directly
      const logRes = await fetch(`${API_BASE}/log-meal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: "default",
          date: data.date,
          meal: data.meal,
          items: data.items
        })
      });

      if (logRes.ok) {
        showSuccess(`AI successfully parsed and logged items to ${data.meal}!`);
        setAiText("");
        fetchDayLog();
      }
    } catch (err: any) {
      showError(err.message || "Error processing your food input.");
    } finally {
      setParsingLoading(false);
    }
  };

  // Autocomplete debounced food search
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    if (val.trim().length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    debounceTimer.current = window.setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE}/foods/search?q=${encodeURIComponent(val)}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data);
          setShowDropdown(true);
        }
      } catch (err) {
        console.error("Error searching foods:", err);
      }
    }, 300);
  };

  const handleSelectSearchResult = (food: SearchResult) => {
    setSelectedSearchItem(food);
    setSearchItemUnit(food.serving_unit);
    setSearchItemQty(food.serving_unit === 'g' || food.serving_unit === 'ml' ? 100 : 1);
    setShowDropdown(false);
  };

  const handleAddSearchItem = async () => {
    if (!selectedSearchItem) return;

    try {
      // Direct calculate call logic
      const parseResponse = await fetch(`${API_BASE}/parse-food`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `${searchItemQty}${searchItemUnit} ${selectedSearchItem.name}`,
          user_id: "default",
          date: selectedDate
        })
      });

      if (!parseResponse.ok) throw new Error("Calculation failed");
      const parseData = await parseResponse.json();

      const logResponse = await fetch(`${API_BASE}/log-meal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: "default",
          date: selectedDate,
          meal: activeSearchMeal,
          items: parseData.items
        })
      });

      if (logResponse.ok) {
        showSuccess(`Logged ${selectedSearchItem.name} to ${activeSearchMeal}`);
        setSelectedSearchItem(null);
        setSearchQuery("");
        fetchDayLog();
      }
    } catch (err) {
      showError("Failed to log searched food item.");
    }
  };

  // Delete logged item
  const handleDeleteItem = async (mealName: string, indexToDelete: number) => {
    if (!dayLog) return;
    
    // Copy active meals
    const updatedMeals = JSON.parse(JSON.stringify(dayLog.meals));
    updatedMeals[mealName].splice(indexToDelete, 1);

    try {
      // Re-save entire updated daily log structure
      const response = await fetch(`${API_BASE}/log-meal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: "default",
          date: selectedDate,
          meal: mealName,
          items: updatedMeals[mealName]
        })
      });

      if (response.ok) {
        // Trigger a delete update
        // If we emptied, we should make sure daily log deletes or resets
        // Our backend log-meal replaces the entire array for that meal, so sending updated list works perfectly
        showSuccess("Item deleted successfully.");
        fetchDayLog();
      }
    } catch (err) {
      showError("Failed to delete log entry.");
    }
  };

  // Add Preset
  const handleSavePreset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!presetForm.preset_name || !presetForm.target_food_name) return;

    try {
      const res = await fetch(`${API_BASE}/set-food-preset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: "default",
          preset_name: presetForm.preset_name,
          preset_quantity: Number(presetForm.preset_quantity),
          preset_unit: presetForm.preset_unit,
          target_food_name: presetForm.target_food_name,
          target_quantity: Number(presetForm.target_quantity),
          target_unit: presetForm.target_unit
        })
      });

      if (res.ok) {
        showSuccess(`Preset '${presetForm.preset_name}' created successfully!`);
        setPresetForm({
          preset_name: "",
          preset_quantity: 1,
          preset_unit: "piece",
          target_food_name: "",
          target_quantity: 50,
          target_unit: "g"
        });
      }
    } catch (err) {
      showError("Failed to save food preset.");
    }
  };

  // Save targets
  const handleSaveTargets = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/set-targets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(targetForm)
      });

      if (res.ok) {
        showSuccess("Target macros saved successfully!");
        fetchDayLog();
      }
    } catch (err) {
      showError("Failed to update target macros.");
    }
  };

  // Recipe ingredients handlers
  const handleIngredientChange = (index: number, key: string, value: string | number) => {
    const list = [...recipeIngredients];
    (list[index] as any)[key] = value;
    setRecipeIngredients(list);
  };

  const handleAddIngredientRow = () => {
    setRecipeIngredients([...recipeIngredients, { food_name: "", quantity: 100, unit: "g" }]);
  };

  const handleRemoveIngredientRow = (index: number) => {
    const list = [...recipeIngredients];
    list.splice(index, 1);
    setRecipeIngredients(list);
  };

  const handleCreateRecipe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipeForm.name || recipeIngredients.length === 0) return;

    try {
      const payload = {
        user_id: "default",
        name: recipeForm.name,
        description: recipeForm.description,
        total_servings: Number(recipeForm.total_servings),
        items: recipeIngredients.map(ing => ({
          food_name: ing.food_name,
          quantity: Number(ing.quantity),
          unit: ing.unit
        }))
      };

      const res = await fetch(`${API_BASE}/recipes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        showSuccess(`Recipe '${data.name}' saved with ID: ${data.recipe_id}`);
        setRecipeForm({ name: "", description: "", total_servings: 2 });
        setRecipeIngredients([{ food_name: "", quantity: 100, unit: "g" }]);
      }
    } catch (err) {
      showError("Failed to save custom recipe.");
    }
  };

  // RAG Handlers
  const handleUploadRAG = async () => {
    if (!ragDocText.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/knowledge/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: ragDocText,
          source: ragDocSource
        })
      });
      if (res.ok) {
        showSuccess("Document uploaded to local Vector Space successfully!");
        setRagDocText("");
      }
    } catch (err) {
      showError("Failed to index document.");
    }
  };

  const handleQueryRAG = async () => {
    if (!ragQuery.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/knowledge/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: ragQuery })
      });
      if (res.ok) {
        const data = await res.json();
        setRagMatches(data.matches);
      }
    } catch (err) {
      showError("RAG index search failed.");
    }
  };

  const toggleMealCollapse = (meal: string) => {
    setCollapsedMeals(prev => ({ ...prev, [meal]: !prev[meal] }));
  };

  // Stark Vaporwave Metrics Box
  const renderProgressBar = (value: number, target: number, label: string, _colorClass: string, unit: string) => {
    const pct = Math.min(100, Math.max(0, Math.round((value / target) * 100))) || 0;
    
    return (
      <div className="macro-ring-container">
        <div className="macro-label">
          <span>{label}</span>
          <span>{pct}%</span>
        </div>
        <div className="macro-bar-outline">
          <div className="macro-bar-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="macro-values">
          {value.toFixed(1)} / {target} {unit}
        </div>
      </div>
    );
  };

  return (
    <div style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', minHeight: '100vh', position: 'relative' }}>
      {/* Background patterns */}
      <div className="grid-floor" />
      <div className="floating-sun" />

      {/* Retro Console Header */}
      <header className="app-header">
        <div className="logo-container">
          <Sparkles size={24} style={{ color: 'var(--primary)', filter: 'drop-shadow(0 0 8px var(--primary))' }} />
          FIT_AI.SYS <span className="logo-tag">V1.0</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-secondary)' }}>
            <span style={{
              width: 8, height: 8,
              backgroundColor: dbStatus === 'mongodb' ? 'var(--text-secondary)' : 'var(--warning)',
              display: 'inline-block',
              boxShadow: dbStatus === 'mongodb' ? '0 0 8px var(--text-secondary)' : 'none'
            }} />
            DB_LINK: {dbStatus.toUpperCase()}
          </span>
          <span style={{ color: 'var(--primary)' }}>SYSTEM_TIME: 2026-05-22</span>
        </div>
      </header>

      {/* Breaking News Ticker Marquee */}
      <div className="marquee-container">
        <div className="marquee-content">
          <span className="marquee-item"><span className="marquee-badge">BREAKING</span>FITAI TRACKER ONLINE - ISSUED FOR HOME CALORIE TRACKING</span>
          {dayLog && remaining ? (
            <>
              <span className="marquee-item"><span className="marquee-badge">CALORIES</span>LOGGED: {Math.round(dayLog.totals.calories)} KCAL / {targets.calories} KCAL ({Math.round((dayLog.totals.calories / targets.calories) * 100)}%)</span>
              <span className="marquee-item"><span className="marquee-badge">REMAINING</span>CALORIES LEFT: {Math.round(remaining.calories)} KCAL</span>
              <span className="marquee-item"><span className="marquee-badge">PROTEIN</span>INLET: {dayLog.totals.protein.toFixed(1)}G / {targets.protein}G</span>
              <span className="marquee-item"><span className="marquee-badge">FIBER</span>LOGGED: {dayLog.totals.fiber.toFixed(1)}G / {targets.fiber}G</span>
            </>
          ) : (
            <span className="marquee-item"><span className="marquee-badge">STATUS</span>WAITING FOR DAILY LOG DATA TO LOAD...</span>
          )}
          <span className="marquee-item"><span className="marquee-badge">ADVISORY</span>LOG ACCURACY CATEGORIES CAREFULLY - EXACT WEIGHTS ARE HIGHLY PREFERRED</span>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="container">
        {/* Global Notifications */}
        {apiSuccessMsg && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            backgroundColor: 'rgba(0, 255, 255, 0.1)', color: 'var(--success)',
            padding: '0.75rem 1rem',
            border: '2px solid var(--success)', marginBottom: '1rem',
            boxShadow: '0 0 10px rgba(0, 255, 255, 0.2)',
            fontSize: '0.9rem', fontWeight: 600
          }}>
            <CheckCircle size={18} />
            <span>{apiSuccessMsg}</span>
          </div>
        )}
        {apiErrorMsg && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            backgroundColor: 'rgba(255, 0, 255, 0.1)', color: 'var(--primary)',
            padding: '0.75rem 1rem',
            border: '2px solid var(--primary)', marginBottom: '1rem',
            boxShadow: '0 0 10px rgba(255, 0, 255, 0.2)',
            fontSize: '0.9rem', fontWeight: 600
          }}>
            <AlertCircle size={18} />
            <span>{apiErrorMsg}</span>
          </div>
        )}

        {/* Global Tabs Navigation */}
        <div className="tabs-header">
          <button className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
            Dashboard
          </button>
          <button className={`tab-btn ${activeTab === 'presets' ? 'active' : ''}`} onClick={() => setActiveTab('presets')}>
            Presets & Targets
          </button>
          <button className={`tab-btn ${activeTab === 'recipes' ? 'active' : ''}`} onClick={() => setActiveTab('recipes')}>
            Custom Recipes
          </button>
          <button className={`tab-btn ${activeTab === 'rag' ? 'active' : ''}`} onClick={() => setActiveTab('rag')}>
            Knowledge RAG
          </button>
        </div>

        {/* Date Selector Widget */}
        <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', padding: '2.5rem 1.5rem 1.5rem 1.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          <div className="terminal-title-bar">
            <div className="terminal-dots">
              <span className="terminal-dot dot-magenta" />
              <span className="terminal-dot dot-cyan" />
              <span className="terminal-dot dot-orange" />
            </div>
            <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>LOG_DATE.EXE</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Calendar size={20} style={{ color: 'var(--primary)' }} />
            <span style={{ fontWeight: 600, fontFamily: 'var(--font-heading)' }}>Active Log Date</span>
          </div>
          <input 
            type="date" 
            value={selectedDate} 
            onChange={(e) => setSelectedDate(e.target.value)} 
            style={{ width: 'auto', padding: '0.4rem 0.8rem' }}
          />
        </div>

        {/* TAB 1: DASHBOARD VIEW */}
        {activeTab === 'dashboard' && (
          <div className="grid-dashboard">
            {/* Left Column: Parsers & Log lists */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              
               {/* Vaporwave Daily Targets */}
              {dayLog && (
                <div className="card" style={{ padding: '2.5rem 1.5rem 1.5rem 1.5rem' }}>
                  <div className="terminal-title-bar">
                    <div className="terminal-dots">
                      <span className="terminal-dot dot-magenta" />
                      <span className="terminal-dot dot-cyan" />
                      <span className="terminal-dot dot-orange" />
                    </div>
                    <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>DAILY_TARGETS.SYS</span>
                  </div>
                  <h3 style={{ fontSize: '1.4rem', marginBottom: '1.25rem', fontWeight: 900, fontFamily: 'var(--font-heading)' }}>Daily Intake Targets</h3>
                  <div className="macro-progress-grid">
                    {renderProgressBar(dayLog.totals.calories, targets.calories, "Calories", "primary", "kcal")}
                    {renderProgressBar(dayLog.totals.protein, targets.protein, "Protein", "success", "g")}
                    {renderProgressBar(dayLog.totals.carbs, targets.carbs, "Carbs", "warning", "g")}
                    {renderProgressBar(dayLog.totals.fat, targets.fat, "Fat", "danger", "g")}
                    {renderProgressBar(dayLog.totals.fiber, targets.fiber, "Fiber", "fiber", "g")}
                  </div>
                </div>
              )}

              {/* AI Parser Input Card */}
              <div className="card" style={{ padding: '2.5rem 1.5rem 1.5rem 1.5rem' }}>
                <div className="terminal-title-bar">
                  <div className="terminal-dots">
                    <span className="terminal-dot dot-magenta" />
                    <span className="terminal-dot dot-cyan" />
                    <span className="terminal-dot dot-orange" />
                  </div>
                  <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>AI_PARSER.EXE</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                  <Sparkles size={20} style={{ color: 'var(--primary)', strokeWidth: 1.5 }} />
                  <h3 style={{ fontSize: '1.4rem', fontWeight: 900, fontFamily: 'var(--font-heading)' }}>Parse Food Intake (AI)</h3>
                </div>
                
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem', fontFamily: 'var(--font-mono)' }}>
                  &gt; Enter messy text describing your meals below. The AI parses quantities and names into structured mathematical logs without calculating macros itself.
                </p>
                
                <div className="ai-input-section">
                  <textarea 
                    className="ai-input-area"
                    placeholder="Enter messy text: 'breakfast 2 roti 10g ghee 1 glass milk' or 'yesterday lunch raw rice 100g aloo sabji 1 scoop whey'"
                    value={aiText}
                    onChange={(e) => setAiText(e.target.value)}
                  />
                  
                  <div className="ai-controls">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <label htmlFor="llm-select" style={{ margin: 0 }}>Model:</label>
                      <select 
                        id="llm-select"
                        value={llmProvider} 
                        onChange={(e) => setLlmProvider(e.target.value)}
                        style={{ width: 'auto', padding: '0.4rem 0.8rem' }}
                      >
                        <option value="groq">Groq (Llama3)</option>
                        <option value="gemini">Gemini</option>
                        <option value="ollama">Ollama (Local)</option>
                        <option value="rules">Rules Only</option>
                      </select>
                    </div>

                    <button 
                      className="btn-primary" 
                      onClick={handleAIParse}
                      disabled={parsingLoading || !aiText.trim()}
                    >
                      {parsingLoading ? (
                        <span>
                          <Loader2 size={18} className="animate-spin" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '0.25rem' }} />
                          Parsing...
                        </span>
                      ) : (
                        <span>
                          <Sparkles size={18} style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '0.25rem' }} />
                          Parse &amp; Log Meal
                        </span>
                      )}
                    </button>
                  </div>
                </div>

                {parseResultString && (
                  <div className="logs-output-box" style={{ marginTop: '1rem', backgroundColor: '#000000', padding: '1rem', border: '1px solid var(--border)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                    <div style={{ fontWeight: 700, marginBottom: '0.5rem', color: 'var(--primary)' }}>&gt; Raw Parse Math Calculation Results:</div>
                    {parseResultString}
                  </div>
                )}
              </div>

              {/* Meal Log Blocks */}
              <div>
                <h3 style={{ fontSize: '1.4rem', fontWeight: 900, marginBottom: '1rem', fontFamily: 'var(--font-heading)', borderBottom: '2px solid var(--border)', paddingBottom: '0.4rem' }}>Today's Food Intake</h3>
                {dayLog && Object.keys(dayLog.meals).map((mealName) => {
                  const items = dayLog.meals[mealName] || [];
                  const isCollapsed = collapsedMeals[mealName];
                  
                  return (
                    <div key={mealName} className="meal-block">
                      <div className="meal-header" onClick={() => toggleMealCollapse(mealName)}>
                        <div className="meal-title-wrapper">
                          <span style={{ textTransform: 'capitalize', fontWeight: 700 }}>{mealName}</span>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>({items.length} items)</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            {Math.round(items.reduce((s, i) => s + i.calories, 0))} kcal
                          </span>
                          {isCollapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
                        </div>
                      </div>
                      
                      {!isCollapsed && (
                        <div className="meal-content">
                          {items.length === 0 ? (
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '1rem 0' }}>No items logged yet.</p>
                          ) : (
                            items.map((item, idx) => (
                              <div key={idx} className="meal-item-row">
                                <div className="meal-item-details">
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                    <span className="meal-item-name">{item.food_name}</span>
                                    <span className={`accuracy-badge ${
                                      item.accuracy === 'EXACT' ? 'badge-exact' : item.accuracy === 'PRESET' ? 'badge-preset' : 'badge-est'
                                    }`}>
                                      {item.accuracy}
                                    </span>
                                    {item.rich_tags?.map(t => (
                                      <span key={t} className={`tag-pill tag-${t.toLowerCase()}`}>{t}</span>
                                    ))}
                                  </div>
                                  <span className="meal-item-macros-summary">
                                    Quantity: {item.quantity}{item.unit} | P:{Math.round(item.protein)}g | C:{Math.round(item.carbs)}g | F:{Math.round(item.fat)}g | Fi:{Math.round(item.fiber)}g
                                  </span>
                                </div>
                                <div className="meal-item-actions">
                                  <span style={{ fontWeight: 600, marginRight: '0.5rem' }}>{Math.round(item.calories)} kcal</span>
                                  <button 
                                    className="btn-icon"
                                    style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}
                                    onClick={() => handleDeleteItem(mealName, idx)}
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

            </div>

            {/* Right Column: Search Autocomplete & Quick target remaining panels */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              
              {/* Quick Search Autocomplete */}
              <div className="card" style={{ padding: '2.5rem 1.5rem 1.5rem 1.5rem' }}>
                <div className="terminal-title-bar">
                  <div className="terminal-dots">
                    <span className="terminal-dot dot-magenta" />
                    <span className="terminal-dot dot-cyan" />
                    <span className="terminal-dot dot-orange" />
                  </div>
                  <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>DB_SEARCH.EXE</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                  <Search size={20} style={{ color: 'var(--primary-hover)', strokeWidth: 1.5 }} />
                  <h3 style={{ fontSize: '1.4rem', fontWeight: 900, fontFamily: 'var(--font-heading)' }}>Log via Search</h3>
                </div>

                <div className="search-container">
                  <input 
                    type="text" 
                    placeholder="Search database (e.g. roti, whey, egg)..."
                    value={searchQuery}
                    onChange={handleSearchChange}
                  />
                  {showDropdown && searchResults.length > 0 && (
                    <div className="search-results-dropdown">
                      {searchResults.map((item, idx) => (
                        <div 
                          key={idx} 
                          className="search-result-item"
                          onClick={() => handleSelectSearchResult(item)}
                        >
                          <div>
                            <div className="search-result-name">
                              {item.name} {item.matched_alias && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>(alias: {item.matched_alias})</span>}
                            </div>
                            <div className="search-result-macros">
                              P: {item.protein}g | C: {item.carbs}g | F: {item.fat}g
                            </div>
                          </div>
                          <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{item.calories} kcal / 100{item.serving_unit}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {selectedSearchItem && (
                  <div style={{ marginTop: '1rem', border: '1px solid var(--border)', padding: '1rem', backgroundColor: '#000000' }}>
                    <div style={{ fontWeight: 700, marginBottom: '0.5rem', color: 'var(--primary)' }}>&gt; Selected: {selectedSearchItem.name}</div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '1rem' }}>
                      <div>
                        <label>Quantity</label>
                        <input 
                          type="number" 
                          value={searchItemQty} 
                          onChange={(e) => setSearchItemQty(Number(e.target.value))}
                        />
                      </div>
                      <div>
                        <label>Unit</label>
                        <input 
                          type="text" 
                          value={searchItemUnit} 
                          onChange={(e) => setSearchItemUnit(e.target.value)}
                          disabled={selectedSearchItem.serving_unit !== 'piece'}
                        />
                      </div>
                    </div>

                    <div style={{ marginBottom: '1.25rem' }}>
                      <label>Target Meal</label>
                      <select value={activeSearchMeal} onChange={(e) => setActiveSearchMeal(e.target.value)}>
                        <option value="breakfast">Breakfast</option>
                        <option value="lunch">Lunch</option>
                        <option value="dinner">Dinner</option>
                        <option value="snack">Snack</option>
                      </select>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="btn-success" style={{ flex: 1 }} onClick={handleAddSearchItem}>
                        <span><Plus size={16} style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '0.25rem' }} /> Log Food</span>
                      </button>
                      <button className="btn-secondary" onClick={() => setSelectedSearchItem(null)}>
                        <span>Cancel</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Macro Summary breakdown list */}
              {dayLog && remaining && (
                <div className="card" style={{ padding: '2.5rem 1.5rem 1.5rem 1.5rem' }}>
                  <div className="terminal-title-bar">
                    <div className="terminal-dots">
                      <span className="terminal-dot dot-magenta" />
                      <span className="terminal-dot dot-cyan" />
                      <span className="terminal-dot dot-orange" />
                    </div>
                    <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>MACRO_REMAINING.EXE</span>
                  </div>
                  <h3 style={{ fontSize: '1.4rem', fontWeight: 900, marginBottom: '1.25rem', fontFamily: 'var(--font-heading)', borderBottom: '2px solid var(--border)', paddingBottom: '0.4rem' }}>Remaining Target</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontFamily: 'var(--font-mono)', fontSize: '0.9rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-primary)' }}>Calories Target</span>
                      <span style={{ fontWeight: 700, color: 'var(--success)' }}>
                        {remaining.calories} kcal remaining
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-primary)' }}>Protein (HP)</span>
                      <span style={{ fontWeight: 700, color: 'var(--success)' }}>
                        {remaining.protein}g remaining
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-primary)' }}>Carbohydrates</span>
                      <span style={{ fontWeight: 700, color: 'var(--success)' }}>{remaining.carbs}g remaining</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-primary)' }}>Fats</span>
                      <span style={{ fontWeight: 700, color: 'var(--success)' }}>{remaining.fat}g remaining</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-primary)' }}>Fiber</span>
                      <span style={{ fontWeight: 700, color: 'var(--success)' }}>{remaining.fiber}g remaining</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: PRESETS & TARGETS */}
        {activeTab === 'presets' && (
          <div className="grid-dashboard">
            {/* Left Box: Targets Settings */}
            <div className="card" style={{ padding: '2.5rem 1.5rem 1.5rem 1.5rem' }}>
              <div className="terminal-title-bar">
                <div className="terminal-dots">
                  <span className="terminal-dot dot-magenta" />
                  <span className="terminal-dot dot-cyan" />
                  <span className="terminal-dot dot-orange" />
                </div>
                <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>TARGET_SETTING.SYS</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                <Settings size={20} style={{ color: 'var(--primary-hover)', strokeWidth: 1.5 }} />
                <h3 style={{ fontSize: '1.4rem', fontWeight: 900, fontFamily: 'var(--font-heading)' }}>Set Target Macros</h3>
              </div>

              <form onSubmit={handleSaveTargets}>
                <div className="settings-form-grid" style={{ marginBottom: '1.5rem' }}>
                  <div>
                    <label>Calories (kcal)</label>
                    <input 
                      type="number" 
                      value={targetForm.calories} 
                      onChange={(e) => setTargetForm({ ...targetForm, calories: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <label>Protein (g)</label>
                    <input 
                      type="number" 
                      value={targetForm.protein} 
                      onChange={(e) => setTargetForm({ ...targetForm, protein: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <label>Carbohydrates (g)</label>
                    <input 
                      type="number" 
                      value={targetForm.carbs} 
                      onChange={(e) => setTargetForm({ ...targetForm, carbs: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <label>Fats (g)</label>
                    <input 
                      type="number" 
                      value={targetForm.fat} 
                      onChange={(e) => setTargetForm({ ...targetForm, fat: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <label>Dietary Fiber (g)</label>
                    <input 
                      type="number" 
                      value={targetForm.fiber} 
                      onChange={(e) => setTargetForm({ ...targetForm, fiber: Number(e.target.value) })}
                    />
                  </div>
                </div>

                <button type="submit" className="btn-primary">
                  <span>Save Targets</span>
                </button>
              </form>
            </div>

            {/* Right Box: Presets manager */}
            <div className="card" style={{ padding: '2.5rem 1.5rem 1.5rem 1.5rem' }}>
              <div className="terminal-title-bar">
                <div className="terminal-dots">
                  <span className="terminal-dot dot-magenta" />
                  <span className="terminal-dot dot-cyan" />
                  <span className="terminal-dot dot-orange" />
                </div>
                <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>PRESET_BUILDER.SYS</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                <Bookmark size={20} style={{ color: 'var(--primary-hover)', strokeWidth: 1.5 }} />
                <h3 style={{ fontSize: '1.4rem', fontWeight: 900, fontFamily: 'var(--font-heading)' }}>Create Food Presets</h3>
              </div>

              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem', fontFamily: 'var(--font-mono)' }}>
                &gt; Map a customizable unit (like 1 roti) to an exact ingredient gram value (like 43g wheat flour).
              </p>

              <form onSubmit={handleSavePreset}>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                  <div style={{ flex: 1 }}>
                    <label>Preset Unit Qty</label>
                    <input 
                      type="number" 
                      step="any"
                      placeholder="e.g. 1.0"
                      value={presetForm.preset_quantity} 
                      onChange={(e) => setPresetForm({ ...presetForm, preset_quantity: Number(e.target.value) })}
                    />
                  </div>
                  <div style={{ flex: 2 }}>
                    <label>Preset Name</label>
                    <input 
                      type="text" 
                      placeholder="e.g. roti or bowl dal"
                      value={presetForm.preset_name} 
                      onChange={(e) => setPresetForm({ ...presetForm, preset_name: e.target.value })}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
                  <div style={{ flex: 1 }}>
                    <label>Target Weight</label>
                    <input 
                      type="number" 
                      placeholder="e.g. 43"
                      value={presetForm.target_quantity} 
                      onChange={(e) => setPresetForm({ ...presetForm, target_quantity: Number(e.target.value) })}
                    />
                  </div>
                  <div style={{ flex: 2 }}>
                    <label>Target Food Ingredient</label>
                    <input 
                      type="text" 
                      placeholder="e.g. wheat flour"
                      value={presetForm.target_food_name} 
                      onChange={(e) => setPresetForm({ ...presetForm, target_food_name: e.target.value })}
                    />
                  </div>
                </div>

                <button type="submit" className="btn-success">
                  <span>Save Preset</span>
                </button>
              </form>
            </div>
          </div>
        )}

        {/* TAB 3: CUSTOM RECIPES */}
        {activeTab === 'recipes' && (
          <div className="card" style={{ maxWidth: '800px', margin: '0 auto', padding: '2.5rem 1.5rem 1.5rem 1.5rem' }}>
            <div className="terminal-title-bar">
              <div className="terminal-dots">
                <span className="terminal-dot dot-magenta" />
                <span className="terminal-dot dot-cyan" />
                <span className="terminal-dot dot-orange" />
              </div>
              <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>RECIPE_ENGINE.EXE</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
              <ChefHat size={22} style={{ color: 'var(--primary-hover)', strokeWidth: 1.5 }} />
              <h3 style={{ fontSize: '1.4rem', fontWeight: 900, fontFamily: 'var(--font-heading)' }}>Formulate Custom Recipe</h3>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', fontFamily: 'var(--font-mono)' }}>
              &gt; Save customized home recipes (e.g. Mixed Paneer Sabji). Log servings later. The tracker splits and scales ingredients.
            </p>

            <form onSubmit={handleCreateRecipe}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label>Recipe Name</label>
                  <input 
                    type="text" 
                    placeholder="e.g. home paneer curry"
                    value={recipeForm.name} 
                    onChange={(e) => setRecipeForm({ ...recipeForm, name: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label>Total Servings</label>
                  <input 
                    type="number" 
                    value={recipeForm.total_servings} 
                    onChange={(e) => setRecipeForm({ ...recipeForm, total_servings: Number(e.target.value) })}
                    required
                  />
                </div>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label>Description (Optional)</label>
                <input 
                  type="text" 
                  placeholder="e.g. Paneer curry cooked in butter"
                  value={recipeForm.description} 
                  onChange={(e) => setRecipeForm({ ...recipeForm, description: e.target.value })}
                />
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <label style={{ margin: 0 }}>Ingredients List</label>
                  <button type="button" className="btn-secondary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }} onClick={handleAddIngredientRow}>
                    <span>+ Add Ingredient</span>
                  </button>
                </div>

                {recipeIngredients.map((ing, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
                    <div style={{ flex: 3 }}>
                      <input 
                        type="text" 
                        placeholder="Food name (e.g. aloo, onion, oil)"
                        value={ing.food_name} 
                        onChange={(e) => handleIngredientChange(idx, 'food_name', e.target.value)}
                        required
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <input 
                        type="number" 
                        placeholder="Weight"
                        value={ing.quantity} 
                        onChange={(e) => handleIngredientChange(idx, 'quantity', Number(e.target.value))}
                        required
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <input 
                        type="text" 
                        placeholder="Unit"
                        value={ing.unit} 
                        onChange={(e) => handleIngredientChange(idx, 'unit', e.target.value)}
                        required
                      />
                    </div>
                    {recipeIngredients.length > 1 && (
                      <button 
                        type="button" 
                        className="btn-icon"
                        style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}
                        onClick={() => handleRemoveIngredientRow(idx)}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <button type="submit" className="btn-primary">
                <span>Save Recipe Formulation</span>
              </button>
            </form>
          </div>
        )}

        {/* TAB 4: KNOWLEDGE RAG ENGINE */}
        {activeTab === 'rag' && (
          <div className="grid-dashboard">
            {/* Left Box: RAG document upload */}
            <div className="card" style={{ padding: '2.5rem 1.5rem 1.5rem 1.5rem' }}>
              <div className="terminal-title-bar">
                <div className="terminal-dots">
                  <span className="terminal-dot dot-magenta" />
                  <span className="terminal-dot dot-cyan" />
                  <span className="terminal-dot dot-orange" />
                </div>
                <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>DOC_UPLOAD.SYS</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                <BookOpen size={20} style={{ color: 'var(--primary-hover)', strokeWidth: 1.5 }} />
                <h3 style={{ fontSize: '1.4rem', fontWeight: 900, fontFamily: 'var(--font-heading)' }}>Upload Knowledge Docs</h3>
              </div>

              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem', fontFamily: 'var(--font-mono)' }}>
                &gt; Paste nutrition/diet guidelines, doctor recommendations, or calorie indexes to local TF-IDF search database.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label>Document Source Label</label>
                  <input 
                    type="text" 
                    placeholder="e.g. doctor_guideline"
                    value={ragDocSource} 
                    onChange={(e) => setRagDocSource(e.target.value)}
                  />
                </div>

                <div>
                  <label>Document Content</label>
                  <textarea 
                    style={{ minHeight: '150px' }}
                    placeholder="Paste raw guidelines: 'Patients with high cholesterol must restrict daily ghee/oil intake to under 15g. High fiber items like oats and isabgol husk should be prioritized.'"
                    value={ragDocText}
                    onChange={(e) => setRagDocText(e.target.value)}
                  />
                </div>

                <button className="btn-primary" onClick={handleUploadRAG} disabled={!ragDocText.trim()}>
                  <span>Upload Document</span>
                </button>
              </div>
            </div>

            {/* Right Box: RAG query lookup */}
            <div className="card" style={{ padding: '2.5rem 1.5rem 1.5rem 1.5rem' }}>
              <div className="terminal-title-bar">
                <div className="terminal-dots">
                  <span className="terminal-dot dot-magenta" />
                  <span className="terminal-dot dot-cyan" />
                  <span className="terminal-dot dot-orange" />
                </div>
                <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>DOC_QUERY.SYS</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                <Search size={20} style={{ color: 'var(--primary-hover)', strokeWidth: 1.5 }} />
                <h3 style={{ fontSize: '1.4rem', fontWeight: 900, fontFamily: 'var(--font-heading)' }}>Query Knowledge Base</h3>
              </div>

              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem', fontFamily: 'var(--font-mono)' }}>
                &gt; Query matching chunks in RAG database. Returns closest matches with TF-IDF cosine similarity scores.
              </p>

              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
                <input 
                  type="text" 
                  placeholder="Ask a question (e.g. cholesterol limits)..."
                  value={ragQuery}
                  onChange={(e) => setRagQuery(e.target.value)}
                />
                <button className="btn-success" onClick={handleQueryRAG} disabled={!ragQuery.trim()}>
                  <span>Query</span>
                </button>
              </div>

              {ragMatches.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '1rem 0' }}>No search query matches yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {ragMatches.map((match, idx) => (
                    <div key={idx} style={{ border: '2px solid var(--border)', padding: '1rem', backgroundColor: '#000000' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary)', marginBottom: '0.5rem' }}>
                        <span>Source: {match.source}</span>
                        <span>Score: {match.score.toFixed(3)}</span>
                      </div>
                      <p style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>{match.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
