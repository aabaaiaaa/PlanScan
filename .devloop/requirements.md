# Requirements: 3D Room Scanner Web App

## Overview

A browser-only web application that allows a user to capture low-resolution photos of interior spaces using their device camera and reconstruct them into a 3D wireframe model using classical computer vision techniques. The app displays simplified room geometry (walls, floors, ceilings, stairs) with real-world measurements, and maps out doors and windows based on user tagging during capture.

This is a personal hobby project — single user, no auth, no backend server. All processing runs client-side in the browser.

---

## Tech Stack

- **Language**: TypeScript
- **UI Framework**: React
- **3D Rendering**: Three.js
- **Computer Vision**: OpenCV.js (structure-from-motion, feature matching, stereo reconstruction)
- **Build Tool**: Vite
- **Testing**: Vitest + React Testing Library
- **Architecture**: Fully client-side, no backend

---

## User Flow

### Capture Phase

1. User opens the app and starts a new scan session.
2. The app activates the device camera in low-resolution mode. Low-res is intentional — it allows the user to take many more photos with faster processing, and quantity of angles matters more than individual photo quality for reconstruction.
3. The user walks through their space continuously, snapping photos as they go. The app stores each photo with a sequential index.
4. **Doorway tagging**: At any point during capture, the user can tap a "Doorway" button to tag the current photo as a room transition point. This marks the 3D position of that photo as a boundary between two rooms.
5. **Window tagging**: Similarly, the user can tap a "Window" button to tag the current photo's 3D position as a window location.
6. **Scale reference**: At least one photo should include a visible tape measure. After capture, the user selects that photo, draws a line over a known length on the tape measure, and types in the real-world measurement (e.g., "50 cm"). This calibrates the entire model to real-world scale.
7. The user can capture across multiple rooms and multiple levels (floors connected by stairs).
8. When done, the user ends the capture session and triggers reconstruction.

### Reconstruction Phase

1. The app runs a structure-from-motion (SfM) pipeline on the captured photos:
   - Feature detection and matching across overlapping photo pairs (e.g., ORB or similar classical feature detectors via OpenCV.js)
   - Camera pose estimation for each photo
   - Sparse 3D point cloud generation via triangulation
2. The point cloud is processed into simplified room geometry:
   - Plane detection to identify walls, floors, and ceilings
   - Room segmentation using the user's doorway tags as boundary markers
   - Stair detection where floor levels change between rooms
3. The user's scale reference (drawn line + entered measurement) is applied to convert all coordinates to real-world units.
4. Tagged door and window positions are mapped onto the nearest wall surfaces in the 3D model.
5. Measurements are calculated: wall lengths, room width/depth, ceiling heights, and door/window dimensions.

### Viewing Phase

The reconstructed model can be viewed in two modes:

#### 3D Wireframe View
- Displays the full 3D model as a wireframe: walls, floors, ceilings, stairs rendered as edges/outlines rather than solid surfaces.
- Orbit controls: rotate, pan, and zoom around the model freely.
- Doors and windows are highlighted/marked distinctly on the wireframe (e.g., different colour or dashed lines).
- Measurements are displayed as labels on the wireframe (wall lengths, ceiling heights, etc.).
- Clicking on a room, wall, door, or window shows its measurements in a detail panel.

#### Floor Plan View (2D Top-Down)
- A top-down 2D view showing the layout of each floor.
- Floor switcher to toggle between levels when multiple floors exist.
- Walls drawn as lines, doors shown as arcs or gaps, windows shown as distinct markings.
- Room dimensions labelled (width x depth).
- Wall lengths labelled along each wall segment.

---

## Features

### F1: Device Camera Capture
- Access the device camera via the browser MediaDevices API.
- Capture in low resolution to optimise for quantity and processing speed.
- Sequential photo capture with a simple shutter button.
- Photos stored in memory (no server upload).

### F2: Photo Tagging During Capture
- "Doorway" button — tags the current photo as a room boundary transition point.
- "Window" button — tags the current photo's location as a window.
- Tags are stored as metadata alongside each photo.
- Visual indicator showing how many photos have been taken and how many are tagged.

### F3: Scale Calibration
- After capture, the user selects a photo containing a tape measure.
- The user draws a line (two points) over a known length in the photo.
- The user enters the real-world measurement for that line (with unit selection: cm, m, inches, feet).
- This reference is used to scale the entire 3D reconstruction to real-world units.

### F4: Structure-from-Motion Reconstruction
- Classical computer vision pipeline running entirely in the browser via OpenCV.js.
- Feature detection across all captured photos.
- Feature matching between overlapping photo pairs.
- Camera pose estimation (relative positions and orientations of each photo).
- Sparse point cloud generation via triangulation.
- This is the computational core of the app — it takes the flat photos and produces 3D spatial data.

### F5: Room Geometry Extraction
- Process the point cloud into simplified planar geometry.
- Detect flat surfaces (walls, floors, ceilings) via plane fitting.
- Use doorway-tagged photos to segment the model into distinct rooms.
- Detect floor-level changes to identify stairs and multi-level connections.
- Map door and window tags onto the nearest detected wall surfaces.

### F6: Measurement Calculation
- Apply the user's scale calibration to all geometry.
- Calculate and store:
  - Wall lengths (each wall segment individually)
  - Room dimensions (width x depth for each room)
  - Ceiling heights (per room)
  - Door dimensions (width x height)
  - Window dimensions (width x height)
- Measurements displayed in the user's chosen unit.

### F7: 3D Wireframe Viewer
- Three.js scene rendering the room geometry as wireframe edges.
- Orbit controls (rotate, pan, zoom) via Three.js OrbitControls.
- Distinct visual styling for walls, floors, ceilings, doors, windows, and stairs.
- Measurement labels rendered in 3D space alongside the geometry.
- Clickable elements that show detailed measurements in a side panel.

### F8: 2D Floor Plan Viewer
- Top-down orthographic projection of each floor level.
- Floor switcher UI for multi-level spaces.
- Standard architectural conventions: walls as thick lines, doors as arcs/gaps, windows as parallel lines.
- Room dimension labels and wall length labels overlaid on the plan.

### F9: Manual Corrections
- After reconstruction, the user can:
  - Add missed doors or windows by clicking a wall location.
  - Remove incorrectly placed doors or windows.
  - Adjust room boundaries if the automatic segmentation is wrong.
- The model and measurements update in response to corrections.

---

## Edge Cases and Constraints

- **Insufficient photos**: If too few photos are taken or they don't overlap enough, feature matching will fail. The app should detect this and prompt the user to capture more photos of the problematic areas.
- **Scale reference missing**: If no scale calibration is done, measurements should be displayed as relative (arbitrary units) with a warning.
- **Single room**: The app should work fine with a single room (no doorway tags needed).
- **Browser performance**: SfM is computationally heavy. With low-res photos the load is manageable, but the app should show a progress indicator during reconstruction and remain responsive.
- **Camera permissions**: Handle the case where the user denies camera access — show a clear message explaining why the camera is needed.
- **No stairs**: Multi-level support is optional; the app must work for single-floor spaces too.

---

## Testing Strategy

- **Unit tests (Vitest)**: Test measurement calculations, scale calibration logic, data structures for rooms/walls/doors/windows, and tagging metadata handling.
- **Component tests (React Testing Library)**: Test UI components — camera controls, tag buttons, floor switcher, measurement display panels.
- **Integration tests**: Test the pipeline from photo metadata through to geometry extraction and measurement output using mock/fixture data (since real SfM is too heavy for unit tests).
- **Manual testing**: Camera capture, full SfM reconstruction, and 3D/2D viewer interaction will be tested manually during development.

---

## What "Done" Looks Like

A working proof-of-concept where:
1. The user can capture photos using their device camera within the app.
2. They can tag doorways and windows during capture.
3. They can calibrate scale by drawing a line on a tape measure photo.
4. The app reconstructs a 3D wireframe of the space from the photos.
5. The wireframe displays walls, floors, ceilings, doors, windows, and stairs.
6. Real-world measurements are shown on both the 3D view and the 2D floor plan.
7. The user can orbit the 3D model and switch floors in the 2D view.
8. Manual corrections (add/remove doors and windows) work.

It does not need to be pixel-perfect or handle every edge case gracefully — it's a hobby project demonstrating the concept end-to-end.
