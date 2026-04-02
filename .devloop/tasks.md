# Tasks: 3D Room Scanner Web App

See [requirements.md](requirements.md) for full context on each feature.

---

### TASK-001: Project scaffolding
- **Status**: done
- **Dependencies**: none
- **Description**: Initialise a Vite + React + TypeScript project. Install core dependencies: Three.js, OpenCV.js (or opencv-js wrapper). Set up Vitest with React Testing Library. Configure the project structure with folders for components, hooks, utils, and types. Add a basic App shell that renders a placeholder page.
- **Verification**: `npm run dev` starts the dev server with no errors and displays the placeholder page. `npm run test` runs Vitest with zero tests (or a smoke test) and exits cleanly.

### TASK-002: Core data types and state management
- **Status**: done
- **Dependencies**: TASK-001
- **Description**: Define TypeScript types/interfaces for the core data model: CapturedPhoto (image data, index, tags, metadata), ScanSession (collection of photos, scale reference), Room, Wall, Floor, Ceiling, Door, Window, Staircase, and the overall BuildingModel. Set up React context or a simple state store to hold the current scan session and reconstructed model. See requirements F1–F9 for what data each feature needs.
- **Verification**: Types compile with no errors. A unit test creates instances of each type and validates their structure.

### TASK-003: Camera capture component
- **Status**: done
- **Dependencies**: TASK-002
- **Description**: Build a CameraCapture React component that accesses the device camera via the MediaDevices API. Capture in low resolution. Include a shutter button that saves the current frame as a CapturedPhoto to the scan session state. Display a running count of photos taken. Handle the case where camera permissions are denied with a clear message. See requirements F1.
- **Verification**: Component renders on a device with a camera and displays the live feed. Tapping the shutter button increments the photo count and stores the photo in session state. Denying camera permissions shows an error message. Component tests verify the UI renders and the shutter button calls the capture handler.

### TASK-004: Photo tagging (doorway and window buttons)
- **Status**: done
- **Dependencies**: TASK-003
- **Description**: Add "Doorway" and "Window" buttons to the capture UI. When tapped, the current photo is tagged with the corresponding type (stored in photo metadata). Show a visual indicator of tagged photo counts (e.g., "3 doorways, 2 windows tagged"). See requirements F2.
- **Verification**: Tagging a photo updates its metadata. The tag counts display correctly. Component tests verify button clicks update tags and counts render.

### TASK-005: Scale calibration UI
- **Status**: done
- **Dependencies**: TASK-003
- **Description**: Build a ScaleCalibration component shown after capture ends. The user selects a photo from the session, draws a line (two click/tap points) over the image, and enters the real-world length with a unit selector (cm, m, inches, feet). Store the scale reference (two pixel coordinates + real-world measurement + unit) in the scan session. See requirements F3.
- **Verification**: User can select a photo, draw a line on it, and input a measurement. The scale reference is stored in the session state. Unit test verifies the pixel-to-real-world ratio calculation.

### TASK-006: Feature detection and matching
- **Status**: done
- **Dependencies**: TASK-002
- **Description**: Implement feature detection on captured photos using OpenCV.js (ORB or similar classical detector). For each pair of overlapping photos, compute feature matches. Filter matches using a ratio test or RANSAC to remove outliers. Return a set of matched feature pairs across the photo set. This is the first stage of the SfM pipeline. See requirements F4.
- **Verification**: Given a set of test photos with overlapping content, the function returns matched feature points across pairs. Unit test with fixture images confirms matches are found and outliers are filtered.

### TASK-007: Camera pose estimation
- **Status**: done
- **Dependencies**: TASK-006
- **Description**: Using the matched features from TASK-006, estimate the relative camera pose (rotation and translation) for each photo. Compute the essential matrix from matched point pairs, decompose it into rotation and translation, and chain poses across the photo sequence. See requirements F4.
- **Verification**: Given matched features from test photos, the function returns camera poses (position + orientation) for each photo. Unit test verifies poses are geometrically consistent (e.g., sequential photos have incrementally changing positions).

### TASK-008: Point cloud generation via triangulation
- **Status**: done
- **Dependencies**: TASK-007
- **Description**: Triangulate matched feature points using the estimated camera poses to produce a sparse 3D point cloud. Each point should have XYZ coordinates. Apply the scale calibration (from TASK-005) to convert to real-world units. See requirements F4.
- **Verification**: Given camera poses and matched features, the function returns a 3D point cloud. Unit test verifies points are in plausible 3D positions. If scale calibration is provided, coordinates are in real-world units.

### TASK-009: Plane detection and room geometry extraction
- **Status**: done
- **Dependencies**: TASK-008
- **Description**: Process the 3D point cloud to detect flat surfaces (planes) representing walls, floors, and ceilings. Use RANSAC-based plane fitting or similar classical approach. Classify planes by orientation (horizontal = floor/ceiling, vertical = walls). Group geometry into rooms using doorway-tagged photo positions as boundary markers. Detect floor-level changes to identify multi-level connections (stairs). See requirements F5.
- **Verification**: Given a point cloud and doorway tags, the function returns a set of rooms, each with walls, floor, and ceiling geometry. Unit test with synthetic point cloud data verifies correct plane detection and room segmentation.

### TASK-010: Door and window placement
- **Status**: done
- **Dependencies**: TASK-009
- **Description**: Map the user's door and window tags onto the reconstructed geometry. For each tagged photo, use its estimated camera pose to determine the 3D position and the nearest wall surface. Place a door or window object at that wall location with estimated dimensions based on the surrounding geometry. See requirements F5.
- **Verification**: Given tagged photos and reconstructed rooms, doors and windows are placed on the correct walls. Unit test verifies placement positions are on wall surfaces.

### TASK-011: Measurement calculation engine
- **Status**: done
- **Dependencies**: TASK-009, TASK-010
- **Description**: Calculate all measurements from the reconstructed geometry: wall lengths (per segment), room dimensions (width x depth), ceiling heights (per room), door dimensions (width x height), and window dimensions (width x height). All measurements use the scale calibration unit. If no scale reference exists, output in arbitrary units with a warning flag. See requirements F6.
- **Verification**: Given reconstructed rooms with doors and windows, the function returns all measurements. Unit tests verify calculation correctness with known geometry. Test the no-scale-reference fallback.

### TASK-012: 3D wireframe viewer
- **Status**: done
- **Dependencies**: TASK-011
- **Description**: Build a WireframeViewer React component using Three.js. Render the reconstructed building model as wireframe edges: walls, floors, ceilings as line segments, doors and windows with distinct styling (different colour or dashed lines), stairs as connected line geometry. Add OrbitControls for rotate/pan/zoom. Render measurement labels as 3D text or sprites positioned alongside the geometry. See requirements F7.
- **Verification**: Given a reconstructed model, the component renders a navigable 3D wireframe. Walls, doors, windows, and stairs are visually distinct. Orbit controls work (rotate, pan, zoom). Measurements are visible as labels.

### TASK-013: Clickable element detail panel
- **Status**: pending
- **Dependencies**: TASK-012
- **Description**: Add raycasting to the 3D wireframe viewer so that clicking on a room, wall, door, or window highlights it and opens a side panel showing its detailed measurements (e.g., clicking a room shows width, depth, ceiling height; clicking a door shows width and height). See requirements F7.
- **Verification**: Clicking a wall in the 3D view highlights it and shows its length in the detail panel. Clicking a room shows its dimensions. Component test verifies the panel renders with correct data when a selection is made.

### TASK-014: 2D floor plan viewer
- **Status**: pending
- **Dependencies**: TASK-011
- **Description**: Build a FloorPlanViewer React component that renders a top-down 2D view of each floor level. Use either a 2D canvas or Three.js orthographic camera. Draw walls as thick lines, doors as arcs or gaps, windows as parallel line markings. Overlay room dimension labels (width x depth) and wall length labels. See requirements F8.
- **Verification**: Given a reconstructed model, the component renders a 2D floor plan with walls, doors, windows, and measurement labels. Visual inspection confirms standard architectural conventions are followed.

### TASK-015: Floor switcher for multi-level
- **Status**: pending
- **Dependencies**: TASK-014
- **Description**: Add a floor switcher UI to the floor plan viewer. When multiple floor levels exist in the model, display buttons or a dropdown to toggle between floors. The 2D view updates to show the selected floor's layout. Handle the single-floor case (hide the switcher). See requirements F8.
- **Verification**: With a multi-level model, the floor switcher appears and toggles between floors correctly. With a single-floor model, the switcher is hidden. Component test verifies switcher visibility and floor selection state.

### TASK-016: Manual door/window corrections
- **Status**: pending
- **Dependencies**: TASK-012, TASK-014
- **Description**: Allow the user to manually add or remove doors and windows on the reconstructed model. In the 3D view or floor plan view, the user can click a wall location to add a door or window (with a type selector). They can also click an existing door/window to remove it. Measurements update automatically after any correction. See requirements F9.
- **Verification**: User can add a door to a wall by clicking and selecting "door". The door appears in both the 3D and 2D views. Removing a door updates both views. Measurements recalculate after changes.

### TASK-017: Manual room boundary adjustment
- **Status**: pending
- **Dependencies**: TASK-012, TASK-014
- **Description**: Allow the user to adjust room boundaries if the automatic segmentation from doorway tags is incorrect. The user can split a room into two by drawing a dividing line, or merge two adjacent rooms. The model, measurements, and both views update accordingly. See requirements F9.
- **Verification**: User can split a room and see two separate rooms with individual measurements. User can merge two rooms back. Both 3D and 2D views reflect the changes.

### TASK-018: Reconstruction progress and error handling
- **Status**: pending
- **Dependencies**: TASK-008, TASK-009
- **Description**: Add a progress indicator during the reconstruction pipeline (feature detection, matching, pose estimation, triangulation, geometry extraction). Keep the UI responsive during heavy computation (use Web Workers if needed). Detect insufficient photo overlap and prompt the user to capture more photos. Warn if no scale reference has been set. See requirements edge cases.
- **Verification**: During reconstruction, a progress bar or spinner is shown with stage labels. The UI remains interactive. If given too few photos, an appropriate error/warning message is displayed. If no scale calibration exists, measurements show an "uncalibrated" warning.

### TASK-019: App navigation and session flow
- **Status**: pending
- **Dependencies**: TASK-003, TASK-005, TASK-012, TASK-014
- **Description**: Wire together the full app flow: start screen -> capture phase -> scale calibration -> reconstruction -> viewer (with toggle between 3D wireframe and 2D floor plan). Add navigation controls to move between phases. Allow the user to go back to capture to add more photos. See requirements user flow.
- **Verification**: The user can navigate through the full flow: start -> capture -> calibrate -> reconstruct -> view. Toggling between 3D and 2D views works. Going back to capture and adding more photos triggers re-reconstruction. `npm run build` completes with no errors.

### TASK-020: End-to-end integration test
- **Status**: pending
- **Dependencies**: TASK-019
- **Description**: Create an integration test that exercises the full pipeline using fixture data: a set of mock photos with known geometry, doorway/window tags, and a scale reference. Verify that the reconstruction produces rooms with approximately correct geometry and measurements. This uses mock/synthetic data rather than real SfM (which is too heavy for automated tests).
- **Verification**: `npm run test` passes. The integration test creates a scan session with fixtures, runs the pipeline, and asserts that the output model contains the expected rooms, doors, windows, and measurements within a tolerance.
