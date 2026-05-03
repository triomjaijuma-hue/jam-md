#!/bin/bash
# JAM-MD Railway One-Click Deployer
# Usage: bash <(curl -s YOUR_RAW_SCRIPT_URL)

set -e

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}"
echo "╔═══════════════════════════════════════╗"
echo "║        JAM-MD Railway Deployer        ║"
echo "║           by Jaiton fangs             ║"
echo "╚═══════════════════════════════════════╝"
echo -e "${NC}"

# Install railway CLI if not present
if ! command -v railway &>/dev/null; then
    echo -e "${YELLOW}📦 Installing Railway CLI...${NC}"
    curl -fsSL https://railway.app/install.sh | sh
    export PATH="$HOME/.railway/bin:$PATH"
fi

# Check login
if ! railway whoami &>/dev/null; then
    echo -e "${YELLOW}🔑 Please login to Railway:${NC}"
    railway login
fi

echo ""
echo -e "${BOLD}📋 Enter your bot details:${NC}"
echo ""

read -p "$(echo -e ${CYAN}Session ID: ${NC})" SESSION_ID
if [ -z "$SESSION_ID" ]; then
    echo -e "${RED}❌ Session ID is required!${NC}"
    exit 1
fi

read -p "$(echo -e ${CYAN}Owner WhatsApp number (e.g. 256765309986): ${NC})" OWNER_NUMBER
OWNER_NUMBER=${OWNER_NUMBER:-256765309986}

read -p "$(echo -e ${CYAN}Bot name (default: JAM-MD): ${NC})" BOT_NAME
BOT_NAME=${BOT_NAME:-JAM-MD}

read -p "$(echo -e ${CYAN}MongoDB URL (recommended, press Enter to skip): ${NC})" MONGO_URL

read -p "$(echo -e ${CYAN}Timezone (default: Africa/Kampala): ${NC})" TIMEZONE
TIMEZONE=${TIMEZONE:-Africa/Kampala}

read -p "$(echo -e ${CYAN}UPDATE_URL - your JAM-MD repo ZIP (press Enter to skip): ${NC})" UPDATE_URL

echo ""
echo -e "${YELLOW}🚀 Starting deployment...${NC}"
echo ""

# Init railway project
echo -e "${YELLOW}📱 Creating Railway project...${NC}"
railway init --name "jam-md-bot"

# Set environment variables
echo -e "${YELLOW}⚙️ Setting environment variables...${NC}"
railway variables set \
    SESSION_ID="$SESSION_ID" \
    OWNER_NUMBER="$OWNER_NUMBER" \
    BOT_NAME="$BOT_NAME" \
    BOT_OWNER="Jaiton fangs" \
    TIMEZONE="$TIMEZONE" \
    COMMAND_MODE="public"

[ -n "$MONGO_URL" ] && railway variables set MONGO_URL="$MONGO_URL"
[ -n "$UPDATE_URL" ] && railway variables set UPDATE_URL="$UPDATE_URL"

# Deploy
echo -e "${YELLOW}📤 Deploying to Railway (this may take 3-5 minutes)...${NC}"
railway up --detach

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════╗${NC}"
echo -e "${GREEN}║        ✅ Deployment Complete!        ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════╝${NC}"
echo ""
echo -e "${BOLD}Logs:${NC}    railway logs"
echo -e "${BOLD}Status:${NC}  railway status"
echo -e "${BOLD}Open:${NC}    railway open"
echo ""
echo -e "${CYAN}📱 Use your Session ID or pairing code to connect WhatsApp!${NC}"
echo -e "${CYAN}⚡ To enable .update command, set UPDATE_URL to your JAM-MD ZIP URL${NC}"
echo -e "${YELLOW}⚠️  Make sure Railway restart policy is set to 'Always' for .update to work!${NC}"
