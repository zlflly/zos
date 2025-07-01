# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ryOS is a web-based agentic AI operating system that recreates a classic macOS desktop environment with modern web technologies. It features a complete desktop interface with multiple built-in applications, AI chat integration, and cross-device compatibility.

## Development Commands

### Core Commands
- `bun dev` - Start development server
- `bun run build` - Build for production  
- `bun run lint` - Run ESLint
- `bun run preview` - Preview production build
- `bun run clear-chats` - Clear chat data using script

### Package Management
- Use **Bun** as the package manager, not npm or yarn
- Install new dependencies with `bun add <package>`
- Install dev dependencies with `bun add -d <package>`

### Testing & Quality
- Always run `bun run lint` before committing changes
- The project uses ESLint with TypeScript support
- No specific test framework is configured - check with user before adding tests

## Architecture Overview

### Tech Stack
- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS + shadcn/ui components
- **State Management**: Zustand stores with persistence
- **AI Integration**: Multiple AI SDKs (Anthropic, OpenAI, Google)
- **Audio**: Tone.js + Wavesurfer.js for audio processing
- **3D Graphics**: Three.js for visual effects
- **Deployment**: Vercel with API routes

### Project Structure
```
src/
├── apps/                    # Individual desktop applications
│   └── [app-name]/         # Each app in its own directory
│       ├── components/     # App-specific React components
│       ├── hooks/          # App-specific custom hooks
│       └── index.tsx       # Main app export
├── components/             # Shared components
│   ├── ui/                # shadcn/ui components
│   ├── dialogs/           # Modal dialogs
│   ├── layout/            # Desktop layout components
│   └── shared/            # Cross-app shared components
├── stores/                # Zustand state stores
├── hooks/                 # Global custom hooks
├── config/                # App registry and configuration
├── contexts/              # React context providers
├── lib/                   # Utilities and libraries
├── types/                 # TypeScript type definitions
└── utils/                 # Utility functions
```

### Application Architecture
- **App Registry**: All apps are registered in `src/config/appRegistry.ts`
- **Window Management**: Multi-instance window system with Z-order management
- **Component Pattern**: Each app follows `[AppName]AppComponent.tsx` naming
- **State Pattern**: Apps use local React state + global Zustand stores
- **Menu Integration**: Each app defines its own menu bar component

### Key Architectural Concepts

#### Multi-Instance Window System
- Apps can have multiple windows open simultaneously (like TextEdit)
- Each window is an "instance" with unique `instanceId`
- Window state managed through `useAppStore` with instance tracking
- Z-order maintained for proper window layering

#### Desktop Environment
- Complete desktop metaphor with Finder, menubar, and window management
- Virtual file system persisted in IndexedDB
- Cross-device responsive design (desktop, tablet, mobile)
- System-wide sound effects and visual feedback

#### AI Integration
- System-aware AI agent accessible through Chats app
- Tool calling capabilities for app control and file manipulation
- Multiple AI model support with token management
- Context-aware responses based on running applications

## Development Guidelines

### Adding New Applications
1. Create directory in `src/apps/[app-name]/`
2. Implement main component as `[AppName]AppComponent.tsx`
3. Export app configuration from `index.tsx`
4. Register in `src/config/appRegistry.ts` with window constraints
5. Add app ID to `src/config/appIds.ts`

### Component Development
- Use existing shadcn/ui components from `@/components/ui/`
- Add new shadcn components with: `bunx --bun shadcn@latest add <component>`
- Custom audio components: `audio-input-button`, `audio-bars`, `volume-bar`
- Follow existing patterns for dialogs and shared components

### State Management
- Global state: Zustand stores in `src/stores/`
- Naming pattern: `use[Feature]Store`
- Persistence: Use `persist` middleware for data that should survive page reloads
- Local state: Standard React hooks for component-specific state

### Styling Conventions
- Tailwind CSS utility classes
- Custom CSS in `src/index.css` for global styles
- Desktop-specific styling patterns for authentic macOS look
- Responsive design considerations for mobile/tablet

### API Integration
- API routes in `api/` directory using Vercel functions
- AI model integration through dedicated utility files
- Rate limiting and error handling for external services
- Environment variables for API keys and configuration

## Important Files
- `src/config/appRegistry.ts` - Central app registration and window config
- `src/stores/useAppStore.ts` - Main application state management
- `src/components/layout/WindowFrame.tsx` - Window appearance system
- `src/hooks/useWindowManager.ts` - Window management logic
- `api/utils/aiModels.ts` - AI model configuration
- `public/data/` - Static data files for apps

## AI Agent Context
When the AI agent (Ryo) is mentioned in issues or features, it refers to the system-integrated AI accessible through the Chats app. This AI has tool calling capabilities and can interact with the desktop environment, control applications, and manipulate files in the virtual file system.