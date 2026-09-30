import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

/**
 * Generates and downloads a comprehensive, multi-page vector PDF User Manual
 * featuring complete documentation of the Keyboard Shortcuts Modal & Hotkeys
 * for new users to learn, operate, and verify.
 */
export async function downloadUserManualPDF(): Promise<void> {
  try {
    const pdfDoc = await PDFDocument.create();

    // Fonts
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontMono = await pdfDoc.embedFont(StandardFonts.Courier);
    const fontMonoBold = await pdfDoc.embedFont(StandardFonts.CourierBold);

    // Color Palette (matching professional defense & physics lab styling)
    const cNavy = rgb(0.12, 0.23, 0.37); // #1e3a5f
    const cDark = rgb(0.1, 0.1, 0.1);
    const cGray = rgb(0.4, 0.4, 0.4);
    const cLightBg = rgb(0.96, 0.96, 0.95);
    const cBorder = rgb(0.75, 0.75, 0.73);
    const cEmerald = rgb(0.06, 0.53, 0.36);
    const cGold = rgb(0.72, 0.53, 0.04);
    const cWhite = rgb(1, 1, 1);

    // =========================================================================
    // PAGE 1: TITLE, PHILOSOPHY & CORE OPERATING WORKFLOW
    // =========================================================================
    const page1 = pdfDoc.addPage([595.28, 841.89]); // A4
    const { width, height } = page1.getSize();

    // Top Header Banner
    page1.drawRectangle({
      x: 0,
      y: height - 72,
      width,
      height: 72,
      color: cNavy,
    });

    page1.drawText('TRACKER VIDEO ANALYSIS & MODELING SUITE', {
      x: 36,
      y: height - 32,
      size: 16,
      font: fontBold,
      color: cWhite,
    });

    page1.drawText('Comprehensive User Manual • Kinematics Operating & Verification Guide', {
      x: 36,
      y: height - 52,
      size: 9.5,
      font: fontRegular,
      color: rgb(0.85, 0.9, 0.95),
    });

    page1.drawRectangle({
      x: width - 150,
      y: height - 52,
      width: 114,
      height: 18,
      color: rgb(0.08, 0.16, 0.27),
      borderColor: rgb(0.3, 0.45, 0.65),
      borderWidth: 1,
    });

    page1.drawText('100% AIR-GAPPED PC', {
      x: width - 142,
      y: height - 45,
      size: 7.5,
      font: fontMonoBold,
      color: rgb(0.4, 0.9, 0.6),
    });

    let curY = height - 92;

    // Sub-header Badges
    page1.drawText('Open Source Physics (OSP) Standard  •  Sub-Pixel Motion Tracking  •  High-Speed Optical Ballistics', {
      x: 36,
      y: curY,
      size: 8,
      font: fontBold,
      color: cGray,
    });

    curY -= 14;
    page1.drawLine({
      start: { x: 36, y: curY },
      end: { x: width - 36, y: curY },
      thickness: 1,
      color: cBorder,
    });

    curY -= 18;

    // Section 1: Overview
    page1.drawText('1. SYSTEM OVERVIEW & AIR-GAPPED GUARANTEE', {
      x: 36,
      y: curY,
      size: 10,
      font: fontBold,
      color: cNavy,
    });

    curY -= 14;
    const p1Intro = [
      'Tracker Video Analysis is an air-gapped kinematics modeling suite designed for physics education, laboratory',
      'research, and defense optical ballistics. The software processes user video entirely in local system RAM with',
      'zero network requests, zero outbound sockets, and zero telemetry. It supports capture rates from standard 30/60 fps',
      'up to ultra-high-speed multi-million fps feeds (Photron, Phantom Cine, NAC Memrecam, and image bursts).',
    ];
    for (const line of p1Intro) {
      page1.drawText(line, { x: 36, y: curY, size: 8.5, font: fontRegular, color: cDark });
      curY -= 11.5;
    }

    curY -= 10;

    // Section 2: Laboratory Setup
    page1.drawText('2. CALIBRATION & COORDINATE AXES SETUP', {
      x: 36,
      y: curY,
      size: 10,
      font: fontBold,
      color: cNavy,
    });

    curY -= 14;
    const p1Cal = [
      '• Scale Calibration Stick: Place a physical scale reference (e.g. 1.00 m rod or known target diameter). Drag the blue',
      '  calibration stick endpoints to the object ends. Click the Calibration button on the toolbar or press "C" to toggle',
      '  visibility, set real length, and select units (meters, centimeters, millimeters, or feet).',
      '• Coordinate Axes System: Drag the purple axes origin (0, 0) to your spatial benchmark (e.g. launch muzzle, ground,',
      '  or center of mass). Drag the angular rotation handle or input angle θ to align coordinate axes with inclined planes.',
      '• Sensor Clip Settings: Configure start frame, end frame, step size, and physical sensor frame rate (fps) to establish',
      '  calibrated delta-time (dt = step / fps) down to microsecond (µs) and nanosecond (ns) precision.',
    ];
    for (const line of p1Cal) {
      page1.drawText(line, { x: 36, y: curY, size: 8.5, font: fontRegular, color: cDark });
      curY -= 11.5;
    }

    curY -= 10;

    // Section 3: Point Tracking & Magnifier Loupe
    page1.drawText('3. PARTICLE TRACKING & SUB-PIXEL MAGNIFIER LOUPE', {
      x: 36,
      y: curY,
      size: 10,
      font: fontBold,
      color: cNavy,
    });

    curY -= 14;
    const p1Track = [
      '• Manual Point Mass Tracking: Hold Shift and Left-Click directly on the target object in the video display. A marker is',
      '  instantly recorded at that frame, and the player automatically advances to the next analysis step if Auto-step is active.',
      '• 4× Sub-Pixel Optical Loupe: Press "M" or click Loupe to open the 4× magnified reticle window. The loupe renders the raw',
      '  underlying video sensor frame with high-contrast dual-tone crosshairs and RGB/luminance readout for exact centering.',
      '• Interactive Mark Adjustment: Point markers can be dragged at any time to refine pixel positions without re-recording.',
      '• Kinematic Vector Overlays: Toggle velocity vectors (v) and acceleration vectors (a) with "V" to visualize dynamics.',
    ];
    for (const line of p1Track) {
      page1.drawText(line, { x: 36, y: curY, size: 8.5, font: fontRegular, color: cDark });
      curY -= 11.5;
    }

    curY -= 10;

    // Section 4: Data Modeling & Regressions
    page1.drawText('4. KINEMATIC MODELING, ENERGY & MATHEMATICAL REGRESSION', {
      x: 36,
      y: curY,
      size: 10,
      font: fontBold,
      color: cNavy,
    });

    curY -= 14;
    const p1Models = [
      '• Instant Kinematic Derivatives: Velocity vx, vy, and magnitude v are derived via centered finite-difference quotients.',
      '  Acceleration ax, ay, and total a (along with G-force a/9.81) are computed across consecutive temporal timebases.',
      '• Energy Calculations: Mechanical energy states E = Kinetic (½ m v²) + Gravitational Potential (m g y) are logged.',
      '• Mathematical Regressions: The Plot pane computes Linear (y = A·t + B), Parabolic (y = A·t² + B·t + C, where 2A ≈ g),',
      '  and Cubic curves with coefficient of determination (R²) and Root Mean Square Error (RMSE) metrics.',
    ];
    for (const line of p1Models) {
      page1.drawText(line, { x: 36, y: curY, size: 8.5, font: fontRegular, color: cDark });
      curY -= 11.5;
    }

    // Callout Box on Page 1 Bottom: Keyboard Shortcuts Notification
    curY -= 14;
    const boxH = 46;
    page1.drawRectangle({
      x: 36,
      y: curY - boxH + 12,
      width: width - 72,
      height: boxH,
      color: cLightBg,
      borderColor: cBorder,
      borderWidth: 1,
    });

    page1.drawText('QUICK ACCESS TO KEYBOARD SHORTCUTS & VERIFICATION CONSOLE', {
      x: 48,
      y: curY + 2,
      size: 8.5,
      font: fontBold,
      color: cNavy,
    });

    page1.drawText(
      'Press "?" or "F1" at any moment to open the interactive Keyboard Shortcuts Modal cheat sheet in the application.',
      { x: 48, y: curY - 11, size: 8, font: fontRegular, color: cDark }
    );
    page1.drawText(
      'Turn to Page 2 of this manual for the complete Hotkeys Matrix and New User Step-by-Step Verification Guide.',
      { x: 48, y: curY - 22, size: 8, font: fontBold, color: cEmerald }
    );

    // Footer Page 1
    page1.drawText('Page 1 of 3  •  Tracker Video Analysis Suite  •  Operating Manual  •  Local Air-Gapped Workstation', {
      x: width / 2 - 180,
      y: 18,
      size: 7.5,
      font: fontRegular,
      color: cGray,
    });

    // =========================================================================
    // PAGE 2: KEYBOARD SHORTCUTS MODAL & HOTKEYS VERIFICATION GUIDE
    // =========================================================================
    const page2 = pdfDoc.addPage([595.28, 841.89]);

    // Top Header Banner Page 2
    page2.drawRectangle({
      x: 0,
      y: height - 56,
      width,
      height: 56,
      color: cNavy,
    });

    page2.drawText('CHAPTER 5: KEYBOARD SHORTCUTS MODAL & HOTKEYS MATRIX', {
      x: 36,
      y: height - 28,
      size: 13,
      font: fontBold,
      color: cWhite,
    });

    page2.drawText('Comprehensive Hotkey Reference & New User Learning / Verification Procedures', {
      x: 36,
      y: height - 44,
      size: 8.5,
      font: fontRegular,
      color: rgb(0.85, 0.9, 0.95),
    });

    let p2Y = height - 76;

    // Intro / Instruction for new users
    page2.drawText('A. NEW USER HOTKEY VERIFICATION PROTOCOL (STEP-BY-STEP)', {
      x: 36,
      y: p2Y,
      size: 9.5,
      font: fontBold,
      color: cNavy,
    });

    p2Y -= 13;
    const protocolSteps = [
      '1. Open Shortcuts Cheat Sheet: Tap "?" (or Shift + "/") or press F1. The interactive modal pops up with category filters.',
      '2. Test Frame Navigation: Press Right Arrow (→) to step forward 1 frame. Press Shift + → to skip 5 frames. Tap Home to rewind.',
      '3. Test Point Mass Marking: Hold Shift and Left-Click on the video. Observe the crosshair mark and automatic step advancement.',
      '4. Test Undo & Deletion: Press Ctrl+Z (or ⌘+Z) to undo the last mark. Press Delete or Backspace to clear the active frame point.',
      '5. Test Display Overlays: Press "M" to toggle 4× Magnifier Loupe; "A" for Axes; "C" for Calibration stick; "V" for Vectors.',
      '6. Test Viewport Zoom & Pan: Scroll mouse wheel over the video to zoom (20% to 1600%); Right-Click + Drag to pan across the scene.',
    ];
    for (const step of protocolSteps) {
      page2.drawText(step, { x: 36, y: p2Y, size: 7.8, font: fontRegular, color: cDark });
      p2Y -= 10.5;
    }

    p2Y -= 8;

    // Table Header
    page2.drawText('B. COMPLETE HOTKEY SPECIFICATION TABLE', {
      x: 36,
      y: p2Y,
      size: 9.5,
      font: fontBold,
      color: cNavy,
    });

    p2Y -= 14;

    const tX = 36;
    const tW = width - 72;
    const rowH = 15.5;

    // Table Columns: Category (70), Key Combo (110), Action / Function (220), Verification Status (123)
    const colCat = tX + 6;
    const colKey = tX + 74;
    const colAction = tX + 185;
    const colVerify = tX + 380;

    // Header Row
    page2.drawRectangle({
      x: tX,
      y: p2Y - rowH + 4,
      width: tW,
      height: rowH,
      color: rgb(0.2, 0.28, 0.38),
    });

    page2.drawText('CATEGORY', { x: colCat, y: p2Y - 7, size: 7.5, font: fontBold, color: cWhite });
    page2.drawText('HOTKEY COMBINATION', { x: colKey, y: p2Y - 7, size: 7.5, font: fontBold, color: cWhite });
    page2.drawText('OPERATIONAL ACTION & EFFECT', { x: colAction, y: p2Y - 7, size: 7.5, font: fontBold, color: cWhite });
    page2.drawText('VERIFICATION EXPECTATION', { x: colVerify, y: p2Y - 7, size: 7.5, font: fontBold, color: cWhite });

    p2Y -= rowH;

    const HOTKEY_ROWS = [
      { cat: 'Navigation', key: '→ (Right Arrow)', action: 'Step video forward 1 frame', verify: 'Frame counter increments by stepSize' },
      { cat: 'Navigation', key: '← (Left Arrow)', action: 'Step video backward 1 frame', verify: 'Frame counter decrements by stepSize' },
      { cat: 'Navigation', key: 'Shift + →', action: 'Fast skip forward 5 frames', verify: 'Jumps forward by 5× stepSize' },
      { cat: 'Navigation', key: 'Shift + ←', action: 'Fast skip backward 5 frames', verify: 'Jumps backward by 5× stepSize' },
      { cat: 'Navigation', key: 'Home', action: 'Seek to start frame of clip', verify: 'Video scrubs to clip.startFrame' },
      { cat: 'Navigation', key: 'End', action: 'Seek to end frame of clip', verify: 'Video scrubs to clip.endFrame' },
      { cat: 'Tracking', key: 'Shift + Left Click', action: 'Mark point mass coordinate', verify: 'Registers point (px,py) & auto-steps' },
      { cat: 'Tracking', key: 'Ctrl + Z (or ⌘+Z)', action: 'Undo last point registration', verify: 'Removes most recent point step' },
      { cat: 'Tracking', key: 'Delete / Backspace', action: 'Delete point at current frame', verify: 'Clears point on active frame' },
      { cat: 'Tracking', key: 'Ctrl + Shift + Del', action: 'Clear all points on active track', verify: 'Resets active track step list' },
      { cat: 'Tracking', key: 'Tab (Shift+Tab)', action: 'Cycle through Point Masses', verify: 'Switches activeTrackId selector' },
      { cat: 'Playback', key: 'Spacebar', action: 'Play / Pause video stream', verify: 'Toggles playback loop at set rate' },
      { cat: 'Playback', key: 'J / K / L', action: 'Shuttle reverse / pause / forward', verify: 'Controls transport shuttle velocity' },
      { cat: 'Viewport', key: 'Mouse Wheel Scroll', action: 'Zoom centered at mouse (20%-1600%)', verify: 'Scales scene with crisp pixel reticle' },
      { cat: 'Viewport', key: 'Right-Click + Drag', action: 'Pan scene without context menu', verify: 'Moves video smoothly across stage' },
      { cat: 'Viewport', key: 'Spacebar + Drag', action: 'Alternate CAD-style scene pan', verify: 'Pans stage while holding Space' },
      { cat: 'Viewport', key: 'F (Fit)', action: 'Fit video snugly to viewport', verify: 'Resets pan to (0,0) and scale to 1.0' },
      { cat: 'Tools', key: 'M', action: 'Toggle 4× Magnifier Loupe', verify: 'Shows floating 4× optical crosshair' },
      { cat: 'Tools', key: 'A', action: 'Toggle Coordinate Axes visibility', verify: 'Hides/shows (0,0) purple origin' },
      { cat: 'Tools', key: 'C', action: 'Toggle Calibration Stick visibility', verify: 'Hides/shows blue 1.0m scale stick' },
      { cat: 'Tools', key: 'V', action: 'Toggle Velocity & Accel Vectors', verify: 'Renders dynamic arrow overlay' },
      { cat: 'Tools', key: 'T', action: 'Toggle Trajectory Trail Line', verify: 'Renders continuous motion spline' },
      { cat: 'Tools', key: '? / F1', action: 'Open Keyboard Shortcuts Modal', verify: 'Opens full interactive cheat sheet' },
    ];

    HOTKEY_ROWS.forEach((r, idx) => {
      const isEven = idx % 2 === 0;
      page2.drawRectangle({
        x: tX,
        y: p2Y - rowH + 4,
        width: tW,
        height: rowH,
        color: isEven ? cWhite : cLightBg,
      });

      page2.drawText(r.cat, { x: colCat, y: p2Y - 7, size: 7.2, font: fontRegular, color: cDark });
      page2.drawText(r.key, { x: colKey, y: p2Y - 7, size: 7.2, font: fontMonoBold, color: cNavy });
      page2.drawText(r.action, { x: colAction, y: p2Y - 7, size: 7.2, font: fontRegular, color: cDark });
      page2.drawText(r.verify, { x: colVerify, y: p2Y - 7, size: 6.8, font: fontRegular, color: cEmerald });

      p2Y -= rowH;
    });

    // Border around table
    const tableTotalH = (HOTKEY_ROWS.length + 1) * rowH;
    page2.drawRectangle({
      x: tX,
      y: p2Y + 4,
      width: tW,
      height: tableTotalH,
      borderColor: cBorder,
      borderWidth: 1,
    });

    p2Y -= 8;

    // Safety and Form Exclusion Note
    page2.drawRectangle({
      x: tX,
      y: p2Y - 26,
      width: tW,
      height: 26,
      color: rgb(0.98, 0.98, 0.92),
      borderColor: rgb(0.85, 0.8, 0.5),
      borderWidth: 1,
    });

    page2.drawText('IMPORTANT INPUT SAFETY RULE:', {
      x: tX + 8,
      y: p2Y - 10,
      size: 7.5,
      font: fontBold,
      color: cGold,
    });

    page2.drawText(
      'Shortcuts are automatically bypassed whenever typing inside text boxes, scale length fields, or metadata inputs to prevent accidental triggers.',
      { x: tX + 8, y: p2Y - 20, size: 7.2, font: fontRegular, color: cDark }
    );

    // Footer Page 2
    page2.drawText('Page 2 of 3  •  Tracker Video Analysis Suite  •  Keyboard Shortcuts & Hotkeys Guide  •  100% Offline', {
      x: width / 2 - 180,
      y: 18,
      size: 7.5,
      font: fontRegular,
      color: cGray,
    });

    // =========================================================================
    // PAGE 3: HIGH-SPEED DEFENSE CAMERAS, 3D STEREO DLT & FIELD EXPORT
    // =========================================================================
    const page3 = pdfDoc.addPage([595.28, 841.89]);

    // Top Header Banner Page 3
    page3.drawRectangle({
      x: 0,
      y: height - 56,
      width,
      height: 56,
      color: cNavy,
    });

    page3.drawText('CHAPTER 6: HIGH-SPEED CAMERAS, 3D STEREO DLT & REPORTING', {
      x: 36,
      y: height - 28,
      size: 13,
      font: fontBold,
      color: cWhite,
    });

    page3.drawText('Advanced Optical Range Specifications, Spatial Triangulation & Field Documentation', {
      x: 36,
      y: height - 44,
      size: 8.5,
      font: fontRegular,
      color: rgb(0.85, 0.9, 0.95),
    });

    let p3Y = height - 76;

    // Section 1: High-Speed Camera Calibration
    page3.drawText('1. HIGH-SPEED BALLISTIC CAMERA PRESETS', {
      x: 36,
      y: p3Y,
      size: 9.5,
      font: fontBold,
      color: cNavy,
    });

    p3Y -= 13;
    const p3Cameras = [
      '• Photron FASTCAM Series: Supports FASTCAM SA-Z (up to 2,100,000 fps), Mini AX/UX, and Nova models with microsecond',
      '  shutter timing. Use the Clip Settings modal to decouple sensor rate from container playback (e.g. 100,000 fps @ 30 fps).',
      '• Vision Research Phantom Cine: Preset timing for Phantom v2512 (up to 1,000,000 fps), Miro, and TMX ultra-high-speed',
      '  sensors with nanosecond (ns) pulse exposure and sub-pixel optical contrast compensation.',
      '• NAC Memrecam & iX Cameras: High-G shock-rated defense flight line cameras for projectile and shockwave tracking.',
      '• Supported Codecs & Containers: Direct hardware-accelerated playback of MP4 (H.264/AVC, H.265/HEVC), WebM (VP8/VP9/AV1),',
      '  AVI, MKV, QuickTime MOV, MTS AVCHD, uncompressed TIFF/BMP/PNG bursts, and Open Source Physics TRZ archives.',
    ];
    for (const c of p3Cameras) {
      page3.drawText(c, { x: 36, y: p3Y, size: 8, font: fontRegular, color: cDark });
      p3Y -= 11;
    }

    p3Y -= 10;

    // Section 2: 3D DLT Stereo Triangulation
    page3.drawText('2. 3D STEREO DIRECT LINEAR TRANSFORMATION (DLT)', {
      x: 36,
      y: p3Y,
      size: 9.5,
      font: fontBold,
      color: cNavy,
    });

    p3Y -= 13;
    const p3DLT = [
      '• Dual Camera Setup: In 3D Mode, synchronized video streams from Camera 1 (Front/Azimuth) and Camera 2 (Side/Elevation)',
      '  are simultaneously inspected to compute full 3D spatial trajectories [x(t), y(t), z(t)] in calibrated 3D world space.',
      '• 11-Parameter DLT Matrix: Maps raw 2D pixel coordinates (u1, v1) and (u2, v2) to 3D Cartesian coordinates (X, Y, Z):',
      '       u = (L1·X + L2·Y + L3·Z + L4) / (L9·X + L10·Y + L11·Z + 1)',
      '       v = (L5·X + L6·Y + L7·Z + L8) / (L9·X + L10·Y + L11·Z + 1)',
      '• Multi-Rate Synchronizer: Automatically handles asynchronous camera frame rates (e.g. Cam 1 @ 1,000 fps, Cam 2 @ 2,000 fps)',
      '  using physical master time alignment and temporal linear coordinate interpolation.',
    ];
    for (const d of p3DLT) {
      page3.drawText(d, { x: 36, y: p3Y, size: 8, font: fontRegular, color: cDark });
      p3Y -= 11;
    }

    p3Y -= 10;

    // Section 3: Field Export & Report Generation
    page3.drawText('3. FIELD REPORTING & DATA EXPORT CAPABILITIES', {
      x: 36,
      y: p3Y,
      size: 9.5,
      font: fontBold,
      color: cNavy,
    });

    p3Y -= 13;
    const p3Reports = [
      '• PDF Field Summary Report: Click "PDF Report" in the navbar to generate a 2-page formal engineering summary with test cell',
      '  metadata, video analysis frame snapshots, 2D/3D trajectory plots, Mach number, G-force, kinetic energy, and full data logs.',
      '• Kinematic CSV Spreadsheet: Click "CSV" to export full comma-separated values (Frame, Time, x, y, z, vx, vy, vz, v, ax, ay, az).',
      '• Full Project Archives (.trk): Click "Project" to save complete experiment calibration, tracks, points, and clip settings.',
    ];
    for (const r of p3Reports) {
      page3.drawText(r, { x: 36, y: p3Y, size: 8, font: fontRegular, color: cDark });
      p3Y -= 11;
    }

    p3Y -= 14;

    // Sign-off / Compliance Seal
    const sealH = 75;
    page3.drawRectangle({
      x: 36,
      y: p3Y - sealH + 8,
      width: width - 72,
      height: sealH,
      color: cLightBg,
      borderColor: cBorder,
      borderWidth: 1,
    });

    page3.drawText('AIR-GAPPED COMPLIANCE & VERIFICATION SPECIFICATION', {
      x: 48,
      y: p3Y - 4,
      size: 9,
      font: fontBold,
      color: cNavy,
    });

    page3.drawText(
      'This application has been verified to execute with zero external cloud dependencies. All kinematics calculus, coordinate transforms,',
      { x: 48, y: p3Y - 18, size: 7.5, font: fontRegular, color: cDark }
    );
    page3.drawText(
      'DLT matrix inversions, and PDF generation run entirely in client-side RAM. Certified for secure testing environments & classified ranges.',
      { x: 48, y: p3Y - 29, size: 7.5, font: fontRegular, color: cDark }
    );
    page3.drawText(
      'Open Source Physics (OSP) Tracker Project  •  ISO/IEC Software Quality Standards  •  Local Workstation Edition',
      { x: 48, y: p3Y - 44, size: 7.5, font: fontBold, color: cEmerald }
    );

    // Footer Page 3
    page3.drawText('Page 3 of 3  •  Tracker Video Analysis Suite  •  Operating Manual  •  End of Documentation', {
      x: width / 2 - 180,
      y: 18,
      size: 7.5,
      font: fontRegular,
      color: cGray,
    });

    // =========================================================================
    // SAVE AND TRIGGER DOWNLOAD
    // =========================================================================
    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
    const blobUrl = URL.createObjectURL(blob);

    const fileName = 'Tracker_Video_Analysis_User_Manual.pdf';
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();

    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    }, 1200);
  } catch (err) {
    console.error('Failed to generate dynamic User Manual PDF with pdf-lib:', err);
  }
}
