# GameHub

Full-stack application built with React, Express, TypeScript, and Prisma.

## Development

### First-time setup

```bash
# Start database and run initial setup
npm run dev:setup
```

### Daily development

```bash
# Start both frontend and backend with hot reload
npm run dev
```

- Frontend: http://localhost:3000 (configurable via `VITE_PORT` in `.env`)
- Backend: http://localhost:3001 (configurable via `PORT` in `.env`)
- Database: PostgreSQL on localhost:5432

## Database

This project uses a **shared PostgreSQL container** approach to avoid port conflicts and abandoned containers when working with multiple game-hub projects.

### How it works
- Single PostgreSQL container (`sage-shared-dev-postgres`) shared across all projects
- Each project gets its own database (`game_hub_dev`) within the shared container
- Container starts automatically when you run `npm run dev`

### Database commands

`npm run dev` applies pending migrations with `migrate deploy` (no drift check), so the app starts without prompts. Use `npm run db:migrate` when you change the schema and want to create a new migration.

```bash
# Start shared container and create project database (automatic)
npm run db:ensure

# Generate Prisma client
npm run db:generate

# Apply pending migrations (used by npm run dev)
npm run db:migrate:deploy

# Create and apply a new migration (run after schema changes)
npm run db:migrate

# Open database browser
npm run db:studio

# Reset project database
npm run db:reset

# Shared container management
npm run postgres:shared-status  # View container status
npm run postgres:shared-stop    # Stop shared container (affects all projects)
npm run postgres:shared-logs    # View container logs
```

## Multiple Projects

To run multiple game-hub projects simultaneously, adjust the ports in each project's `.env` file:

**Project 1 (.env):**
```bash
PORT=3001
VITE_PORT=3000
```

**Project 2 (.env):**
```bash
PORT=3002
VITE_PORT=4000
```

**Project 3 (.env):**
```bash
PORT=3003
VITE_PORT=4001
```

All projects will share the same PostgreSQL container but have separate databases and ports.

## Building

```bash
# Build for production
npm run build

# Start production server
npm run start
```

## Deployment

This project includes **automated Fly.io deployment setup** - just run `npm run deploy` and it handles everything!

### Prerequisites

1. Install Fly CLI: https://fly.io/docs/getting-started/installing-flyctl/
2. Sign up: https://fly.io/docs/getting-started/sign-up-sign-in/
3. Login: `fly auth login`

### First-Time Deployment

Simply run:
```bash
npm run deploy
```

The first time you deploy, the setup script will automatically:
- ✅ Check that Fly CLI is installed and you're logged in
- 🚀 Create your Fly.io app
- 🗄️ Set up a production database (offers to create Fly PostgreSQL)
- 🔗 Configure DATABASE_URL secret
- 🏗️ Build and deploy your application

### Subsequent Deployments

After the first deployment, simply run:
```bash
npm run deploy
```

This will build and deploy without running setup again.

### Database Options

During first deployment, you'll be offered:
1. **Create Fly PostgreSQL database** (recommended) - Fully managed
2. **Enter existing DATABASE_URL** - If you already have a database
3. **Skip database setup** - Set up manually later

### Manual Database Setup (Optional)

If you prefer to set up the database manually:

```bash
# Option 1: Create Fly PostgreSQL
fly postgres create --name game-hub-db

# Option 2: Use external database (Supabase, Railway, PlanetScale, etc.)
fly secrets set DATABASE_URL="your-external-db-url"
```

### Advanced Commands

```bash
# Force re-run deployment setup
npm run deploy:force-setup

# Manual Fly commands (if needed)
fly apps list
fly secrets list
fly logs
```

## Project Structure

```
game-hub/
├── client/              # React frontend
├── server/              # Express backend
├── scripts/             # Database setup scripts
├── docker-compose.yml   # Shared container reference
└── fly.toml            # Deployment config
```

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Backend**: Express + TypeScript + Prisma ORM
- **Database**: PostgreSQL
- **Development**: Docker Compose
- **Deployment**: Fly.io