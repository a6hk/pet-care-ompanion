# PetPal — Pet Care Companion

A modern pet care companion app built with React, Vite, TypeScript, Tailwind CSS, and Supabase.

## Features

- 🐾 **Pet Profiles**: Track breed, age, weight, preferences, and photos.
- 📋 **Care Checklists**: AI-powered daily care routines and vet instructions conversion.
- ⏰ **Routines**: Schedule feeding and walking habits.
- 📅 **Calendar & Appointments**: Vet visits, grooming sessions, and vaccination due dates.
- 👨‍👩‍👧‍👦 **Family Sharing**: Invite family members to coordinate care collaboratively.

---

## Getting Started Locally

### 1. Prerequisites
- Node.js (v18+ recommended)
- npm (or pnpm / yarn)
- A [Supabase](https://supabase.com) account (or local Supabase CLI instance)

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables
Copy the `.env.example` file to `.env`:
```bash
cp .env.example .env
```
Edit `.env` and fill in your Supabase project credentials:
```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

> **Note:** If you haven't set up Supabase yet, the app will still run in local preview mode and display a setup banner prompting you to connect your project.

### 4. Running Supabase Locally (Docker)

This repository already has the Supabase project configuration in [`supabase/config.toml`](supabase/config.toml) and migrations in [`supabase/migrations/`](supabase/migrations).

#### Step 1: Start Docker Desktop
Make sure **Docker Desktop** is running on your Mac.

#### Step 2: Start Local Supabase
Run the preconfigured script:
```bash
npm run supabase:start
```
*(Or `npx supabase start`)*

This starts local PostgreSQL, PostgREST API, Auth, Storage, and Supabase Studio inside Docker containers and automatically runs all 4 migrations in `supabase/migrations/`.

#### Step 3: Copy the Local API Credentials
Once started, the CLI will output your local credentials:
- **API URL**: `http://localhost:54321` (or `http://127.0.0.1:54321`)
- **anon key**: A long JWT string starting with `eyJ...`
- **Supabase Studio (Dashboard)**: `http://localhost:54323`
- **Inbucket (Email testing)**: `http://localhost:54324`

Put these in your `.env` file:
```env
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=<the_anon_key_from_cli_output>
```

#### Other Handy Local Supabase Commands:
```bash
npm run supabase:status   # Check status and see ports/keys
npm run supabase:stop     # Stop local containers
```

---

### Alternative: Remote / Hosted Supabase (supabase.com)
If you prefer not using Docker, you can run the SQL migration scripts in `supabase/migrations/` using the [Supabase SQL Editor](https://app.supabase.com):
1. `20260925100728_create_tables.sql`
2. `20260925100808_create_rls_policies.sql`
3. `20260925100825_create_storage_bucket.sql`
4. `20260925102709_fix_rls_recursion.sql`
5. `20260925203000_reset_password_rpc.sql` (enables in-app reset to default password `Welc@me135246`)

### 5. (Optional) Edge Functions for AI & Email Reminders
The functions in `supabase/functions/` can be deployed via Supabase CLI:
- `generate-checklist`: Requires `OPENROUTER_API_KEY`
- `send-reminders`: Requires `RESEND_API_KEY`

```bash
supabase functions deploy generate-checklist
supabase functions deploy send-reminders
```

### 6. Run Development Server
```bash
npm run dev
```
Open your browser at [http://localhost:5173](http://localhost:5173).

### 7. Build for Production
```bash
npm run build
```
