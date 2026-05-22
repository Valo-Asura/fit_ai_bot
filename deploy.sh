#!/bin/bash
set -e

# Colors for terminal styling
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== FitAI Tracker Deployment Automation ===${NC}"

# Step 1: Check Git Repo
if [ ! -d ".git" ]; then
    echo -e "${YELLOW}Initializing new git repository...${NC}"
    git init
    git branch -M main
else
    echo -e "${GREEN}Git repository already initialized.${NC}"
fi

# Step 2: Stage and Commit Changes
echo -e "${BLUE}Staging changes...${NC}"
git add .

# Check if there are changes to commit
if git diff-index --quiet HEAD --; then
    echo -e "${GREEN}No new changes to commit.${NC}"
else
    echo -e "${YELLOW}Committing local changes...${NC}"
    git commit -m "Initialize FitAI project with Hand-Drawn design system"
fi

# Step 3: Check Remote Repository Configuration
REMOTE_URL=$(git remote get-url origin 2>/dev/null || true)
if [ -z "$REMOTE_URL" ]; then
    echo -e "${YELLOW}------------------------------------------------------------"
    echo -e "WARNING: No git remote repository configured yet."
    echo -e "To push this repository to GitHub, please run:"
    echo -e "  git remote add origin <your-github-repo-url>"
    echo -e "  git push -u origin main"
    echo -e "------------------------------------------------------------${NC}"
else
    echo -e "${GREEN}Remote repository configured: ${REMOTE_URL}${NC}"
fi

# Step 4: Build and Deploy Frontend
echo -e "${BLUE}Building and deploying frontend...${NC}"
cd frontend

# Build and deploy using gh-pages npm tool
if [ -n "$REMOTE_URL" ]; then
    echo -e "${YELLOW}Running build & deploy to gh-pages...${NC}"
    npm run deploy
    echo -e "${GREEN}Successfully built and published static bundle to gh-pages!${NC}"
else
    echo -e "${YELLOW}Skipping gh-pages publication (No remote origin config).${NC}"
    echo -e "Run 'npm run build' to bundle assets manually in 'frontend/dist/' or rerun this script after setting the git remote origin.${NC}"
fi

echo -e "${GREEN}Done!${NC}"
