#!/bin/bash
# deploy.sh — One-shot deployment helper for SchoolPilot
# Run this after unpausing your Supabase project and getting the JWT secret.
set -e

echo "╔══════════════════════════════════════════╗"
echo "║        SchoolPilot Deployment            ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── Step 1: Check prerequisites ──────────────────────────────────
echo "Checking prerequisites..."

if ! command -v gh &> /dev/null; then
    echo "❌ gh (GitHub CLI) not found. Install: brew install gh"
    exit 1
fi

if ! command -v vercel &> /dev/null; then
    echo "❌ vercel CLI not found. Install: npm install -g vercel"
    exit 1
fi

if ! command -v curl &> /dev/null; then
    echo "❌ curl not found."
    exit 1
fi

echo "✅ All CLI tools found"
echo ""

# ── Step 2: Verify Supabase is reachable ─────────────────────────
SUPABASE_URL=$(grep SUPABASE_URL backend_new/.env | cut -d= -f2)
echo "Checking Supabase at $SUPABASE_URL..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$SUPABASE_URL/rest/v1/" -H "apikey: $(grep SUPABASE_SERVICE_KEY backend_new/.env | cut -d= -f2)" 2>/dev/null || echo "000")

if [ "$STATUS" = "000" ]; then
    echo "❌ Cannot reach Supabase. Is the project paused?"
    echo "   Go to https://supabase.com/dashboard and restore your project."
    exit 1
fi
echo "✅ Supabase is reachable (HTTP $STATUS)"
echo ""

# ── Step 3: Check JWT secret ─────────────────────────────────────
JWT_SECRET=$(grep SUPABASE_JWT_SECRET backend_new/.env | cut -d= -f2)
if [ "$JWT_SECRET" = "PASTE_YOUR_JWT_SECRET_HERE" ] || [ -z "$JWT_SECRET" ]; then
    echo "❌ SUPABASE_JWT_SECRET not set in backend_new/.env"
    echo "   Get it from: Supabase Dashboard → Settings → API → JWT Secret"
    exit 1
fi
echo "✅ JWT secret is configured"
echo ""

# ── Step 4: Run SQL migration ────────────────────────────────────
echo "Running database migration..."
# Use Supabase's SQL API via the management endpoint or just run via psql
# For now, print instructions since we need the user to paste SQL in the dashboard
echo "⚠️  Please run the SQL migration manually:"
echo "   1. Go to Supabase Dashboard → SQL Editor"
echo "   2. Paste and run: backend_new/migrations/001_initial_schema.sql"
echo ""
read -p "Press Enter after running the SQL migration..."
echo ""

# ── Step 5: Push to GitHub ───────────────────────────────────────
echo "Pushing latest code to GitHub..."
git add -A
git commit -m "Deploy: Dockerfile, render.yaml, JWT auth fix, encryption key, DB schema" 2>/dev/null || echo "(no changes to commit)"
git push origin main
echo "✅ Code pushed to GitHub"
echo ""

# ── Step 6: Deploy frontend to Vercel ────────────────────────────
echo "Deploying frontend to Vercel..."
cd web
vercel --prod --yes
cd ..
echo "✅ Frontend deployed"
echo ""

echo "╔══════════════════════════════════════════╗"
echo "║          Deployment Complete!            ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "Next steps:"
echo "  1. Create a Render web service from your GitHub repo"
echo "     - Point it to the backend_new/ directory"
echo "     - Set all env vars from backend_new/.env"
echo "  2. Update web/.env.local NEXT_PUBLIC_API_URL to your Render URL"
echo "  3. Re-deploy frontend: cd web && vercel --prod"
