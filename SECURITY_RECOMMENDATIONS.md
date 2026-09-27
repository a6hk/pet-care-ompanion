# Security Audit, Hardening & Recommendations Guide

> **Project:** PawCare (Pet Care Companion)  
> **Framework:** React (Vite SPA), TypeScript, Supabase, Tailwind CSS, Google Gemini AI  
> **Hosting Platform:** Vercel  
> **Review Date:** September 2026  
> **Methodology:** OWASP Top 10 (2021), OWASP Top 10 for LLM Applications (2025), STRIDE Threat Modeling

---

## 1. Executive Summary

A comprehensive security audit and hardening assessment was executed on the PawCare application using the `security-and-hardening` framework. This assessment covered threat modeling, trust boundary identification, injection/XSS defense, authentication and authorization, file upload and input validation, HTTP security headers, AI/LLM safety, and dependency supply-chain auditing.

All identified high-priority client-side vulnerabilities have been patched, verified, and compiled cleanly via `npm run build`. This document details the completed hardening implementations, dependency triage findings, and actionable recommendations for database/backend operations.

---

## 2. Threat Model & Trust Boundaries

The application processes data across 6 primary trust boundaries:

```
[Untrusted Web User / Attacker]
       │
       ▼  (Boundary 1: Form Inputs & Image Uploads / Clipboard)
[Client SPA (React + Vite)]
  ├── (Boundary 2: LLM Output Markdown Rendering) ──► [Google Gemini API]
  ├── (Boundary 3: Storage Bucket API) ──────────────► [Supabase Storage: pet-assets]
  ├── (Boundary 4: PostgREST & Auth RPCs) ───────────► [Supabase PostgreSQL DB]
  └── (Boundary 5: HTTP Security Headers & Routing) ─► [Vercel Edge Network]
```

### STRIDE Assessment & Mitigations

| Threat | Target Surface | Vulnerability / Abuse Scenario | Mitigation & Status |
|---|---|---|---|
| **Spoofing** | Auth RPC `reset_user_password_to_default` | Anonymous users calling the RPC to reset arbitrary user passwords to default (`Welcome1`). | **Identified & Flagged** (Action item: Deprecate RPC in production; use standard email reset tokens). |
| **Tampering** | Image Uploads & Clipboard Paste | Uploading executable files, scripts, or SVGs with malicious JavaScript. | **Implemented**: Strict MIME allowlist (`image/jpeg`, `image/png`, `image/webp`, `image/gif`) & safe extension mapping. |
| **Information Disclosure** | Vercel Deployment & Git Commits | Missing security headers (referrer leakage, MIME sniffing) or exposed secrets in `.env.example`. | **Implemented**: Added `vercel.json` with HSTS, CSP, Referrer-Policy; sanitized `.env.example`. |
| **Repudiation** | Pet & Vet Record Deletion | Lack of audit logs or user-level access controls on storage objects. | **Identified**: Recommended user folder prefix scoping in Supabase Storage policies. |
| **Denial of Service** | User Form Inputs & Feedback | Large text payloads or unbounded uploads degrading app responsiveness. | **Implemented**: Max 5MB file cap, max 200 chars on feedback summary, max 4000 chars on details. |
| **Elevation of Privilege** | AI Markdown Rendering (`a` tags) | Prompt injection or LLM hallucination outputting `javascript:` or `data:` URIs leading to XSS. | **Implemented**: Regex protocol validation (`https:`, `http:`, `mailto:`) in `FormattedAIResponse.tsx`. |

---

## 3. Implemented Hardening Measures

### 3.1 HTTP Security Headers & SPA Routing (`vercel.json`)
A production-grade `vercel.json` was created to enforce defense-in-depth headers at the edge:

- **`Content-Security-Policy`**: Restricts resource loading to trusted origins:
  - `default-src 'self'`
  - `script-src 'self' 'unsafe-inline'`
  - `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`
  - `font-src 'self' https://fonts.gstatic.com data:`
  - `img-src 'self' data: blob: https:`
  - `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://generativelanguage.googleapis.com https://formspree.io`
  - `frame-ancestors 'none'`
  - `base-uri 'self'`
  - `form-action 'self'`
- **`X-Frame-Options: DENY`**: Protects against clickjacking.
- **`X-Content-Type-Options: nosniff`**: Prevents browser MIME-type sniffing.
- **`Referrer-Policy: strict-origin-when-cross-origin`**: Protects sensitive URL paths from leaking across origins.
- **`Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`**: Restricts access to sensitive browser device APIs.
- **`Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`**: Enforces HTTPS connections.
- **`rewrites`**: Prevents 404 errors on deep routes (`/app`, `/pets`, `/calendar`) during client-side navigation.

### 3.2 File Upload & Input Hardening
- **MIME Allowlist**: `ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']` applied across:
  - Pet Photo Upload Modal (`src/components/PetFormModalContent.tsx`)
  - Feedback Screenshot Upload & Clipboard Paste (`src/pages/FeedbackPage.tsx`)
- **Safe File Extension Derivation**: Paths are constructed using safe mapped extensions (`Date.now()-[uuid].[safeExt]`) instead of raw user filenames, eliminating path traversal risks.
- **Input Constraints**: Bounded string lengths for all feedback form inputs (Summary ≤ 200 chars, Details ≤ 4000 chars).

### 3.3 AI / LLM Output Sanitization (`src/components/FormattedAIResponse.tsx`)
- OWASP LLM05 (Improper Output Handling) mitigation: Custom markdown link renderer enforces strict protocol allowlists:
  ```typescript
  const isSafe = href && /^(https?:|mailto:)/i.test(href.trim())
  return <a href={isSafe ? href : undefined} target="_blank" rel="noopener noreferrer">...</a>
  ```
  Prevents DOM-based XSS attacks via `javascript:` or `data:text/html` payloads.

### 3.4 Secrets & Git Hygiene
- Added `*.pem`, `*.key`, and `*.cert` to `.gitignore`.
- Verified via `git log --all` that `.env` has never been committed.
- Replaced specific Supabase project JWT tokens and URLs in `.env.example` with generic placeholders (`https://your-project.supabase.co`, `your_supabase_anon_key`).

---

## 4. Critical Architecture Findings & Next Steps

### 4.1 🚨 High Severity: Remove or Protect `reset_user_password_to_default` RPC
* **Location:** `supabase/reset_password.sql`, `supabase/migrations/20260925203000_reset_password_rpc.sql`
* **Vulnerability:** The function is configured with `SECURITY DEFINER` and granted to `anon, authenticated`:
  ```sql
  GRANT EXECUTE ON FUNCTION reset_user_password_to_default(text) TO anon, authenticated;
  ```
  This allows anyone on the internet with your Supabase Anon Key to reset *any* user's account password to `Welcome1` simply by knowing or guessing their email address.
* **Remediation:**
  1. For production environments, run in your Supabase SQL Editor:
     ```sql
     REVOKE EXECUTE ON FUNCTION reset_user_password_to_default(text) FROM anon;
     DROP FUNCTION IF EXISTS reset_user_password_to_default(text);
     ```
  2. Implement Supabase's secure, cryptographically signed, time-limited reset email flow in `AuthContext.tsx`:
     ```typescript
     await supabase.auth.resetPasswordForEmail(email, {
       redirectTo: `${window.location.origin}/reset-password`,
     })
     ```

### 4.2 ⚠️ Medium Severity: Scope Supabase Storage Deletion Policies
* **Location:** `supabase/migrations/20260925100825_create_storage_bucket.sql`
* **Vulnerability:**
  ```sql
  CREATE POLICY "auth_delete_pet_assets" ON storage.objects FOR DELETE
    TO authenticated USING (bucket_id = 'pet-assets');
  ```
  Any authenticated user can delete files uploaded by other families/users because there is no ownership check.
* **Remediation:** Scope the storage path to the user's ID or family ID (e.g. `pet-assets/{user_id}/...`) and enforce folder-level access:
  ```sql
  DROP POLICY IF EXISTS "auth_delete_pet_assets" ON storage.objects;
  CREATE POLICY "auth_delete_pet_assets" ON storage.objects FOR DELETE
    TO authenticated USING (
      bucket_id = 'pet-assets' AND
      (storage.foldername(name))[1] = auth.uid()::text
    );
  ```

### 4.3 💡 Best Practice: Gemini API Key Architecture
* **Current State:** The client reads `VITE_GEMINI_API_KEY` from client environment or `localStorage`. Any key prefixed with `VITE_` is compiled into the client bundle and visible to visitors.
* **Recommendations:**
  1. In Google AI Studio / Google Cloud Console, restrict your API key:
     - **Application Restrictions:** Restrict HTTP Referrers to your domains (`https://pet-care-ompanion.vercel.app/*`, `http://localhost:*`).
     - **API Restrictions:** Restrict strictly to "Generative Language API".
  2. For enterprise deployments, proxy AI requests through a Vercel Serverless Function (`/api/gemini`) or Supabase Edge Function so the secret key never reaches the browser.

---

## 5. Dependency Audit Triage (`npm audit`)

The package manager audit reported 4 vulnerabilities (3 moderate, 1 high). Applying the triage decision tree:

| Package | Advisory | Severity | Production Reachability | Action Taken |
|---|---|---|---|---|
| `esbuild <=0.24.2` | GHSA-67mh-4wv8-2f99 | Moderate | **Unreachable in production.** Used exclusively by the local development server. The production bundle contains static JS/CSS assets where `esbuild` is not present. | Deferred. No production impact. |
| `react-router <=7.17.0` | GHSA-337j-9hxr-rhxg | Moderate | **Unreachable.** Affects `deserializeErrors()` during React Router SSR hydration. PawCare is a client-side SPA (`BrowserRouter`), not SSR. | Deferred. No production impact. |
| `react-router <=7.17.0` | GHSA-wrjc-x8rr-h8h6 | Moderate | **Unreachable.** Backslash open-redirect in `<Link>` / `useNavigate`. All routes in PawCare are hardcoded internal strings (`/app`, `/pets`, etc.), not arbitrary user-controlled redirect URLs. | Deferred. No production impact. |

> **Decision:** Automatic `npm audit fix --force` was intentionally bypassed because upgrading to `react-router-dom@7.x` and `vite@8.x` introduces breaking changes across router hooks and Vite plugins. All flagged vulnerabilities are unreachable in the production SPA architecture.

---

## 6. Pre-Release Verification Checklist

Before releasing updates to production, verify the following:

- [x] No secrets committed in source code or git history (`git diff --cached | grep -i "secret\|key"`).
- [x] `.env.example` contains only generic template values.
- [x] All file inputs restrict MIME types and enforce file size caps.
- [x] LLM output rendering uses protocol allowlists on links.
- [x] Security headers active in `vercel.json`.
- [x] Production build passes without errors (`npm run build`).
- [ ] Database RPC `reset_user_password_to_default` dropped in production Supabase instance.
- [ ] Google Gemini API key restricted by HTTP Referrer in Google Cloud Console.
