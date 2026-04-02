# PlanScan

A browser-based 3D room scanner that turns device camera photos into reconstructed 3D wireframe models and 2D floor plans — entirely client-side, no server required.

## Features

- **Camera Capture** — Snap photos of interior spaces using your device camera (640x480 for fast processing)
- **Photo Tagging** — Mark doorways and windows during capture
- **Scale Calibration** — Draw a line on a tape measure photo and enter a real-world measurement to calibrate the model (cm, m, inches, feet)
- **Structure-from-Motion Reconstruction** — Full classical computer vision pipeline: ORB feature detection, BFMatcher with ratio test + RANSAC filtering, essential matrix decomposition, camera pose estimation, sparse 3D point cloud via ray-intersection triangulation
- **Room Geometry Extraction** — Iterative RANSAC plane detection, horizontal/vertical classification, doorway-based room segmentation, stair detection for multi-level spaces
- **Measurements** — Wall lengths, room dimensions, ceiling heights, door/window sizes computed from reconstructed geometry
- **3D Wireframe Viewer** — Three.js scene with orbit controls, color-coded elements, measurement labels, and clickable elements with a detail panel
- **2D Floor Plan Viewer** — Canvas-based top-down view with architectural conventions (thick wall lines, door arcs, window parallel lines), room/wall labels, and floor switcher for multi-level spaces
- **Manual Corrections** — Add/remove doors and windows, split and merge rooms, with automatic measurement recalculation

## Tech Stack

| Layer | Technology |
|---|---|
| Language | TypeScript 5.9 |
| UI | React 19 |
| 3D Rendering | Three.js 0.175 |
| Computer Vision | OpenCV.js 1.2 |
| Build | Vite 8 |
| Testing | Vitest 3.2 + React Testing Library 16 |
| Linting | ESLint 9 |

## Getting Started

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. Grant camera access when prompted.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Preview production build |
| `npm run test` | Run all tests |
| `npm run lint` | Lint with ESLint |

## How It Works

1. **Capture** — Open the app, start a scan session, and take photos as you move around the room
2. **Tag** — Mark which photos contain doorways or windows
3. **Calibrate** — Take a photo of a tape measure and draw a reference line to set the real-world scale
4. **Reconstruct** — The SfM pipeline matches features across photos, estimates camera poses, triangulates a 3D point cloud, detects planes, and segments rooms
5. **View** — Explore the result as a 3D wireframe or 2D floor plan, click elements for measurements, and make manual corrections

## Project Structure

```
src/
  components/     React UI components (camera, viewers, calibration, corrections)
  hooks/          State management (scan session, building model, camera, reconstruction)
  utils/          Pure computation (feature detection, pose estimation, triangulation,
                  geometry extraction, measurements, room adjustment, pipeline orchestration)
  types/          TypeScript type definitions (model, capture, geometry, OpenCV)
  App.tsx         Main app router (capture -> calibrate -> reconstruct -> view)
  main.tsx        React entry point
```

## License

Private project.
