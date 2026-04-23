# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**MiniMix** (拼好图) is a desktop image stitching/collage app built with **Tauri v2** (Rust backend + web frontend). Users drag in images, arrange them in horizontal/vertical rows, edit individual images (crop/pan/rotate/zoom), and export the result. The UI is in Chinese.

## Commands

```bash
npm run dev          # Vite dev server on :1420 (browser-only, no Tauri)
npm run build        # Build frontend to dist/
npm run tauri:dev    # Tauri dev mode (builds Rust + launches frontend)
npm run tauri:build  # Production build (syncs version, builds Tauri installer)
npm run sync-version # Sync version from package.json to Cargo.toml
```

No test framework is configured.

## Architecture

### Frontend (vanilla JS, no framework)

Single-page Canvas app with four JS modules loaded as ES modules:

- **`main.js`** — App entry point. All UI state, event handling (mouse/keyboard/drag-drop/paste), undo/redo orchestration, save modal logic. ~1500 lines. The central `state` object holds everything: image groups, drag state, edit mode, hover tracking.

- **`stitch-engine.js`** — Layout computation, Canvas rendering, hit-testing, and export. Two layout modes (`horizontal`/`vertical`) with grouped row/column support. Handles preview rendering (with drag ghosts, edit overlays, buttons), full-resolution export, and coordinate hit-testing for buttons/crop-edges/corners.

- **`image-item.js`** — `ImageItem` data model. Each image has original dimensions, render dimensions, position, and optional `editState` (crop/zoom/pan/rotation).

- **`undo-manager.js`** — Stack-based undo/redo with full state snapshots (max 30).

**Key data flow:** `state.groups` (array of arrays of image IDs) → `computeGroupedLayout()` assigns positions → `renderPreview()` draws to canvas. All mutations go through `pushUndo()` → modify state → `recomputeAndRender()`.

**Image pool:** `imagePool` (Map<id, ImageItem>) persists across undo/redo. Images are GC'd when no longer referenced by any group or undo snapshot.

### Backend (Rust / Tauri v2)

- **`src-tauri/src/lib.rs`** — Tauri commands: `get_opened_files`, `get_pending_files` (for file-open-with), `read_file_as_data_url` (reads files from disk as base64 data URLs). Uses `base64` crate for encoding.
- **`src-tauri/tauri.conf.json`** — Window config (1000x700, min 600x400), file associations (png/jpg/bmp/gif/webp), NSIS installer for Windows.
- **`src-tauri/src/main.rs`** — Standard Tauri entry point.

### Layout System

Images are organized into **groups** (rows or columns). Layout uses a two-pass approach:
1. Within each group, images are sized to match on the cross-axis (e.g., equal height in horizontal mode).
2. Between groups, groups are matched on the main axis (e.g., equal width in horizontal mode), then stacked on the cross-axis.
3. Total pixel count is capped at 5120x5120; excess is uniformly scaled down.

### Edit Mode

Per-image editing supports crop (edge dragging), pan, rotate (corner dragging), and zoom (scroll wheel). The `editState` on each `ImageItem` stores `{cropWidth, cropHeight, zoom, panX, panY, rotation}`. The engine computes a minimum scale factor to ensure the image always fills the crop area regardless of rotation.

### Save/Export

Save modal supports PNG/JPG with quality slider and resolution scaling (10-300%). Uses Tauri dialog plugin for file picker and fs plugin for writing. Copy-to-clipboard tries `navigator.clipboard` first, falls back to Tauri `invoke('write_image_to_clipboard')`.

## Important Details

- Vite is configured with `base: './'` (relative paths for Tauri) and `port: 1420`.
- Version is defined in `package.json` and synced to `Cargo.toml` via `scripts/sync-version.js` before builds.
- The app supports both Tauri native drag-drop (file paths from OS) and browser HTML5 drag-drop as fallback.
- File open-with is handled via CLI args (first launch) and single-instance events (subsequent launches).
- The `style.css` file contains all styling; there are no CSS preprocessors or component frameworks.
