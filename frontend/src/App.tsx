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
  Bookmark,
  Sun,
  Moon,
  Edit2,
  Check,
  X
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
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('theme') as 'dark' | 'light') || 'dark';
  });

  useEffect(() => {
    if (theme === 'light') {
      document.body.classList.add('light');
      document.body.classList.remove('dark');
    } else {
      document.body.classList.add('dark');
      document.body.classList.remove('light');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  // Navigation tab
  const [activeTab, setActiveTab] = useState<'dashboard' | 'presets' | 'recipes' | 'rag' | 'admin'>('dashboard');

  // User Profile States
  const [users, setUsers] = useState<any[]>([]);
  const [activeUserId, setActiveUserId] = useState<string>("default");
  const [activeUserRole, setActiveUserRole] = useState<string>("user");
  const [adminFoods, setAdminFoods] = useState<any[]>([]);
  const [adminPresets, setAdminPresets] = useState<any[]>([]);

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
  const [apiSuccessMsg, setApiSuccessMsg] = useState<string>("");
  const [apiErrorMsg, setApiErrorMsg] = useState<string>("");

  // Pending Meal Review State
  const [pendingMeal, setPendingMeal] = useState<{
    meal: string;
    date: string;
    items: FoodItem[];
  } | null>(null);

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

  const [editingItem, setEditingItem] = useState<{
    mealName: string;
    index: number;
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
  } | null>(null);

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



  // Fetch log on date or user or view change
  useEffect(() => {
    fetchDayLog();
    checkHealth();
  }, [selectedDate, activeUserId]);

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    if (activeTab === 'admin') {
      fetchAdminFoods();
      fetchAdminPresets();
    }
  }, [activeTab]);

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${API_BASE}/users`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
        const currentProfile = data.find((u: any) => u.user_id === activeUserId);
        if (currentProfile) {
          setActiveUserRole(currentProfile.role);
        }
      }
    } catch (err) {
      console.error("Error fetching users:", err);
    }
  };

  const handleUserChange = (userId: string) => {
    setActiveUserId(userId);
    const selected = users.find(u => u.user_id === userId);
    if (selected) {
      setActiveUserRole(selected.role);
      if (selected.role !== 'admin' && activeTab === 'admin') {
        setActiveTab('dashboard');
      }
    }
  };

  const fetchAdminFoods = async () => {
    try {
      const res = await fetch(`${API_BASE}/foods`);
      if (res.ok) {
        const data = await res.json();
        setAdminFoods(data);
      }
    } catch (err) {
      console.error("Error fetching admin foods:", err);
    }
  };

  const fetchAdminPresets = async () => {
    try {
      const res = await fetch(`${API_BASE}/presets`);
      if (res.ok) {
        const data = await res.json();
        setAdminPresets(data);
      }
    } catch (err) {
      console.error("Error fetching admin presets:", err);
    }
  };

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
      const res = await fetch(`${API_BASE}/day-log?user_id=${activeUserId}&date=${selectedDate}`);
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
    setPendingMeal(null);
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
          user_id: activeUserId,
          date: selectedDate
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to parse input via AI.");
      }

      const data = await res.json();
      
      // Instead of auto-logging, set to pending state for review
      setPendingMeal({
        meal: data.meal || "breakfast",
        date: data.date || selectedDate,
        items: data.items || []
      });
      showSuccess("AI successfully parsed food input! Please review and confirm below.");
    } catch (err: any) {
      showError(err.message || "Error processing your food input.");
    } finally {
      setParsingLoading(false);
    }
  };

  // Review panel edit handler
  const handleEditPendingItem = (index: number, key: keyof FoodItem, value: any) => {
    if (!pendingMeal) return;
    const updatedItems = [...pendingMeal.items];
    
    // Scale macros proportionally if quantity is updated
    if (key === 'quantity') {
      const prevQty = pendingMeal.items[index].quantity;
      const newQty = Number(value);
      if (prevQty > 0 && newQty > 0) {
        const ratio = newQty / prevQty;
        updatedItems[index] = {
          ...updatedItems[index],
          quantity: newQty,
          calories: Number((updatedItems[index].calories * ratio).toFixed(1)),
          protein: Number((updatedItems[index].protein * ratio).toFixed(1)),
          carbs: Number((updatedItems[index].carbs * ratio).toFixed(1)),
          fat: Number((updatedItems[index].fat * ratio).toFixed(1)),
          fiber: Number((updatedItems[index].fiber * ratio).toFixed(1))
        };
      } else {
        updatedItems[index] = {
          ...updatedItems[index],
          [key]: value
        };
      }
    } else {
      updatedItems[index] = {
        ...updatedItems[index],
        [key]: value
      };
    }
    
    setPendingMeal({
      ...pendingMeal,
      items: updatedItems
    });
  };

  // Add a new row to pending items
  const handleAddPendingItemRow = () => {
    if (!pendingMeal) return;
    setPendingMeal({
      ...pendingMeal,
      items: [
        ...pendingMeal.items,
        {
          food_name: "New Food Item",
          quantity: 100,
          unit: "g",
          calories: 100,
          protein: 0,
          carbs: 0,
          fat: 0,
          fiber: 0,
          accuracy: 'EST',
          rich_tags: []
        }
      ]
    });
  };

  // Delete a row from pending items
  const handleRemovePendingItemRow = (index: number) => {
    if (!pendingMeal) return;
    const updatedItems = [...pendingMeal.items];
    updatedItems.splice(index, 1);
    setPendingMeal({
      ...pendingMeal,
      items: updatedItems
    });
  };

  // Log confirmed pending meal to tracker
  const handleSavePendingMeal = async () => {
    if (!pendingMeal || pendingMeal.items.length === 0) return;
    
    try {
      const response = await fetch(`${API_BASE}/log-meal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: activeUserId,
          date: pendingMeal.date,
          meal: pendingMeal.meal,
          items: pendingMeal.items.map(item => ({ ...item, meal: pendingMeal.meal })),
          overwrite: false // Appending parsed meal items
        })
      });

      if (response.ok) {
        showSuccess(`Successfully logged meal items to ${pendingMeal.meal}!`);
        setPendingMeal(null);
        setAiText("");
        fetchDayLog();
      } else {
        showError("Failed to save meal log.");
      }
    } catch (err) {
      showError("Failed to save meal log.");
    }
  };

  // Get real-time totals for the review table
  const getPendingMealTotals = () => {
    if (!pendingMeal) return { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
    return pendingMeal.items.reduce((totals, item) => ({
      calories: Number((totals.calories + (Number(item.calories) || 0)).toFixed(1)),
      protein: Number((totals.protein + (Number(item.protein) || 0)).toFixed(1)),
      carbs: Number((totals.carbs + (Number(item.carbs) || 0)).toFixed(1)),
      fat: Number((totals.fat + (Number(item.fat) || 0)).toFixed(1)),
      fiber: Number((totals.fiber + (Number(item.fiber) || 0)).toFixed(1))
    }), { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
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
          user_id: activeUserId,
          date: selectedDate
        })
      });

      if (!parseResponse.ok) throw new Error("Calculation failed");
      const parseData = await parseResponse.json();

      const logResponse = await fetch(`${API_BASE}/log-meal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: activeUserId,
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
          user_id: activeUserId,
          date: selectedDate,
          meal: mealName,
          items: updatedMeals[mealName],
          overwrite: true
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

  const handleEditItemField = (key: string, value: any) => {
    if (!editingItem) return;

    if (key === 'quantity') {
      const prevQty = editingItem.quantity;
      const newQty = Number(value);
      if (prevQty > 0 && newQty > 0) {
        const ratio = newQty / prevQty;
        setEditingItem({
          ...editingItem,
          quantity: newQty,
          calories: Number((editingItem.calories * ratio).toFixed(1)),
          protein: Number((editingItem.protein * ratio).toFixed(1)),
          carbs: Number((editingItem.carbs * ratio).toFixed(1)),
          fat: Number((editingItem.fat * ratio).toFixed(1)),
          fiber: Number((editingItem.fiber * ratio).toFixed(1))
        });
      } else {
        setEditingItem({ ...editingItem, quantity: newQty });
      }
    } else {
      setEditingItem({ ...editingItem, [key]: value });
    }
  };

  const handleSaveEditItem = async (mealName: string, indexToEdit: number, updatedItem: FoodItem) => {
    if (!dayLog) return;
    
    const updatedMeals = JSON.parse(JSON.stringify(dayLog.meals));
    updatedMeals[mealName][indexToEdit] = updatedItem;

    try {
      const response = await fetch(`${API_BASE}/log-meal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: activeUserId,
          date: selectedDate,
          meal: mealName,
          items: updatedMeals[mealName],
          overwrite: true
        })
      });

      if (response.ok) {
        showSuccess("Item updated successfully.");
        setEditingItem(null);
        fetchDayLog();
      } else {
        showError("Failed to update item.");
      }
    } catch (err) {
      showError("Failed to update item.");
    }
  };

  const handleMoveItem = async (fromMeal: string, toMeal: string, indexToMove: number) => {
    if (fromMeal === toMeal) return;
    try {
      const response = await fetch(`${API_BASE}/move-meal-item`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: activeUserId,
          date: selectedDate,
          from_meal: fromMeal,
          to_meal: toMeal,
          item_index: indexToMove
        })
      });

      if (response.ok) {
        showSuccess(`Moved item from ${fromMeal} to ${toMeal} successfully.`);
        fetchDayLog();
      } else {
        showError("Failed to move item.");
      }
    } catch (err) {
      showError("Failed to move item.");
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
          user_id: activeUserId,
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
        body: JSON.stringify({
          ...targetForm,
          user_id: activeUserId
        })
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
        user_id: activeUserId,
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

  // Bitcoin DeFi Metrics Block
  const renderProgressBar = (value: number, target: number, label: string, _colorClass: string, unit: string) => {
    const pct = Math.min(100, Math.max(0, Math.round((value / target) * 100))) || 0;
    
    return (
      <div className="macro-ring-container">
        <div className="macro-label">
          <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, letterSpacing: '-0.3px' }}>{label}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--primary)' }}>{pct}%</span>
        </div>
        <div style={{ fontSize: '1.6rem', fontWeight: 700, fontFamily: 'var(--font-mono)', margin: '0.2rem 0', lineHeight: 1.1 }}>
          {value.toFixed(1)} <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{unit}</span>
        </div>
        <div style={{ width: '100%', height: '4px', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '999px', marginTop: '0.5rem', marginBottom: '0.75rem', overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(to right, var(--primary-hover), var(--primary))', borderRadius: '999px', boxShadow: '0 0 8px var(--primary)' }} />
        </div>
        <div className="stats-mono" style={{ fontSize: '0.75rem', marginTop: 'auto' }}>
          Target: {target} {unit}
        </div>
      </div>
    );
  };

  return (
    <div style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', minHeight: '100vh' }}>
      {/* Bitcoin DeFi Header */}
      <header className="app-header">
        <div className="logo-container">
          FITAI DEFI COMMAND
        </div>
        <div className="edition-bar" style={{ gap: '0.75rem' }}>
          <span>SECURE NETWORK NODE</span>
          <span>EST. 2026</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: dbStatus === 'mongodb' ? 'var(--primary)' : 'var(--danger)',
              display: 'inline-block',
              boxShadow: dbStatus === 'mongodb' ? '0 0 8px var(--primary)' : 'none'
            }} />
            DB: {dbStatus.toUpperCase()}
          </span>
          <span>SYSTEM ONLINE</span>
          
          {/* Active User Selector Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginRight: '0.25rem' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>NODE_USER:</span>
            <select
              value={activeUserId}
              onChange={(e) => handleUserChange(e.target.value)}
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
                padding: '0.1rem 0.4rem',
                fontSize: '0.75rem',
                borderRadius: '4px',
                height: '24px',
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)'
              }}
            >
              {users.map(u => (
                <option key={u.user_id} value={u.user_id}>
                  {u.name || u.user_id} ({(u.role || 'user').toUpperCase()})
                </option>
              ))}
            </select>
          </div>

          <button 
            onClick={toggleTheme} 
            style={{
              background: 'transparent',
              border: '1px solid var(--border)',
              padding: '0.2rem 0.6rem',
              fontSize: '0.75rem',
              color: 'var(--text-secondary)',
              borderRadius: '4px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              textTransform: 'uppercase',
              fontFamily: 'var(--font-mono)',
              height: 'auto'
            }}
          >
            {theme === 'dark' ? <Sun size={12} /> : <Moon size={12} />}
            <span>{theme === 'dark' ? 'LIGHT' : 'DARK'}</span>
          </button>
        </div>
      </header>


      {/* Main Content Area */}
      <main className="container">
        {/* Global Notifications */}
        {apiSuccessMsg && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            backgroundColor: 'rgba(255, 214, 0, 0.08)', color: 'var(--success)',
            padding: '0.75rem 1rem', borderRadius: '8px',
            border: '1px solid rgba(255, 214, 0, 0.25)', marginBottom: '1rem',
            fontSize: '0.9rem', fontWeight: 600
          }}>
            <CheckCircle size={18} />
            {apiSuccessMsg}
          </div>
        )}
        {apiErrorMsg && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            backgroundColor: 'rgba(239, 68, 68, 0.08)', color: 'var(--danger)',
            padding: '0.75rem 1rem', borderRadius: '8px',
            border: '1px solid rgba(239, 68, 68, 0.25)', marginBottom: '1rem',
            fontSize: '0.9rem', fontWeight: 600
          }}>
            <AlertCircle size={18} />
            {apiErrorMsg}
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
          {activeUserRole === 'admin' && (
            <button className={`tab-btn ${activeTab === 'admin' ? 'active' : ''}`} onClick={() => setActiveTab('admin')} style={{ borderColor: 'var(--primary)', color: 'var(--primary)', fontWeight: 'bold' }}>
              ⚙️ Admin Panel
            </button>
          )}
        </div>

        {/* Date Selector Widget */}
        <div className="card hard-shadow-hover" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', padding: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Calendar size={20} style={{ color: 'var(--primary)' }} />
            <span style={{ fontWeight: 600 }}>Active Log Date</span>
          </div>
          <input 
            type="date" 
            value={selectedDate} 
            onChange={(e) => setSelectedDate(e.target.value)} 
            style={{ width: 'auto', padding: '0.4rem 0.8rem', borderRadius: '4px', height: '36px' }}
          />
        </div>

        {/* TAB 1: DASHBOARD VIEW */}
        {activeTab === 'dashboard' && (
          <div className="grid-dashboard">
            {/* Left Column: Parsers & Log lists */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              
               {/* Bitcoin DeFi Daily Targets */}
              {dayLog && (
                <div className="card hard-shadow-hover" style={{ padding: '1.5rem' }}>
                  <h3 style={{ fontSize: '1.4rem', marginBottom: '1.25rem', fontWeight: 600, fontFamily: 'var(--font-heading)' }}>Daily Intake Targets</h3>
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
              <div className="card hard-shadow-hover">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                  <Sparkles size={20} style={{ color: 'var(--primary)', strokeWidth: 1.5 }} />
                  <h3 style={{ fontSize: '1.4rem', fontWeight: 600, fontFamily: 'var(--font-heading)' }}>Parse Food Intake (AI)</h3>
                </div>
                
                <p className="drop-cap" style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', marginBottom: '1rem', textAlign: 'justify' }}>
                  Enter messy text describing your meals below. The AI parses quantities and names into structured mathematical logs without calculating macros itself. The calculator engine runs calculations against the local seed database.
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
                      <label htmlFor="llm-select" style={{ margin: 0 }}>Model Provider:</label>
                      <select 
                        id="llm-select"
                        value={llmProvider} 
                        onChange={(e) => setLlmProvider(e.target.value)}
                        style={{ width: 'auto', padding: '0.2rem 0.5rem', borderRadius: '4px', height: '36px' }}
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
                        <>
                          <Loader2 size={18} className="animate-spin" />
                          <span>Parsing Food...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles size={18} />
                          <span>Parse & Log Meal</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {pendingMeal && (
                  <div className="card review-card" style={{ marginTop: '1.5rem', border: '1px solid var(--primary)', boxShadow: '0 0 20px rgba(247, 147, 26, 0.25)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                      <Sparkles size={20} style={{ color: 'var(--primary)', strokeWidth: 1.5 }} />
                      <h3 style={{ fontSize: '1.4rem', fontWeight: 600, fontFamily: 'var(--font-heading)' }}>
                        Verify & Confirm AI Parse
                      </h3>
                    </div>

                    <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                      Review the parsed meal components below. You can correct the food names, quantities, and macro values directly before saving.
                    </p>

                    {/* Meal & Date Selection */}
                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: '150px' }}>
                        <label>Target Meal</label>
                        <select 
                          value={pendingMeal.meal} 
                          onChange={(e) => setPendingMeal({ ...pendingMeal, meal: e.target.value })}
                          style={{ height: '38px', borderRadius: '4px' }}
                        >
                          <option value="breakfast">Breakfast</option>
                          <option value="lunch">Lunch</option>
                          <option value="dinner">Dinner</option>
                          <option value="snack">Snack</option>
                        </select>
                      </div>
                      <div style={{ flex: 1, minWidth: '150px' }}>
                        <label>Log Date</label>
                        <input 
                          type="date" 
                          value={pendingMeal.date} 
                          onChange={(e) => setPendingMeal({ ...pendingMeal, date: e.target.value })}
                          style={{ height: '38px', borderRadius: '4px', padding: '0.2rem 0.5rem' }}
                        />
                      </div>
                    </div>

                    {/* Items List (Responsive Table) */}
                    <div style={{ overflowX: 'auto', marginBottom: '1.5rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '700px' }}>
                        <thead>
                          <tr style={{ backgroundColor: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border)' }}>
                            <th style={{ padding: '0.75rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Food Item</th>
                            <th style={{ padding: '0.75rem', fontSize: '0.8rem', color: 'var(--text-secondary)', width: '90px' }}>Qty</th>
                            <th style={{ padding: '0.75rem', fontSize: '0.8rem', color: 'var(--text-secondary)', width: '80px' }}>Unit</th>
                            <th style={{ padding: '0.75rem', fontSize: '0.8rem', color: 'var(--text-secondary)', width: '90px' }}>Cal (kcal)</th>
                            <th style={{ padding: '0.75rem', fontSize: '0.8rem', color: 'var(--text-secondary)', width: '75px' }}>P (g)</th>
                            <th style={{ padding: '0.75rem', fontSize: '0.8rem', color: 'var(--text-secondary)', width: '75px' }}>C (g)</th>
                            <th style={{ padding: '0.75rem', fontSize: '0.8rem', color: 'var(--text-secondary)', width: '75px' }}>F (g)</th>
                            <th style={{ padding: '0.75rem', fontSize: '0.8rem', color: 'var(--text-secondary)', width: '75px' }}>Fi (g)</th>
                            <th style={{ padding: '0.75rem', fontSize: '0.8rem', color: 'var(--text-secondary)', width: '50px', textAlign: 'center' }}>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pendingMeal.items.map((item, idx) => (
                            <tr key={idx} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.2s' }}>
                              <td style={{ padding: '0.5rem' }}>
                                <input 
                                  type="text" 
                                  value={item.food_name} 
                                  onChange={(e) => handleEditPendingItem(idx, 'food_name', e.target.value)}
                                  style={{ border: 'none', borderBottom: '1px solid transparent', padding: '0.25rem 0.5rem', background: 'transparent', height: '32px', fontFamily: 'var(--font-heading)', fontWeight: 500 }}
                                  placeholder="Food Name"
                                />
                                <div style={{ display: 'flex', gap: '0.25rem', paddingLeft: '0.5rem', marginTop: '0.2rem' }}>
                                  <span className={`accuracy-badge ${item.accuracy === 'EXACT' ? 'badge-exact' : item.accuracy === 'PRESET' ? 'badge-preset' : 'badge-est'}`} style={{ transform: 'scale(0.85)', transformOrigin: 'left center' }}>
                                    {item.accuracy}
                                  </span>
                                  {item.rich_tags?.map(t => (
                                    <span key={t} className={`tag-pill tag-${t.toLowerCase()}`} style={{ transform: 'scale(0.85)', transformOrigin: 'left center', margin: 0 }}>
                                      {t}
                                    </span>
                                  ))}
                                </div>
                              </td>
                              <td style={{ padding: '0.5rem' }}>
                                <input 
                                  type="number" 
                                  value={item.quantity} 
                                  onChange={(e) => handleEditPendingItem(idx, 'quantity', Number(e.target.value))}
                                  style={{ border: 'none', borderBottom: '1px solid transparent', padding: '0.25rem 0.5rem', background: 'transparent', height: '32px', textAlign: 'right' }}
                                />
                              </td>
                              <td style={{ padding: '0.5rem' }}>
                                <input 
                                  type="text" 
                                  value={item.unit} 
                                  onChange={(e) => handleEditPendingItem(idx, 'unit', e.target.value)}
                                  style={{ border: 'none', borderBottom: '1px solid transparent', padding: '0.25rem 0.5rem', background: 'transparent', height: '32px' }}
                                />
                              </td>
                              <td style={{ padding: '0.5rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                                  {item.accuracy === 'EST' && <span style={{ color: 'var(--primary)', marginRight: '2px', fontSize: '0.85rem', fontWeight: 600 }}>~</span>}
                                  <input 
                                    type="number" 
                                    value={item.calories} 
                                    onChange={(e) => handleEditPendingItem(idx, 'calories', Number(e.target.value))}
                                    style={{ border: 'none', borderBottom: '1px solid transparent', padding: '0.25rem 0.15rem', background: 'transparent', height: '32px', color: 'var(--primary)', fontWeight: 600, textAlign: 'right' }}
                                  />
                                </div>
                              </td>
                              <td style={{ padding: '0.5rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                                  {item.accuracy === 'EST' && <span style={{ color: 'var(--text-secondary)', marginRight: '2px', fontSize: '0.8rem' }}>~</span>}
                                  <input 
                                    type="number" 
                                    value={item.protein} 
                                    onChange={(e) => handleEditPendingItem(idx, 'protein', Number(e.target.value))}
                                    style={{ border: 'none', borderBottom: '1px solid transparent', padding: '0.25rem 0.15rem', background: 'transparent', height: '32px', textAlign: 'right' }}
                                  />
                                </div>
                              </td>
                              <td style={{ padding: '0.5rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                                  {item.accuracy === 'EST' && <span style={{ color: 'var(--text-secondary)', marginRight: '2px', fontSize: '0.8rem' }}>~</span>}
                                  <input 
                                    type="number" 
                                    value={item.carbs} 
                                    onChange={(e) => handleEditPendingItem(idx, 'carbs', Number(e.target.value))}
                                    style={{ border: 'none', borderBottom: '1px solid transparent', padding: '0.25rem 0.15rem', background: 'transparent', height: '32px', textAlign: 'right' }}
                                  />
                                </div>
                              </td>
                              <td style={{ padding: '0.5rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                                  {item.accuracy === 'EST' && <span style={{ color: 'var(--text-secondary)', marginRight: '2px', fontSize: '0.8rem' }}>~</span>}
                                  <input 
                                    type="number" 
                                    value={item.fat} 
                                    onChange={(e) => handleEditPendingItem(idx, 'fat', Number(e.target.value))}
                                    style={{ border: 'none', borderBottom: '1px solid transparent', padding: '0.25rem 0.15rem', background: 'transparent', height: '32px', textAlign: 'right' }}
                                  />
                                </div>
                              </td>
                              <td style={{ padding: '0.5rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                                  {item.accuracy === 'EST' && <span style={{ color: 'var(--text-secondary)', marginRight: '2px', fontSize: '0.8rem' }}>~</span>}
                                  <input 
                                    type="number" 
                                    value={item.fiber} 
                                    onChange={(e) => handleEditPendingItem(idx, 'fiber', Number(e.target.value))}
                                    style={{ border: 'none', borderBottom: '1px solid transparent', padding: '0.25rem 0.15rem', background: 'transparent', height: '32px', textAlign: 'right' }}
                                  />
                                </div>
                              </td>
                              <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                                <button 
                                  className="btn-icon" 
                                  style={{ borderColor: 'var(--danger)', color: 'var(--danger)', width: '28px', height: '28px', padding: 0 }}
                                  onClick={() => handleRemovePendingItemRow(idx)}
                                >
                                  <Trash2 size={12} />
                                </button>
                              </td>
                            </tr>
                          ))}
                          {/* Totals Row */}
                          <tr style={{ backgroundColor: 'rgba(247, 147, 26, 0.04)', fontWeight: 'bold', borderTop: '2px solid var(--border)' }}>
                            <td style={{ padding: '0.75rem', fontFamily: 'var(--font-heading)' }}>Meal Total</td>
                            <td></td>
                            <td></td>
                            <td style={{ padding: '0.75rem', color: 'var(--primary)', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                              {getPendingMealTotals().calories}
                            </td>
                            <td style={{ padding: '0.75rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                              {getPendingMealTotals().protein}
                            </td>
                            <td style={{ padding: '0.75rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                              {getPendingMealTotals().carbs}
                            </td>
                            <td style={{ padding: '0.75rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                              {getPendingMealTotals().fat}
                            </td>
                            <td style={{ padding: '0.75rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                              {getPendingMealTotals().fiber}
                            </td>
                            <td></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* Buttons */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                      <button 
                        className="btn-secondary" 
                        onClick={handleAddPendingItemRow}
                        style={{ padding: '0.4rem 1rem', fontSize: '0.8rem' }}
                      >
                        + Add Item Row
                      </button>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button 
                          className="btn-success" 
                          onClick={handleSavePendingMeal}
                          disabled={pendingMeal.items.length === 0}
                        >
                          Confirm & Save
                        </button>
                        <button 
                          className="btn-danger" 
                          onClick={() => { setPendingMeal(null); }}
                        >
                          Discard
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Meal Log Blocks */}
              <div>
                <h3 style={{ fontSize: '1.4rem', fontWeight: 600, marginBottom: '1rem', fontFamily: 'var(--font-heading)', borderBottom: '1px solid var(--border)', paddingBottom: '0.4rem' }}>Today's Food Intake</h3>
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
                            items.map((item, idx) => {
                              const isEditing = editingItem && editingItem.mealName === mealName && editingItem.index === idx;
                              
                              if (isEditing && editingItem) {
                                return (
                                  <div key={idx} className="meal-item-row editing-row" style={{ flexDirection: 'column', gap: '0.75rem', padding: '1rem', alignItems: 'stretch' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '0.5rem' }}>
                                      <div>
                                        <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Food Name</label>
                                        <input 
                                          type="text" 
                                          value={editingItem.food_name} 
                                          onChange={(e) => handleEditItemField('food_name', e.target.value)}
                                          style={{ height: '34px', fontSize: '0.9rem', width: '100%', padding: '0.2rem 0.5rem', borderRadius: '4px', border: '1px solid var(--border)' }}
                                        />
                                      </div>
                                      <div>
                                        <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Quantity</label>
                                        <input 
                                          type="number" 
                                          value={editingItem.quantity} 
                                          onChange={(e) => handleEditItemField('quantity', Number(e.target.value))}
                                          style={{ height: '34px', fontSize: '0.9rem', width: '100%', padding: '0.2rem 0.5rem', borderRadius: '4px', border: '1px solid var(--border)' }}
                                        />
                                      </div>
                                      <div>
                                        <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Unit</label>
                                        <input 
                                          type="text" 
                                          value={editingItem.unit} 
                                          onChange={(e) => handleEditItemField('unit', e.target.value)}
                                          style={{ height: '34px', fontSize: '0.9rem', width: '100%', padding: '0.2rem 0.5rem', borderRadius: '4px', border: '1px solid var(--border)' }}
                                        />
                                      </div>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.35rem' }}>
                                      <div>
                                        <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Calories</label>
                                        <input 
                                          type="number" 
                                          value={editingItem.calories} 
                                          onChange={(e) => handleEditItemField('calories', Number(e.target.value))}
                                          style={{ height: '34px', fontSize: '0.85rem', width: '100%', padding: '0.2rem 0.3rem', borderRadius: '4px', border: '1px solid var(--border)', textAlign: 'right' }}
                                        />
                                      </div>
                                      <div>
                                        <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Protein</label>
                                        <input 
                                          type="number" 
                                          value={editingItem.protein} 
                                          onChange={(e) => handleEditItemField('protein', Number(e.target.value))}
                                          style={{ height: '34px', fontSize: '0.85rem', width: '100%', padding: '0.2rem 0.3rem', borderRadius: '4px', border: '1px solid var(--border)', textAlign: 'right' }}
                                        />
                                      </div>
                                      <div>
                                        <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Carbs</label>
                                        <input 
                                          type="number" 
                                          value={editingItem.carbs} 
                                          onChange={(e) => handleEditItemField('carbs', Number(e.target.value))}
                                          style={{ height: '34px', fontSize: '0.85rem', width: '100%', padding: '0.2rem 0.3rem', borderRadius: '4px', border: '1px solid var(--border)', textAlign: 'right' }}
                                        />
                                      </div>
                                      <div>
                                        <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Fat</label>
                                        <input 
                                          type="number" 
                                          value={editingItem.fat} 
                                          onChange={(e) => handleEditItemField('fat', Number(e.target.value))}
                                          style={{ height: '34px', fontSize: '0.85rem', width: '100%', padding: '0.2rem 0.3rem', borderRadius: '4px', border: '1px solid var(--border)', textAlign: 'right' }}
                                        />
                                      </div>
                                      <div>
                                        <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Fiber</label>
                                        <input 
                                          type="number" 
                                          value={editingItem.fiber} 
                                          onChange={(e) => handleEditItemField('fiber', Number(e.target.value))}
                                          style={{ height: '34px', fontSize: '0.85rem', width: '100%', padding: '0.2rem 0.3rem', borderRadius: '4px', border: '1px solid var(--border)', textAlign: 'right' }}
                                        />
                                      </div>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.25rem' }}>
                                      <button 
                                        className="btn-success" 
                                        onClick={() => handleSaveEditItem(mealName, idx, {
                                          food_name: editingItem.food_name,
                                          quantity: editingItem.quantity,
                                          unit: editingItem.unit,
                                          calories: editingItem.calories,
                                          protein: editingItem.protein,
                                          carbs: editingItem.carbs,
                                          fat: editingItem.fat,
                                          fiber: editingItem.fiber,
                                          accuracy: editingItem.accuracy,
                                          rich_tags: editingItem.rich_tags
                                        })}
                                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                                      >
                                        <Check size={14} /> Save
                                      </button>
                                      <button 
                                        className="btn-secondary" 
                                        onClick={() => setEditingItem(null)}
                                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                                      >
                                        <X size={14} /> Cancel
                                      </button>
                                    </div>
                                  </div>
                                );
                              }

                              return (
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
                                      Quantity: {item.quantity}{item.unit} | P:{item.accuracy === 'EST' ? '~' : ''}{Math.round(item.protein)}g | C:{item.accuracy === 'EST' ? '~' : ''}{Math.round(item.carbs)}g | F:{item.accuracy === 'EST' ? '~' : ''}{Math.round(item.fat)}g | Fi:{item.accuracy === 'EST' ? '~' : ''}{Math.round(item.fiber)}g
                                    </span>
                                  </div>
                                  <div className="meal-item-actions">
                                    <span style={{ fontWeight: 600, marginRight: '0.5rem' }}>{item.accuracy === 'EST' ? '~' : ''}{Math.round(item.calories)} kcal</span>
                                    
                                    {/* Move Meal Item Select Dropdown */}
                                    <select
                                      value={mealName}
                                      onChange={(e) => handleMoveItem(mealName, e.target.value, idx)}
                                      title="Move item to another meal category"
                                      style={{
                                        border: '1px solid var(--border)',
                                        borderRadius: '4px',
                                        fontSize: '0.75rem',
                                        padding: '0.15rem 0.3rem',
                                        marginRight: '0.5rem',
                                        background: 'var(--bg-secondary)',
                                        color: 'var(--text-primary)',
                                        cursor: 'pointer',
                                        fontFamily: 'var(--font-mono)'
                                      }}
                                    >
                                      <option value="breakfast">Breakfast</option>
                                      <option value="lunch">Lunch</option>
                                      <option value="dinner">Dinner</option>
                                      <option value="snack">Snack</option>
                                    </select>

                                    <button 
                                      className="btn-icon"
                                      style={{ borderColor: 'var(--primary)', color: 'var(--primary)', marginRight: '0.35rem' }}
                                      onClick={() => setEditingItem({
                                        mealName,
                                        index: idx,
                                        ...item
                                      })}
                                    >
                                      <Edit2 size={14} />
                                    </button>
                                    <button 
                                      className="btn-icon"
                                      style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}
                                      onClick={() => handleDeleteItem(mealName, idx)}
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                </div>
                              );
                            })
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
              <div className="card hard-shadow-hover">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                  <Search size={20} style={{ color: 'var(--primary)', strokeWidth: 1.5 }} />
                  <h3 style={{ fontSize: '1.4rem', fontWeight: 600, fontFamily: 'var(--font-heading)' }}>Log via Search</h3>
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
                  <div style={{ marginTop: '1rem', border: '1px solid var(--border)', padding: '1rem', borderRadius: '8px' }}>
                    <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>Selected: {selectedSearchItem.name}</div>
                    
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
                        <Plus size={16} /> Log Food
                      </button>
                      <button className="btn-secondary" onClick={() => setSelectedSearchItem(null)}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>

              {/* Macro Summary breakdown list */}
              {dayLog && remaining && (
                <div className="card hard-shadow-hover inverted-section">
                  <h3 style={{ fontSize: '1.4rem', fontWeight: 600, marginBottom: '1.25rem', fontFamily: 'var(--font-heading)', borderBottom: '1px solid var(--border)', paddingBottom: '0.4rem' }}>Remaining Target</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontFamily: 'var(--font-mono)', fontSize: '0.9rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>Calories Target</span>
                      <span style={{ fontWeight: 700 }}>
                        {remaining.calories} kcal remaining
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>Protein (HP)</span>
                      <span style={{ fontWeight: 700 }}>
                        {remaining.protein}g remaining
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>Carbohydrates</span>
                      <span style={{ fontWeight: 700 }}>{remaining.carbs}g remaining</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>Fats</span>
                      <span style={{ fontWeight: 700 }}>{remaining.fat}g remaining</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>Fiber</span>
                      <span style={{ fontWeight: 700 }}>{remaining.fiber}g remaining</span>
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
            <div className="card hard-shadow-hover">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                <Settings size={20} style={{ color: 'var(--primary)', strokeWidth: 1.5 }} />
                <h3 style={{ fontSize: '1.4rem', fontWeight: 600, fontFamily: 'var(--font-heading)' }}>Set Target Macros</h3>
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

                <button type="submit" className="btn-primary">Save Targets</button>
              </form>
            </div>

            {/* Right Box: Presets manager */}
            <div className="card hard-shadow-hover">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                <Bookmark size={20} style={{ color: 'var(--primary)', strokeWidth: 1.5 }} />
                <h3 style={{ fontSize: '1.4rem', fontWeight: 600, fontFamily: 'var(--font-heading)' }}>Create Food Presets</h3>
              </div>

              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
                Map a customizable unit (like 1 roti) to an exact ingredient gram value (like 43g wheat flour) for high accuracy calculations.
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

                <button type="submit" className="btn-success">Save Preset</button>
              </form>
            </div>
          </div>
        )}

        {/* TAB 3: CUSTOM RECIPES */}
        {activeTab === 'recipes' && (
          <div className="card hard-shadow-hover" style={{ maxWidth: '800px', margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
              <ChefHat size={22} style={{ color: 'var(--primary)', strokeWidth: 1.5 }} />
              <h3 style={{ fontSize: '1.4rem', fontWeight: 600, fontFamily: 'var(--font-heading)' }}>Formulate Custom Recipe</h3>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
              Save customized home recipes (e.g. Mixed Paneer Sabji). Log servings later. The tracker splits and scales ingredients.
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
                    + Add Ingredient
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

              <button type="submit" className="btn-primary">Save Recipe Formulation</button>
            </form>
          </div>
        )}

        {/* TAB 4: KNOWLEDGE RAG ENGINE */}
        {activeTab === 'rag' && (
          <div className="grid-dashboard">
            {/* Left Box: RAG document upload */}
            <div className="card hard-shadow-hover">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                <BookOpen size={20} style={{ color: 'var(--primary)', strokeWidth: 1.5 }} />
                <h3 style={{ fontSize: '1.4rem', fontWeight: 600, fontFamily: 'var(--font-heading)' }}>Upload Knowledge Docs</h3>
              </div>

              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
                Paste nutrition/diet guidelines, doctor recommendations, or calorie indexes to local TF-IDF search database.
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
                  Upload Document
                </button>
              </div>
            </div>

            {/* Right Box: RAG query lookup */}
            <div className="card hard-shadow-hover">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                <Search size={20} style={{ color: 'var(--primary)', strokeWidth: 1.5 }} />
                <h3 style={{ fontSize: '1.4rem', fontWeight: 600, fontFamily: 'var(--font-heading)' }}>Query Knowledge Base</h3>
              </div>

              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
                Query matching chunks in RAG database. Returns closest matches with TF-IDF cosine similarity scores.
              </p>

              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
                <input 
                  type="text" 
                  placeholder="Ask a question (e.g. cholesterol limits)..."
                  value={ragQuery}
                  onChange={(e) => setRagQuery(e.target.value)}
                />
                <button className="btn-success" onClick={handleQueryRAG} disabled={!ragQuery.trim()}>
                  Query
                </button>
              </div>

              {ragMatches.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '1rem 0' }}>No search query matches yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {ragMatches.map((match, idx) => (
                    <div key={idx} style={{ border: '1px solid var(--border)', padding: '1rem', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--bg-tertiary)' }}>
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

        {/* TAB 5: ADMIN PANEL CONTAINER */}
        {activeTab === 'admin' && activeUserRole === 'admin' && (
          <div className="admin-panel" style={{ display: 'flex', flexDirection: 'column', gap: '2rem', marginTop: '1.5rem' }}>
            <div className="card hard-shadow-hover" style={{ padding: '1.5rem' }}>
              <h2 style={{ fontSize: '1.6rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', fontFamily: 'var(--font-heading)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>🛡️</span> System Administration Node Control
              </h2>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem', flexWrap: 'wrap' }}>
                
                {/* USER PROFILE MANAGEMENT */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  <div className="card" style={{ padding: '1.25rem', border: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
                    <h3 style={{ fontSize: '1.2rem', marginBottom: '1rem', color: 'var(--primary)', fontWeight: 600 }}>Add / Edit User Node</h3>
                    <form onSubmit={async (e) => {
                      e.preventDefault();
                      const form = e.target as any;
                      const uId = form.elements.uId.value.trim().toLowerCase();
                      const uName = form.elements.uName.value.trim();
                      const uRole = form.elements.uRole.value;
                      const uCals = Number(form.elements.uCals.value);
                      const uPro = Number(form.elements.uPro.value);
                      const uCarbs = Number(form.elements.uCarbs.value);
                      const uFat = Number(form.elements.uFat.value);
                      const uFib = Number(form.elements.uFib.value);

                      if (!uId || !uName) {
                        showError("ID and Name are required.");
                        return;
                      }

                      try {
                        const res = await fetch(`${API_BASE}/users`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            user_id: uId, name: uName, role: uRole,
                            calories: uCals, protein: uPro, carbs: uCarbs, fat: uFat, fiber: uFib
                          })
                        });
                        if (res.ok) {
                          showSuccess("User profile saved successfully.");
                          fetchUsers();
                          form.reset();
                        } else {
                          showError("Failed to save user profile.");
                        }
                      } catch {
                        showError("Failed to save user profile.");
                      }
                    }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <div>
                          <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.2rem' }}>User ID (unique)</label>
                          <input name="uId" type="text" placeholder="e.g. alice123" required style={{ width: '100%' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.2rem' }}>Display Name</label>
                          <input name="uName" type="text" placeholder="e.g. Alice Smith" required style={{ width: '100%' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.2rem' }}>Role</label>
                          <select name="uRole" style={{ width: '100%', padding: '0.4rem', border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
                            <option value="user">Regular User</option>
                            <option value="admin">Administrator</option>
                          </select>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.25rem' }}>
                          <div>
                            <label style={{ fontSize: '0.7rem', display: 'block', textAlign: 'center' }}>Cal</label>
                            <input name="uCals" type="number" defaultValue={1550} style={{ width: '100%', padding: '0.2rem', textAlign: 'center' }} />
                          </div>
                          <div>
                            <label style={{ fontSize: '0.7rem', display: 'block', textAlign: 'center' }}>Prot</label>
                            <input name="uPro" type="number" defaultValue={100} style={{ width: '100%', padding: '0.2rem', textAlign: 'center' }} />
                          </div>
                          <div>
                            <label style={{ fontSize: '0.7rem', display: 'block', textAlign: 'center' }}>Carb</label>
                            <input name="uCarbs" type="number" defaultValue={160} style={{ width: '100%', padding: '0.2rem', textAlign: 'center' }} />
                          </div>
                          <div>
                            <label style={{ fontSize: '0.7rem', display: 'block', textAlign: 'center' }}>Fat</label>
                            <input name="uFat" type="number" defaultValue={30} style={{ width: '100%', padding: '0.2rem', textAlign: 'center' }} />
                          </div>
                          <div>
                            <label style={{ fontSize: '0.7rem', display: 'block', textAlign: 'center' }}>Fib</label>
                            <input name="uFib" type="number" defaultValue={25} style={{ width: '100%', padding: '0.2rem', textAlign: 'center' }} />
                          </div>
                        </div>
                        <button type="submit" className="btn-primary" style={{ marginTop: '0.5rem', width: '100%' }}>
                          Register / Update User Node
                        </button>
                      </div>
                    </form>
                  </div>
                </div>

                {/* USER PROFILES LIST */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <h3 style={{ fontSize: '1.2rem', color: 'var(--primary)', fontWeight: 600 }}>Active Registered User Nodes</h3>
                  <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: '4px' }}>
                    <table className="review-table" style={{ width: '100%' }}>
                      <thead>
                        <tr>
                          <th>User ID</th>
                          <th>Display Name</th>
                          <th>Role</th>
                          <th>Intake Goals (Cals / P / C / F / Fib)</th>
                          <th style={{ textAlign: 'center' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map(u => (
                          <tr key={u.user_id}>
                            <td style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{u.user_id}</td>
                            <td>{u.name}</td>
                            <td>
                              <span className={`tag-pill ${u.role === 'admin' ? 'tag-hp' : 'tag-hc'}`} style={{ fontSize: '0.7rem' }}>
                                {u.role.toUpperCase()}
                              </span>
                            </td>
                            <td>
                              {u.calories} kcal | P:{u.protein}g | C:{u.carbs}g | F:{u.fat}g | Fi:{u.fiber}g
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <button 
                                className="btn-icon" 
                                style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}
                                disabled={u.user_id === 'default' || u.user_id === 'admin'}
                                onClick={async () => {
                                  if (confirm(`Are you sure you want to delete user ${u.name}?`)) {
                                    try {
                                      const res = await fetch(`${API_BASE}/users/${u.user_id}`, { method: 'DELETE' });
                                      if (res.ok) {
                                        showSuccess("User deleted.");
                                        fetchUsers();
                                      }
                                    } catch {
                                      showError("Failed to delete user.");
                                    }
                                  }
                                }}
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            </div>

            {/* FOOD BANK DATABASE & PRESETS */}
            <div className="card hard-shadow-hover" style={{ padding: '1.5rem' }}>
              <h2 style={{ fontSize: '1.6rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', fontFamily: 'var(--font-heading)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>🍎</span> Global Food Database Manager
              </h2>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem' }}>
                {/* ADD FOOD FORM */}
                <div className="card" style={{ padding: '1.25rem', border: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
                  <h3 style={{ fontSize: '1.2rem', marginBottom: '1rem', color: 'var(--primary)', fontWeight: 600 }}>Register New Food Item</h3>
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    const form = e.target as any;
                    const fName = form.elements.fName.value.trim().toLowerCase();
                    const fSize = Number(form.elements.fSize.value);
                    const fUnit = form.elements.fUnit.value.trim();
                    const fCals = Number(form.elements.fCals.value);
                    const fPro = Number(form.elements.fPro.value);
                    const fCarbs = Number(form.elements.fCarbs.value);
                    const fFat = Number(form.elements.fFat.value);
                    const fFib = Number(form.elements.fFib.value);
                    const fPack = form.elements.fPack.checked;

                    if (!fName || !fUnit) {
                      showError("Name and Serving Unit are required.");
                      return;
                    }

                    try {
                      const res = await fetch(`${API_BASE}/foods`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          name: fName, serving_size: fSize, serving_unit: fUnit,
                          calories: fCals, protein: fPro, carbs: fCarbs, fat: fFat, fiber: fFib,
                          is_packaged: fPack
                        })
                      });
                      if (res.ok) {
                        showSuccess("Food added to database.");
                        fetchAdminFoods();
                        form.reset();
                      }
                    } catch {
                      showError("Failed to add food.");
                    }
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <div>
                        <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.2rem' }}>Food Name</label>
                        <input name="fName" type="text" placeholder="e.g. broccoli" required style={{ width: '100%' }} />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                        <div>
                          <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.2rem' }}>Serving Size</label>
                          <input name="fSize" type="number" defaultValue={100} style={{ width: '100%' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.2rem' }}>Serving Unit</label>
                          <input name="fUnit" type="text" defaultValue="g" required style={{ width: '100%' }} />
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.25rem' }}>
                        <div>
                          <label style={{ fontSize: '0.7rem', display: 'block', textAlign: 'center' }}>Cal</label>
                          <input name="fCals" type="number" step="any" required style={{ width: '100%', padding: '0.2rem', textAlign: 'center' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: '0.7rem', display: 'block', textAlign: 'center' }}>Prot</label>
                          <input name="fPro" type="number" step="any" required style={{ width: '100%', padding: '0.2rem', textAlign: 'center' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: '0.7rem', display: 'block', textAlign: 'center' }}>Carb</label>
                          <input name="fCarbs" type="number" step="any" required style={{ width: '100%', padding: '0.2rem', textAlign: 'center' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: '0.7rem', display: 'block', textAlign: 'center' }}>Fat</label>
                          <input name="fFat" type="number" step="any" required style={{ width: '100%', padding: '0.2rem', textAlign: 'center' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: '0.7rem', display: 'block', textAlign: 'center' }}>Fib</label>
                          <input name="fFib" type="number" step="any" required style={{ width: '100%', padding: '0.2rem', textAlign: 'center' }} />
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0.25rem 0' }}>
                        <input name="fPack" type="checkbox" id="fPack" style={{ width: 'auto', height: 'auto' }} />
                        <label htmlFor="fPack" style={{ fontSize: '0.85rem', cursor: 'pointer', fontWeight: 600 }}>Is Packaged Item</label>
                      </div>
                      <button type="submit" className="btn-primary" style={{ width: '100%' }}>Register Food Item</button>
                    </div>
                  </form>
                </div>

                {/* FOODS LIST */}
                <div>
                  <h3 style={{ fontSize: '1.2rem', marginBottom: '1rem', color: 'var(--primary)', fontWeight: 600 }}>Registered Foods Bank ({adminFoods.length})</h3>
                  <div style={{ maxHeight: '420px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '4px' }}>
                    <table className="review-table" style={{ width: '100%' }}>
                      <thead>
                        <tr>
                          <th>Food Name</th>
                          <th>Serving Size</th>
                          <th>Macros per serving size</th>
                          <th style={{ textAlign: 'center' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {adminFoods.map(f => (
                          <tr key={f.name}>
                            <td style={{ fontWeight: 600 }}>{f.name}</td>
                            <td>{f.serving_size}{f.serving_unit}</td>
                            <td>
                              {f.calories} kcal | P:{f.protein}g | C:{f.carbs}g | F:{f.fat}g | Fi:{f.fiber}g
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <button 
                                className="btn-icon" 
                                style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}
                                onClick={async () => {
                                  if (confirm(`Delete food ${f.name} from bank?`)) {
                                    try {
                                      const res = await fetch(`${API_BASE}/foods/${f.name}`, { method: 'DELETE' });
                                      if (res.ok) {
                                        showSuccess("Food deleted.");
                                        fetchAdminFoods();
                                      }
                                    } catch {
                                      showError("Failed to delete food.");
                                    }
                                  }
                                }}
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* PRESETS SUB-SECTION */}
              <div style={{ marginTop: '2.5rem', borderTop: '1px solid var(--border)', paddingTop: '2rem' }}>
                <h3 style={{ fontSize: '1.4rem', marginBottom: '1rem', fontFamily: 'var(--font-heading)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span>📋</span> Global User Custom Presets Bank ({adminPresets.length})
                </h3>
                <div style={{ maxHeight: '280px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '4px' }}>
                  <table className="review-table" style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th>User Scope</th>
                        <th>Preset Input Mapping</th>
                        <th>Resolves To Target Food Item</th>
                        <th style={{ textAlign: 'center' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adminPresets.map((p, pIdx) => (
                        <tr key={pIdx}>
                          <td style={{ fontFamily: 'var(--font-mono)' }}>{p.user_id}</td>
                          <td style={{ fontWeight: 600 }}>{p.preset_quantity} {p.preset_name} ({p.preset_unit})</td>
                          <td>{p.target_quantity} {p.target_food_name} ({p.target_unit})</td>
                          <td style={{ textAlign: 'center' }}>
                            <button 
                              className="btn-icon" 
                              style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}
                              onClick={async () => {
                                if (confirm(`Delete preset ${p.preset_name}?`)) {
                                  try {
                                    const res = await fetch(`${API_BASE}/presets/${p.preset_name}?user_id=${p.user_id}`, { method: 'DELETE' });
                                    if (res.ok) {
                                      showSuccess("Preset deleted.");
                                      fetchAdminPresets();
                                    }
                                  } catch {
                                    showError("Failed to delete preset.");
                                  }
                                }
                              }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          </div>
        )}

      </main>
    </div>
  );
}
