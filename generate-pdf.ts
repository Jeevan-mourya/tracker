import fs from 'fs';
import path from 'path';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

async function generateManualPDF() {
  const pdfDoc = await PDFDocument.create();
  const timesRoman = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const timesBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  const timesItalic = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const courier = await pdfDoc.embedFont(StandardFonts.Courier);

  const PAGE_WIDTH = 612;
  const PAGE_HEIGHT = 792;
  const MARGIN = 45;
  const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

  let currentPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const checkPageBreak = (neededHeight: number) => {
    if (y - neededHeight < MARGIN + 25) {
      // Draw footer on current page
      drawFooter(currentPage);
      currentPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
      drawHeader(currentPage);
    }
  };

  const drawHeader = (page: any) => {
    page.drawText('Tracker Video Analysis & Modeling — Comprehensive User Manual', {
      x: MARGIN,
      y: PAGE_HEIGHT - 30,
      size: 8,
      font: helvetica,
      color: rgb(0.4, 0.4, 0.4),
    });
    page.drawLine({
      start: { x: MARGIN, y: PAGE_HEIGHT - 34 },
      end: { x: PAGE_WIDTH - MARGIN, y: PAGE_HEIGHT - 34 },
      thickness: 0.5,
      color: rgb(0.7, 0.7, 0.7),
    });
  };

  const drawFooter = (page: any) => {
    const pageNum = pdfDoc.getPageCount();
    page.drawLine({
      start: { x: MARGIN, y: 36 },
      end: { x: PAGE_WIDTH - MARGIN, y: 36 },
      thickness: 0.5,
      color: rgb(0.7, 0.7, 0.7),
    });
    page.drawText(`Open Source Physics (OSP) Kinematics Suite   |   Page ${pageNum}`, {
      x: MARGIN,
      y: 25,
      size: 8,
      font: helvetica,
      color: rgb(0.4, 0.4, 0.4),
    });
  };

  const addTitle = (title: string, subtitle: string) => {
    // Title background box
    currentPage.drawRectangle({
      x: MARGIN,
      y: y - 72,
      width: CONTENT_WIDTH,
      height: 72,
      color: rgb(0.12, 0.23, 0.37), // classic desktop navy #1E3A5F
    });

    currentPage.drawText(title, {
      x: MARGIN + 14,
      y: y - 30,
      size: 19,
      font: helveticaBold,
      color: rgb(1, 1, 1),
    });

    currentPage.drawText(subtitle, {
      x: MARGIN + 14,
      y: y - 54,
      size: 10,
      font: helvetica,
      color: rgb(0.9, 0.92, 0.95),
    });

    y -= 88;
  };

  const addHeading1 = (text: string) => {
    checkPageBreak(38);
    y -= 10;
    // Gray accent line
    currentPage.drawRectangle({
      x: MARGIN,
      y: y - 18,
      width: CONTENT_WIDTH,
      height: 20,
      color: rgb(0.9, 0.9, 0.9),
    });
    currentPage.drawText(text, {
      x: MARGIN + 6,
      y: y - 14,
      size: 12,
      font: helveticaBold,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= 26;
  };

  const addHeading2 = (text: string) => {
    checkPageBreak(26);
    y -= 6;
    currentPage.drawText(text, {
      x: MARGIN,
      y,
      size: 10.5,
      font: helveticaBold,
      color: rgb(0.12, 0.23, 0.37),
    });
    y -= 15;
  };

  const addParagraph = (text: string, isItalic = false) => {
    const font = isItalic ? timesItalic : timesRoman;
    const fontSize = 9.5;
    const lineHeight = 13;
    const words = text.split(' ');
    let line = '';

    for (let i = 0; i < words.length; i++) {
      const testLine = line ? `${line} ${words[i]}` : words[i];
      const testWidth = font.widthOfTextAtSize(testLine, fontSize);
      if (testWidth > CONTENT_WIDTH && line) {
        checkPageBreak(lineHeight);
        currentPage.drawText(line, {
          x: MARGIN,
          y,
          size: fontSize,
          font,
          color: rgb(0.15, 0.15, 0.15),
        });
        y -= lineHeight;
        line = words[i];
      } else {
        line = testLine;
      }
    }
    if (line) {
      checkPageBreak(lineHeight);
      currentPage.drawText(line, {
        x: MARGIN,
        y,
        size: fontSize,
        font,
        color: rgb(0.15, 0.15, 0.15),
      });
      y -= lineHeight;
    }
    y -= 4; // paragraph spacing
  };

  const addBullet = (title: string, desc: string) => {
    const boldWidth = timesBold.widthOfTextAtSize(`• ${title}: `, 9.5);
    const fullText = `• ${title}: ${desc}`;
    const words = desc.split(' ');
    const fontSize = 9.5;
    const lineHeight = 13;

    checkPageBreak(lineHeight);
    currentPage.drawText(`• ${title}: `, {
      x: MARGIN + 8,
      y,
      size: fontSize,
      font: timesBold,
      color: rgb(0.1, 0.1, 0.1),
    });

    let currentX = MARGIN + 8 + boldWidth;
    let line = '';

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const testLine = line ? `${line} ${word}` : word;
      const testWidth = timesRoman.widthOfTextAtSize(testLine, fontSize);

      if (currentX + testWidth > PAGE_WIDTH - MARGIN) {
        if (line) {
          currentPage.drawText(line, {
            x: currentX,
            y,
            size: fontSize,
            font: timesRoman,
            color: rgb(0.15, 0.15, 0.15),
          });
          y -= lineHeight;
          checkPageBreak(lineHeight);
          currentX = MARGIN + 20;
          line = word;
        } else {
          currentPage.drawText(word, {
            x: currentX,
            y,
            size: fontSize,
            font: timesRoman,
            color: rgb(0.15, 0.15, 0.15),
          });
          y -= lineHeight;
          checkPageBreak(lineHeight);
          currentX = MARGIN + 20;
          line = '';
        }
      } else {
        line = testLine;
      }
    }

    if (line) {
      currentPage.drawText(line, {
        x: currentX,
        y,
        size: fontSize,
        font: timesRoman,
        color: rgb(0.15, 0.15, 0.15),
      });
      y -= lineHeight;
    }
    y -= 2;
  };

  const addCodeBox = (codeLines: string[]) => {
    const boxHeight = codeLines.length * 12 + 10;
    checkPageBreak(boxHeight + 8);
    currentPage.drawRectangle({
      x: MARGIN,
      y: y - boxHeight + 4,
      width: CONTENT_WIDTH,
      height: boxHeight,
      color: rgb(0.96, 0.96, 0.96),
      borderColor: rgb(0.75, 0.75, 0.75),
      borderWidth: 0.8,
    });
    let codeY = y - 8;
    for (const cl of codeLines) {
      currentPage.drawText(cl, {
        x: MARGIN + 8,
        y: codeY,
        size: 8,
        font: courier,
        color: rgb(0.1, 0.1, 0.1),
      });
      codeY -= 12;
    }
    y -= boxHeight + 6;
  };

  const addTable = (headers: string[], rows: string[][], colWidths: number[]) => {
    const rowHeight = 16;
    const tableHeight = (rows.length + 1) * rowHeight;
    checkPageBreak(tableHeight + 10);

    // Header background
    currentPage.drawRectangle({
      x: MARGIN,
      y: y - rowHeight + 2,
      width: CONTENT_WIDTH,
      height: rowHeight,
      color: rgb(0.85, 0.85, 0.85),
      borderColor: rgb(0.5, 0.5, 0.5),
      borderWidth: 0.5,
    });

    // Draw header text
    let curX = MARGIN + 4;
    headers.forEach((h, idx) => {
      currentPage.drawText(h, {
        x: curX,
        y: y - rowHeight + 6,
        size: 8,
        font: helveticaBold,
        color: rgb(0.1, 0.1, 0.1),
      });
      curX += colWidths[idx];
    });

    y -= rowHeight;

    // Draw rows
    rows.forEach((r, rIdx) => {
      checkPageBreak(rowHeight);
      const isAlt = rIdx % 2 === 1;
      currentPage.drawRectangle({
        x: MARGIN,
        y: y - rowHeight + 2,
        width: CONTENT_WIDTH,
        height: rowHeight,
        color: isAlt ? rgb(0.97, 0.97, 0.97) : rgb(1, 1, 1),
        borderColor: rgb(0.8, 0.8, 0.8),
        borderWidth: 0.4,
      });

      let rX = MARGIN + 4;
      r.forEach((cell, cIdx) => {
        currentPage.drawText(cell, {
          x: rX,
          y: y - rowHeight + 6,
          size: 7.8,
          font: helvetica,
          color: rgb(0.15, 0.15, 0.15),
        });
        rX += colWidths[cIdx];
      });
      y -= rowHeight;
    });

    y -= 6;
  };

  // ==========================================
  // DOCUMENT GENERATION
  // ==========================================

  // Document Title
  addTitle(
    'Tracker Video Analysis & Modeling',
    'Comprehensive User Manual & Physical Kinematics Reference Guide'
  );

  // Section 1: Overview
  addHeading1('1. System Overview & Core Architecture');
  addParagraph(
    'Tracker is a computer-vision video analysis and physical modeling suite built for physics students, educators, and researchers. The workstation provides precision measurement tools to extract quantitative time-series data from real-world digital video recordings or synthetic physics simulations.'
  );
  addParagraph(
    'The system incorporates sub-pixel point digitization, interactive coordinate transformations, numerical finite-difference kinematics, energy analysis, mathematical regression curve fitting, and a full 3D stereo reconstruction engine with an interactive spatial orbit viewer.'
  );

  // Section 2: Complete UI Directory
  addHeading1('2. Complete Interface Directory & Control Map');
  addParagraph(
    'Every control, input, and instrument across the desktop interface is mapped below according to its primary functional zone:'
  );

  addHeading2('A. Desktop Header & File Bar (Zone 1)');
  addTable(
    ['Control / ID', 'Element Type', 'Function & Scientific Purpose'],
    [
      ['Experiment Selector', 'Dropdown', 'Loads preset experiments (Projectile, 3D Helical, Pendulum, Free Fall, Incline).'],
      ['Open Video (btn-upload-video)', 'Button (Upload)', 'Imports local MP4, WebM, or MOV video files for analysis.'],
      ['Export CSV (btn-export-csv)', 'Button (Download)', 'Exports full kinematic table as standard comma-separated values (.csv).'],
      ['Export Project (btn-export-trk)', 'Button (FolderOpen)', 'Serializes entire workspace (tracks, points, calibration, axes) into .trk project.'],
      ['Help Guide (btn-help-guide)', 'Button (HelpCircle)', 'Opens the built-in quick guide modal with physics reminders.']
    ],
    [130, 85, 307]
  );

  addHeading2('B. Scientific Toolbar Instruments (Zone 2)');
  addTable(
    ['Toolbar Tool / ID', 'Icon & Type', 'Functional Behavior'],
    [
      ['Track Selector', 'Dropdown', 'Switches active particle (e.g. Mass A, Cart 1) and displays point count.'],
      ['Track Manager (btn-track-manager)', 'Settings2', 'Configures mass (kg), point footprint (circle/diamond/square), and colors.'],
      ['Clear Points (btn-clear-track-points)', 'Trash2', 'Clears digitized coordinates for active particle without deleting calibration.'],
      ['Clip Cuts (btn-video-cuts)', 'Scissors', 'Opens timing dialog: Start/End Frame, Step Size, Frame Rate (FPS), t0.'],
      ['Axes Toggle (btn-toggle-axes)', 'Compass', 'Toggles Cartesian coordinate frame (0, 0) and axis directions on canvas.'],
      ['Axes Angle (axes-angle-quick-input)', 'Number Input', 'Rotates coordinate frame by theta degrees for inclined planes or tilted rigs.'],
      ['Grid Toggle (btn-toggle-grid)', 'Grid', 'Overlays metric Cartesian grid lines over the video frame.'],
      ['2D Calibration Stick', 'Ruler', 'Toggles blue 2-point reference ruler for pixel-to-meter scaling.'],
      ['Calibration Settings', 'Sliders', 'Sets known physical length (m, cm, mm, ft) for the calibration stick.'],
      ['3D Calibration (btn-3d-triangulation)', 'Sliders', 'Opens 3D Stereo Triangulation modal when in 3D Stereo mode.'],
      ['Trails / Vectors / Loupe', 'Toggle Group', 'Toggles trajectory paths, velocity/accel arrows, and 3.5x magnifier.'],
      ['Auto-step (btn-toggle-auto-advance)', 'FastForward', 'Automatically steps video forward by stepSize after marking a point.'],
      ['2D / 3D Mode Switcher', 'Segmented', 'Switches between single-camera 2D and dual-camera 3D Stereo mode.'],
      ['Layout Presets', 'Button Group', 'Switches view: Split, Graphs, Table, Video, Dual+3D, and 3D Orbit.']
    ],
    [140, 75, 307]
  );

  addHeading2('C. Transport Control Bar & Timeline Scrubber (Zone 5)');
  addTable(
    ['Control / ID', 'Icon / Type', 'Operational Description'],
    [
      ['Frame Input (direct-frame-input)', 'Number Field', 'Direct numeric jump to any target frame index.'],
      ['Timeline Slider (video-frame-slider)', 'Range Scrubber', 'Continuous scrub bar displaying vertical tick marks for marked frames.'],
      ['Time Readout', 'Monospace', 'Displays time t = (frame - startFrame) / FPS to 3 decimal places.'],
      ['Jump to Start (btn-first-frame)', 'SkipBack', 'Rewinds playback to the defined clip start frame.'],
      ['Step Backward (btn-prev-frame)', 'ChevronLeft', 'Steps back by one stepSize frame increment.'],
      ['Play / Pause (btn-play-pause)', 'Play/Pause', 'Toggles continuous playback. Keyboard shortcut: Spacebar.'],
      ['Step Forward (btn-next-frame)', 'ChevronRight', 'Advances forward by one stepSize frame increment.'],
      ['Jump to End (btn-last-frame)', 'SkipForward', 'Fast-forwards to the defined clip end frame.'],
      ['Loop Toggle (btn-toggle-loop)', 'Repeat', 'Repeats playback automatically upon reaching the end frame.'],
      ['Delete Mark (btn-delete-frame-point)', 'Trash', 'Removes the digitized point recorded at the current frame.'],
      ['Playback Rate (playback-rate-select)', 'Dropdown', 'Selects playback speed (0.1x, 0.25x, 0.5x, 1.0x) for high-speed video.']
    ],
    [140, 75, 307]
  );

  // Section 3: Calibration Methods
  addHeading1('3. Calibration Methods & Coordinate Systems');
  addHeading2('A. Standard 2D Calibration Stick Process');
  addParagraph(
    'The 2D calibration stick establishes the linear scale factor S (pixels per meter) connecting video image space to real-world metric space. The pixel span between reference endpoints A(u_A, v_A) and B(u_B, v_B) is computed as:'
  );
  addCodeBox([
    'Pixel Span:   d_px = sqrt((u_B - u_A)^2 + (v_B - v_A)^2)',
    'Scale Factor: S = d_px / L_known   [pixels / meter]',
    'World X:      x = (u - u_origin) / S   (rotated by theta)',
    'World Y:      y = (v_origin - v) / S   (rotated by theta)'
  ]);
  addBullet('Step 1', 'Ensure camera optical axis was perpendicular to motion plane during capture.');
  addBullet('Step 2', 'Enable Calibration Stick on toolbar to display the blue reference bar.');
  addBullet('Step 3', 'Drag Point A and Point B end-caps across known object (e.g. 1.0 m stick).');
  addBullet('Step 4', 'Open Calibration Settings modal, enter known distance, choose units (m, cm, ft).');
  addBullet('Step 5', 'Click Apply Scale. All existing and future marks recalculate instantly.');

  addHeading2('B. 3D Stereo Calibration & Camera Matrix Configuration');
  addParagraph(
    'To resolve true 3D coordinates (X, Y, Z), Tracker incorporates two synchronized camera viewports with four selectable triangulation geometries:'
  );
  addBullet('Orthogonal Front-Side', 'Camera 1 captures Front (X, Y); Camera 2 captures Side (Z, Y). Both share the vertical Y axis.');
  addBullet('Orthogonal Front-Top', 'Camera 1 captures Front (X, Y); Camera 2 captures Overhead (X, Z). Both share the horizontal X axis.');
  addBullet('Convergent Stereo', 'Dual angled cameras separated by baseline distance B and tilted by convergence angle beta.');
  addBullet('Direct Linear Transformation (DLT-11)', 'Maps 3D object space to camera pixels via 11 empirical camera calibration parameters [L1..L11].');

  addCodeBox([
    'DLT Forward Mapping (for each camera):',
    'u = (L1*X + L2*Y + L3*Z + L4) / (L9*X + L10*Y + L11*Z + 1)',
    'v = (L5*X + L6*Y + L7*Z + L8) / (L9*X + L10*Y + L11*Z + 1)',
    'Triangulation solves least-squares ray intersection: [A]^T [A] [X, Y, Z]^T = [A]^T [B]',
    'Reprojection Residual indicates spatial error (typically < 2.0 mm).'
  ]);

  // Section 4: Tracking Modes
  addHeading1('4. Tracking Modes: Manual vs. Automated');
  addParagraph(
    'Tracker offers two complementary tracking paradigms depending on video quality, target contrast, and occlusion conditions:'
  );
  addTable(
    ['Feature Dimension', 'Manual Frame-by-Frame Digitizing', 'Automated Optical Tracker'],
    [
      ['Primary Use Case', 'Occluded, irregular, rotating, or low-contrast targets', 'High-contrast markers, solid balls, clean backgrounds'],
      ['Sub-Pixel Inspection', '3.5x Magnifier Loupe with reticle crosshair', 'Sub-pixel centroid template matching'],
      ['Operator Interaction', 'Click target center of mass on each frame', 'Capture initial template, batch process sequence'],
      ['Operational Speed', '1 to 2 seconds per frame', 'Real-time multi-frame batch extraction'],
      ['Error Handling', 'Operator drags mark to refine position anytime', 'Pauses on low cross-correlation confidence threshold']
    ],
    [110, 205, 207]
  );

  addHeading2('Manual Tracking Step-by-Step Workflow:');
  addBullet('1. Enable Auto-step', 'Ensure Auto-step is highlighted on the toolbar.');
  addBullet('2. Activate Loupe', 'Toggle Loupe to inspect the cursor area at 3.5x magnification with sub-pixel crosshairs.');
  addBullet('3. Position & Click', 'Click directly on the moving object centroid. World coordinates (x, y) record and the video advances automatically.');
  addBullet('4. Coordinate Adjustment', 'If a point is slightly off-center, scrub back and drag the point marker to the correct location.');

  addHeading2('Auto-Tracker Step-by-Step Workflow:');
  addBullet('1. Select Start Frame', 'Navigate to the frame where the target is distinct and clear.');
  addBullet('2. Capture Template', 'Click to place initial point. The tracker memorizes a target pixel patch around the centroid.');
  addBullet('3. Search Window', 'The optical correlation engine searches neighboring pixels on subsequent frames.');
  addBullet('4. Supervised Review', 'If target lighting shifts or cross-correlation drops, manually correct the point to resume.');

  // Section 5: Kinematics Engine
  addHeading1('5. Mathematical Kinematics & Energy Formulations');
  addParagraph(
    'Derivatives are calculated using central finite differences to avoid phase lag inherent in forward or backward differences:'
  );
  addCodeBox([
    'Internal Points (Central Difference):',
    'vx(t_i) = [x(i+1) - x(i-1)] / [t(i+1) - t(i-1)]',
    'vy(t_i) = [y(i+1) - y(i-1)] / [t(i+1) - t(i-1)]',
    'vz(t_i) = [z(i+1) - z(i-1)] / [t(i+1) - t(i-1)]',
    '',
    'Speed Magnitude:       v = sqrt(vx^2 + vy^2 + vz^2)',
    'Acceleration:          ax(t_i) = [vx(i+1) - vx(i-1)] / [t(i+1) - t(i-1)]',
    'Total Acceleration:    a = sqrt(ax^2 + ay^2 + az^2)',
    '',
    'Kinetic Energy:        KE = 0.5 * m * v^2',
    'Potential Energy:      PE = m * g * y   (where g = 9.80665 m/s^2)',
    'Total Mechanical:      E_total = KE + PE'
  ]);

  // Section 6: Step-by-Step Tutorials
  addHeading1('6. Step-by-Step Laboratory Workflows');

  addHeading2('Tutorial 1: Standard 2D Projectile Motion & Gravity Extraction');
  addBullet('Step 1: Video & Range', 'Select "Projectile Motion" from the Experiment menu. Click Clip Cuts to confirm Start Frame, End Frame, and 30 FPS.');
  addBullet('Step 2: Coordinate Setup', 'Click Axes. Drag (0, 0) origin to ball launch position. Toggle Calib Stick, drag across 1.0 m reference, click Apply Scale.');
  addBullet('Step 3: Point Digitizing', 'Turn on Auto-step and Loupe. Click ball center on each frame until impact. Observe real-time trajectory trails and velocity vectors.');
  addBullet('Step 4: Gravitational Fit', 'Switch to Plot View. Set Y = y (Vertical Position), X = t (s). Select Parabolic fit (y = A*t^2 + B*t + C).');
  addBullet('Step 5: Gravity Calculation', 'From theoretical y(t) = 0.5*g*t^2 + v0*t + y0, calculate g_exp = 2 * |A|. Expected: ~9.81 m/s^2 with R^2 > 0.99.');
  addBullet('Step 6: Data Export', 'Click CSV in header to export the dataset or Project to save a .trk session file.');

  addHeading2('Tutorial 2: Full 3D Stereo Triangulation Experiment');
  addBullet('Step 1: Stereo Mode', 'Switch toolbar mode from 2D to 3D Stereo. Switch Layout to Dual+3D.');
  addBullet('Step 2: Camera Calibration', 'Open 3D Calibration. Set method to Orthogonal Front-Side (90°). Verify scale factors and baseline distance.');
  addBullet('Step 3: Dual Digitization', 'On each frame, click the object in Camera 1 (Front), then click the object in Camera 2 (Side). The 3D engine computes (X, Y, Z).');
  addBullet('Step 4: 3D Spatial Orbit', 'In the 3D Orbit Viewport, drag to rotate yaw/pitch around the 3D trajectory. Use presets (Front, Top, Side, Isometric).');
  addBullet('Step 5: Tabular Verification', 'Open TableView. Verify calculated columns for z (m), vz (m/s), and az (m/s²).');

  // Section 7: FAQ
  addHeading1('7. Troubleshooting & Laboratory FAQ');
  addBullet('Missing Initial Vectors', 'Central difference derivatives require neighboring points (i-1 and i+1). Digitize at least 3 frames for velocity and 5 for acceleration.');
  addBullet('Parabolic Coefficient g/2', 'Remember that in y = A*t^2 + B*t + C, A represents 0.5*a. You must multiply coefficient A by 2 to compute gravitational acceleration g.');
  addBullet('Slow-Motion Video FPS', 'If analyzing high-speed video (e.g. 240 fps), open Clip Cuts and set Frame Rate to 240. Otherwise, time steps will be calculated at standard 30 fps.');
  addBullet('Reprojection Residuals', 'A triangulation residual under 2.0 mm indicates accurate camera calibration and point marking. Higher values suggest optical miscalibration.');

  // Final page footer
  drawFooter(currentPage);

  const pdfBytes = await pdfDoc.save();
  const outputPath = path.join(process.cwd(), 'public', 'Tracker_Video_Analysis_User_Manual.pdf');
  fs.writeFileSync(outputPath, pdfBytes);
  console.log(`PDF successfully generated at: ${outputPath} (${pdfBytes.length} bytes)`);
}

generateManualPDF().catch(console.error);
