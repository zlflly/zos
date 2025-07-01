# Agent Guidelines

This project is **ryOS** – a web-based AI desktop environment built with React, Tailwind CSS, shadcn, Vite and Bun. Use these notes when working in this repository.

## Environment
- Install dependencies with Bun. If Bun is not installed use:
  ```bash
  curl -fsSL https://bun.sh/install | bash && source ~/.bashrc && bun install
  ```
- Start the development server with `vercel dev` or run the local scripts:
  ```bash
  bun dev
  ```
- Build with `bun run build`, lint with `bun run lint`, and preview with `bun run preview`.

## Folder Overview
- `api/` – API endpoints.
- `public/` – static assets (`assets/`, `fonts/`, `icons/`, `patterns/`, `wallpapers/`).
- `src/` – source code.
  - `apps/` – individual applications (`src/apps/[app-name]/`).
  - `components/` – shared React components (`dialogs/`, `layout/`, `shared/`, `ui/`).
  - `config/`, `contexts/`, `hooks/`, `lib/`, `stores/`, `styles/`, `types/`, `utils/`.

### App Conventions
- App components follow the naming pattern `[AppName]AppComponent.tsx`.
- Each app exports its main component from `src/apps/[app-name]/index.tsx`.
- Use `WindowFrame` for window appearance and define a menu bar for each app.
- Global state lives in stores (`src/stores/`), implemented with Zustand.

### Components
- UI components under `@/components/ui/` follow shadcn patterns. To add new ones run:
  ```bash
  bunx --bun shadcn@latest add <component>
  ```
- Custom implementations include `audio-input-button`, `audio-bars` and `volume-bar`.

## Notes
- Pending project tasks are tracked in `.cursor/project-spec-todos.md`.
- The README lists detailed features for each built‑in application.
- Contributions are welcome via pull requests.
