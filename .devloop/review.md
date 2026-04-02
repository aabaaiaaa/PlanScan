# Code Review: 3D Room Scanner Web App

**Date:** 2026-04-02
**Reviewer:** Claude (automated)
**Commit:** 579a140 (master)
**Build status:** TypeScript compiles cleanly, all 386 tests pass across 21 test files.

---

## Requirements vs Implementation

### All Requirements Met

Every requirement from `requirements.md` has a corresponding implementation, and all 20 tasks are marked as done.

| Requirement | Status | Notes |
|---|---|---|
| F1: Device Camera Capture | **Met** | `useCamera` hook handles permissions, low-res capture (640x480), and frame extraction. |
| F2: Photo Tagging | **Met** | Doorway/window buttons in `CameraCapture`, tag counts displayed, metadata stored in session. |
| F3: Scale Calibration | **Met** | `ScaleCalibration` component with click-to-draw line, unit selector (cm/m/inches/feet), and pixel-to-real-world ratio. |
| F4: SfM Reconstruction | **Met** | Full pipeline: ORB feature detection, BFMatcher + ratio test + RANSAC filtering, essential matrix decomposition, BFS pose chaining, ray-intersection triangulation. |
| F5: Room Geometry Extraction | **Met** | Iterative RANSAC plane detection, horizontal/vertical classification, doorway-based room segmentation, stair detection. |
| F6: Measurement Calculation | **Met** | Wall lengths, room dimensions, ceiling heights, door/window sizes calculated from geometry. Uncalibrated warning when no scale reference. |
| F7: 3D Wireframe Viewer | **Met** | Three.js scene with OrbitControls, distinct visual styles (dashed lines for doors/windows, colour-coded), measurement labels as sprites, raycasting click-to-select with detail panel. |
| F8: 2D Floor Plan Viewer | **Met** | Canvas-based top-down view with architectural conventions (thick wall lines, door arcs, window parallel lines), room/wall labels, floor switcher. |
| F9: Manual Corrections | **Met** | Add/remove doors and windows via edit mode in both viewers. Room split (draw dividing line) and room merge. Measurements recalculate after changes. |
| Edge: Insufficient photos | **Met** | Validation requires >=2 photos, overlap check after feature matching. |
| Edge: Missing scale | **Met** | Warning displayed, measurements labelled as arbitrary units. Skip button on calibration screen. |
| Edge: Single room | **Met** | Works without doorway tags. Integration test verifies single-room scenario. |
| Edge: Camera denied | **Met** | `useCamera` detects `NotAllowedError`/`PermissionDeniedError` and displays clear message. |
| Edge: Progress indicator | **Met** | `ReconstructionProgress` component with stage labels, percent bar, spinner. `yieldToUI()` between stages keeps UI responsive. |

### Scope Creep

None identified. The implementation closely follows the requirements without adding extraneous features.

---

## Code Quality

### Architecture & Structure

The codebase is well-organized with clear separation of concerns:

- **`types/`** — Clean TypeScript interfaces with barrel exports
- **`hooks/`** — React context providers for scan session and building model state
- **`utils/`** — Pure computational functions (CV pipeline, geometry, measurements)
- **`components/`** — UI components with consistent patterns

The state management approach (React context + `useReducer`) is appropriate for a single-user, no-backend app. The two contexts (`ScanSessionProvider` and `BuildingModelProvider`) keep capture state separate from model state cleanly.

### Bugs & Logic Issues

1. **`photoToImageData` is synchronous but uses `new Image()`** (`reconstructionPipeline.ts:299-308`). The `Image` constructor loads asynchronously — `drawImage` will draw nothing because `img.onload` hasn't fired. This means the reconstruction pipeline will receive blank `ImageData` objects. The function needs to either:
   - Use `createImageBitmap()` (async) and await it, or
   - Decode the data URL via a synchronous path (e.g., use the photo's original pixel data directly)
   
   **Severity: Critical** — This would cause reconstruction to fail with real photos captured from the camera. It works in tests only because the integration tests bypass this function by providing pre-built point clouds directly.

2. **OpenCV Mat creation via `Object.assign` is invalid** (`featureDetection.ts:178-179`, `poseEstimation.ts:111-112`, `poseEstimation.ts:223`). The code does `Object.assign(pts1, { rows: N, cols: 1, data32F: ... })` on a `new cv.Mat()`. OpenCV.js Mats are native objects — you cannot override their `rows`, `cols`, and typed array buffers by assigning JavaScript properties. The correct approach is `cv.matFromArray(rows, cols, type, data)` or constructing with `new cv.Mat(rows, cols, type)` and writing to `.data32F` / `.data64F` directly.
   
   **Severity: Critical** — The feature detection, RANSAC filtering, and pose estimation would all fail at runtime with a real OpenCV.js instance. Tests pass because they use mock objects where `Object.assign` does work.

3. **`createSplitWall` plane distance sign** (`roomBoundaryAdjustment.ts:432`). The plane distance is computed as `vec3Dot(normal, bottomLeft)` but in the rest of the codebase (`geometryExtraction.ts:120`), it's computed as `-vec3Dot(normal, point)`. This sign inconsistency could cause `pointToPlaneDistance` to return incorrect values for split walls.
   
   **Severity: Medium** — Affects manual room splitting accuracy.

4. **Door/window geometry ignores wall orientation in 3D** (`WireframeViewer.tsx:119-172`). Doors and windows are always rendered as axis-aligned rectangles in the XZ plane (using `p.z` as the fixed depth). For walls that aren't aligned with the Z-axis, doors and windows will appear floating in space rather than flush with the wall surface.
   
   **Severity: Medium** — Visual issue; measurements are still correct.

5. **`handleBackToCapture` doesn't re-open the session** (`App.tsx:98-100`). When going back to capture after calibration or reconstruction, `setPhase('capture')` is called but `session.endedAt` remains set (from `END_SESSION`). The camera component still works, but the session state is inconsistent.
   
   **Severity: Low** — Cosmetic state inconsistency; doesn't affect functionality.

### Error Handling

- **Good:** Every stage of `runReconstruction` is wrapped in try/catch with specific error codes. Validation runs before heavy computation. The UI provides retry and "add more photos" options on failure.
- **Good:** Camera permission denial is detected by specific exception name checks.
- **Gap:** No error boundary around the Three.js viewer. A WebGL context loss or rendering error would crash the entire app.
- **Gap:** The `opencv.js` dynamic import in `App.tsx:68` (`import('opencv.js')`) will fail with a network error if the module isn't bundled — there's no user-facing fallback for this.

### Security

No security concerns. The app is entirely client-side with no server communication, no user auth, no data persistence, and no external API calls. Camera access uses the standard permissions model. Photo data stays in memory as data URLs.

### Memory Management

- **Good:** OpenCV Mat objects are consistently cleaned up with `.delete()` calls in `finally` blocks.
- **Good:** Three.js geometry and materials are disposed when the model changes or the component unmounts.
- **Concern:** Photos are stored as data URLs (base64 strings) in React state. For a large number of low-res photos (640x480 JPEG at ~30KB each), 100+ photos would consume ~3MB+ of string data in the React state tree. Each state update copies the entire photos array. This is manageable for a hobby project but would need optimization for larger scans.

---

## Testing

### Coverage Summary

| Area | Test Files | Tests | Coverage Quality |
|---|---|---|---|
| Types | 1 | 18 | Basic structural validation |
| Utilities | 8 | 171 | **Excellent** — thorough math validation, edge cases, synthetic data |
| Hooks | 2 | 18 | Good — all reducer actions tested |
| Components | 7 | 122 | Good — UI states and interactions covered |
| Integration | 1 | 7 | Good — end-to-end pipeline with synthetic geometry |
| Pipeline | 1 | 10 | Good — validation paths and error handling |
| App shell | 1 | 2 | Minimal — only start screen and navigation |
| **Total** | **21** | **386** | |

### Strengths

- The utility/algorithm tests are outstanding. Pose estimation tests verify rotation matrix orthogonality. Triangulation tests verify points appear at expected 3D positions. Geometry extraction tests use synthetic point clouds with known geometry and verify room dimensions within tolerance.
- Integration tests exercise the full pipeline from point cloud through room extraction and measurement, using two realistic scenarios (two-room with doorway/window tags, single room without tags).
- Component tests use well-constructed mocks for WebGL, Canvas 2D, and MediaStream APIs.

### Gaps & Untested Edge Cases

1. **The critical `photoToImageData` bug (described above) is masked** because integration tests bypass the full reconstruction pipeline — they call `extractRoomGeometry` directly with synthetic point clouds rather than starting from photos.

2. **No test of the actual OpenCV.js integration.** All feature detection and pose estimation tests use mock `cv` objects. This is appropriate (real OpenCV.js is too heavy for unit tests), but means the `Object.assign` bug described above is also masked.

3. **App-level tests are minimal** (2 tests). There's no testing of:
   - The full capture → calibrate → reconstruct → view flow
   - Re-entering capture mode after reconstruction
   - View mode toggling (3D/2D)
   - Correction flow through the app (edit mode, popup, dispatch)

4. **No tests for concurrent/race conditions**, e.g., starting a new scan while reconstruction is running.

5. **FloorPlanViewer and WireframeViewer interaction tests are limited.** The edit mode, split/merge interactions, and popup positioning are tested for rendering but not for the full correction dispatch flow through the model reducer.

6. **No tests for very large inputs** — the RANSAC plane fitting uses `Math.random()` which makes it non-deterministic. Test results could theoretically vary across runs (though the synthetic data is clean enough that this is unlikely in practice).

---

## Recommendations

### Must Fix Before Production

1. **Fix `photoToImageData`** — The synchronous `Image` loading will produce blank ImageData. Use `createImageBitmap()` or store raw pixel data alongside the data URL during capture.

2. **Fix OpenCV Mat construction** — Replace `Object.assign` with proper OpenCV.js Mat creation APIs (`cv.matFromArray` or direct buffer writes). Without this, the SfM pipeline cannot work with a real OpenCV.js instance.

3. **Add a React error boundary** around the Three.js viewer to prevent rendering errors from crashing the entire app.

### Should Fix

4. **Fix the plane distance sign inconsistency** in `createSplitWall` (use `-vec3Dot(normal, point)` to match the rest of the codebase).

5. **Orient door/window rectangles to the wall surface** in `WireframeViewer` rather than always rendering axis-aligned in the Z plane.

6. **Clear `session.endedAt`** when re-entering capture mode, or add a `REOPEN_SESSION` action to the scan session reducer.

7. **Add error handling for the `opencv.js` dynamic import** — show a meaningful error if the module fails to load.

### Nice to Have

8. **Add a loading state** for the OpenCV.js module import (it can take several seconds on first load).

9. **Consider using Web Workers** for the reconstruction pipeline. Currently `yieldToUI()` (setTimeout) keeps the UI responsive, but heavy stages like feature detection could still cause jank. The architecture is already async-friendly.

10. **Add keyboard shortcuts** for common operations (Escape to cancel edit mode, Enter to confirm, etc.).

---

## Future Considerations

### Features

- **Export functionality** — Allow exporting the model as a standard format (OBJ, glTF, DXF, or SVG for floor plans). This is the most obvious next feature for a tool that generates 3D models.
- **Session persistence** — Save/load scan sessions to IndexedDB or localStorage so work isn't lost on page refresh.
- **Undo/redo** — The reducer-based state management makes this straightforward to implement (store action history).
- **Photo review** — Allow the user to review and delete individual photos before reconstruction, rather than having to start over.
- **Dense reconstruction** — The current sparse point cloud produces simplified room geometry. Adding a densification step (or using multi-view stereo) could produce more detailed models.
- **Measurement annotation** — Let users place custom measurement lines between arbitrary points in the 3D/2D views.

### Architectural Decisions to Revisit

1. **Data URL storage for photos** — At scale, storing photos as base64 data URLs in React state creates large string copies on every state update. Consider using `Blob` objects stored in a `Map` outside of React state, with only references (blob URLs) in the state tree.

2. **Single-threaded reconstruction** — The pipeline runs on the main thread with `setTimeout` yields. As photo counts grow, this will cause noticeable UI freezes. Web Workers are the natural next step, and the async pipeline architecture already supports this migration.

3. **RANSAC non-determinism** — `fitPlaneRANSAC` uses `Math.random()`. For reproducible results (important for debugging), consider accepting an optional seed or using a PRNG.

4. **Room segmentation algorithm** — The current approach (1D partitioning along the dominant axis using doorway positions) works for simple linear layouts but will struggle with L-shaped rooms, rooms on both sides of a corridor, or irregular floor plans. A more robust approach would use Voronoi partitioning or graph-based spatial clustering.

5. **OpenCV.js bundle size** — The full `opencv.js` package is ~8MB. For a browser app, consider using a minimal custom build with only the required modules (ORB, BFMatcher, essential matrix). This would significantly reduce initial load time.

### Technical Debt

1. **The two critical runtime bugs** (photoToImageData, OpenCV Mat construction) are the most urgent debt. They were likely introduced because the test infrastructure uses mocks that don't enforce the real API contracts.

2. **Inline styles in components** — `DetailPanel`, `CorrectionPopup`, `WireframeViewer`, and `FloorPlanViewer` all use inline React styles rather than CSS classes. This makes theming and responsive adjustments harder. Consider migrating to CSS classes or CSS modules.

3. **Duplicate `formatLength` function** — The same helper exists in `WireframeViewer.tsx:254` and `FloorPlanViewer.tsx:561`. Should be extracted to a shared utility.

4. **No ESLint CI enforcement** — `eslint` is in devDependencies but there's no `lint` step in CI (only `build` and `test` in the task verification criteria).

5. **App.tsx reconstruction trigger pattern** — The `useEffect` that triggers reconstruction when `phase === 'reconstruct'` has an `eslint-disable-next-line` comment suppressing the exhaustive-deps warning. This is a code smell — the reconstruction should be triggered by an explicit action rather than an effect watching a phase change.

---

## Summary

This is a well-structured proof-of-concept that implements all specified requirements with clean TypeScript, good separation of concerns, and excellent test coverage (386 tests). The architecture makes smart use of React context + reducers for state management and properly separates pure computational logic from UI components.

The two critical bugs (synchronous image loading and invalid OpenCV Mat construction) would prevent the app from working with real photos and a real OpenCV.js instance. They work in tests because the test infrastructure uses mocks that bypass these code paths. These must be fixed before any manual testing with a real camera.

Beyond those two issues, the codebase is solid for a hobby project / proof-of-concept. The 3D rendering, 2D floor plans, measurement system, and manual correction features are all well-implemented and thoroughly tested.
