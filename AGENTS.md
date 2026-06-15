# AGENTS.md

## Nara Documentation

When working on this project, always consult the documentation before writing code or answering questions:

- **Product requirements**: `internal/product/PRD.md` — Features, user stories, non-functional requirements
- **Architecture**: `internal/core/ARCHITECTURE.md` — Stack, components, data flow, design decisions
- **Voice pipeline**: `internal/voice/TTS.md` — OpenAI STT + OpenAI TTS + audio FX
- **LLM strategy**: `internal/ai/LLM.md` — DeepSeek V4 Pro, system prompt, context assembly
- **Memory system**: `internal/ai/MEMORY.md` — Hermes-inspired 4-layer memory with SQLite
- **Animation state machine**: `internal/avatar/ANIMATION.md` — States, transitions, triggers, AFK system
- **Configuration**: `internal/core/CONFIG.md` — Settings persistence, API keys, Rust commands
- **Error handling**: `internal/core/ERROR_HANDLING.md` — Retries, timeouts, fallbacks
- **Deployment**: `internal/core/DEPLOYMENT.md` — Tauri packaging

## API & Technology References

Consult these before working with external APIs or frameworks:

- **DeepSeek API**: `reference/deepseek/llms.txt` — Endpoints, models, pricing, rate limits
- **Tauri**: `reference/tauri/llms.txt` — Window config, IPC, plugins, build system
- **Three.js**: `reference/threejs/llms.txt` — Import maps, GLTFLoader, AnimationMixer
- **Python**: `reference/python/python-llms.txt` — Python 3.14 docs index

## Project Overview

Nara is a desktop companion app built with Tauri + TypeScript + Three.js. It features a 3D quarian AI named Nara'Korrin who responds to voice and text, remembers past conversations through a persistent memory system, and uses OpenAI APIs for STT and TTS.

**Stack**: Tauri 2.x (Rust) + TypeScript + Three.js + Web Audio API  
**LLM**: DeepSeek V4 Pro API  
**STT**: OpenAI Whisper API  
**TTS**: OpenAI TTS API  
**Memory**: SQLite via Tauri (Hermes-inspired 4-layer architecture)  
**Models**: GLB pipeline (Blender → embedded textures)

## Internal Notes

Private documentation and notes not tracked in version control live in `internal/reference/`. This includes drafts, experiments, and reference material that isn't ready for the repository.
