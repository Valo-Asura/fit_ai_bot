# FitAI - Calorie & Fitness Tracker for Indian Home Food

FitAI is a lightweight, high-performance, and visually stunning AI-powered calorie and fitness tracker customized for Indian home food, recipes, and dynamic target tracking. 

Built with **FastAPI**, **React (TypeScript + Vite)**, and a dual **MongoDB / In-Memory Mock Database Fallback**, FitAI parses messy food intake logs, matches ingredients, evaluates recipes, and computes accurate macros.

![Workflow and Dashboard Screenshot](docs/images/workflow.png)

---

## 🌟 Key Features

1. **Messy AI parsing**: Input text like *"breakfast 2 roti 10g ghee"* or *"yesterday lunch 100g cooked rice 1 bowl dal"* and let FitAI parse it.
2. **Accreditation Formula**:
   - `[EXACT]`: Mapped from weighed grams/ml, recipe calculation, or packaged labels.
   - `[PRESET]`: Custom user rules (e.g., `1 roti` mapping to `43g wheat flour`).
   - `[EST]`: Unweighed home food defaults (e.g., `1 bowl sabji` mapped to standard nutrient densities).
3. **Local RAG Engine**: Upload custom nutrition guidelines, diet plans, or cholesterol advisories and search them locally using TF-IDF Vector space scoring.
4. **Multi-LLM Provider Fallback**: Switchable LLM providers (Groq, Gemini, Ollama) that fall back to one another automatically, with a final regex rules-based parsing engine.
5. **Premium Material UI**: Glassmorphic, light/dark responsive dashboard with micro-animations, progress rings, search autocompletion, preset editors, and custom recipe formulations.

---

## 🛠️ Architecture

```mermaid
graph TD
    A[React Frontend] -->|API Request| B[FastAPI Backend]
    B -->|Parse food| C[Parser: Regex + LLM Switcher]
    C -->|Fallback| D[Groq / Gemini / Ollama]
    B -->|Calculate macros| E[Calculator: RapidFuzz Matcher]
    E -->|Database lookup| F[(MongoDB / In-Memory Mock DB)]
    B -->|Query RAG| G[RAG: Local TF-IDF search]
```

---

## 📸 Application Demo Walkthrough

### 1. Dynamic User Profile Switcher & Dashboard Targets
FitAI tracks daily calories and baseline macro metrics dynamically mapped to the current active user profile selected via the `NODE_USER` context.

### 2. Multi-User Administration Console
Administrator accounts gain access to the secure system console to register regular/admin profiles and manage target parameters:
![System Admin Panel](docs/images/admin_panel.png)

### 3. AI Food Log Parser
Input sloppy, unstructured phrasing such as `"snack 1 cup masala tea 2 digestives"` and standardise it instantly with full macro accreditation details:
![AI Parser Confirmation](docs/images/ai_parser_confirmation.png)

### 4. Interactive Meal Relocator
Easily adjust food logs by re-categorizing logged items across breakfast, lunch, dinner, or snack lists using the select control next to each item row:
![Relocate Logged Item](docs/images/relocate_item.png)

---

## ⚙️ Environment Variables (`.env`)

Create a `.env` file in the root workspace folder:

```env
# LLM Providers Configuration
GROQ_API_KEY=your_groq_key
GROQ_MODEL=llama3-70b-8192

GEMINI_API_KEY=your_gemini_key
GEMINI_MODEL=gemini-3.5-flash

OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen3:4b

# Selected Active Provider (groq | gemini | ollama | rules)
LLM_PROVIDER=gemini

# MongoDB Connection String & DB Name
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/
MONGODB_DB=fit_app

# Pinecone Vector DB Configuration (For Production RAG)
PINECONE_API_KEY=your_pinecone_api_key
PINECONE_INDEX_NAME=rag-chatbot-2
PINECONE_CLOUD=aws
PINECONE_REGION=us-east-1
```

---

## 🚀 Local Setup & Start

### 1. Backend API (FastAPI)

1. Navigate to backend:
   ```bash
   cd backend
   ```
2. Initialize virtual environment and install packages:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```
3. Seed database:
   ```bash
   PYTHONPATH=. python seed.py
   ```
4. Start FastAPI server:
   ```bash
   PYTHONPATH=. uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
   ```

### 2. Frontend App (React + Vite)

1. Navigate to frontend:
   ```bash
   cd frontend
   ```
2. Install npm packages:
   ```bash
   npm install
   ```
3. Run Development Server:
   ```bash
   npm run dev
   ```
4. Access the application in your browser at `http://localhost:5173`.

---

## 🐳 Docker Deployment

To spin up the entire stack (MongoDB, FastAPI Backend, and React Frontend) with a single command:

```bash
docker compose up --build
```

- **Frontend**: Accessible at `http://localhost:3000`
- **Backend API**: Accessible at `http://localhost:8000`
- **MongoDB Database**: Accessible at `http://localhost:27017`

---

## 🧪 Testing

We have full automated test coverage for macro calculations, preset parsing, recipe formulations, and date/meal detection.

Run backend unit tests:
```bash
cd backend
PYTHONPATH=. ./venv/bin/pytest -v
```
