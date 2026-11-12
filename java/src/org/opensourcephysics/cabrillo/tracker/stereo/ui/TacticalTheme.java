package org.opensourcephysics.cabrillo.tracker.stereo.ui;

import java.awt.Color;
import java.awt.Font;
import javax.swing.BorderFactory;
import javax.swing.border.Border;

/**
 * Tactical military & scientific styling tokens for the OSP/Tracker Stereo Workstation desktop UI.
 *
 * <p>Preserves the visual hierarchy and color specifications audited in Phase 0:
 * <ul>
 *   <li>Classic workstation chassis: #D4D0C8 with 3D bevels</li>
 *   <li>Primary command accent: #1E3A5F navy</li>
 *   <li>Tactical 3D canvas: #0F172A</li>
 *   <li>Video letterbox stage: #1E1E1E</li>
 *   <li>Telemetry indicators: #10B981 (pass), #F59E0B (warning), #EF4444 (rejection)</li>
 *   <li>Optical markers: #3B82F6 (Camera 1), #EAB308 (Camera 2), #38BDF8 (3D Ribbon)</li>
 * </ul>
 */
public final class TacticalTheme {

    // Chassis & Structural Controls
    public static final Color CHASSIS = new Color(0xD4, 0xD0, 0xC8);
    public static final Color BEVEL_HIGHLIGHT = new Color(0xEF, 0xEF, 0xEF);
    public static final Color SHADOW = new Color(0x80, 0x80, 0x80);
    public static final Color DEEP_BORDER = new Color(0x55, 0x55, 0x55);
    public static final Color SPLITTER_TRACK = new Color(0xC0, 0xBC, 0xB4);

    // Command Accent Palette
    public static final Color NAVY_ACCENT = new Color(0x1E, 0x3A, 0x5F);
    public static final Color NAVY_HOVER = new Color(0x15, 0x29, 0x43);
    public static final Color NAVY_PRESSED = new Color(0x0F, 0x1D, 0x30);
    public static final Color NAVY_TEXT_LIGHT = new Color(0xF8, 0xFA, 0xFC);

    // Viewport Surfaces
    public static final Color TACTICAL_CANVAS = new Color(0x0F, 0x17, 0x2A);
    public static final Color LETTERBOX_STAGE = new Color(0x1E, 0x1E, 0x1E);
    public static final Color DATA_GRID_SURFACE = new Color(0xFF, 0xFF, 0xFF);
    public static final Color DATA_GRID_ALT_ROW = new Color(0xF8, 0xFA, 0xFC);

    // Typography Colors
    public static final Color PRIMARY_TEXT = new Color(0x1E, 0x29, 0x3B);
    public static final Color SUBDUED_TEXT = new Color(0x64, 0x74, 0x8B);

    // Operational Status & Mathematical Gates
    public static final Color STATUS_PASS = new Color(0x10, 0xB9, 0x81);
    public static final Color STATUS_WARN = new Color(0xF5, 0x9E, 0x0B);
    public static final Color STATUS_REJECT = new Color(0xEF, 0x44, 0x44);

    // Optical Overlay Signatures
    public static final Color CAM1_OPTICAL = new Color(0x3B, 0x82, 0xF6);
    public static final Color CAM2_OPTICAL = new Color(0xEA, 0xB3, 0x08);
    public static final Color TRAJECTORY_RIBBON = new Color(0x38, 0xBD, 0xF8);
    public static final Color VELOCITY_VECTOR = new Color(0x10, 0xB9, 0x81);
    public static final Color ACCEL_VECTOR = new Color(0xEF, 0x44, 0x44);

    // Standard Workstation Fonts
    public static final Font FONT_HEADER = new Font("SansSerif", Font.BOLD, 12);
    public static final Font FONT_REGULAR = new Font("SansSerif", Font.PLAIN, 12);
    public static final Font FONT_SMALL = new Font("SansSerif", Font.PLAIN, 11);
    public static final Font FONT_MONO = new Font("Monospaced", Font.PLAIN, 11);
    public static final Font FONT_MONO_BOLD = new Font("Monospaced", Font.BOLD, 11);

    // Borders
    public static final Border BORDER_BEVELED_RAISED = BorderFactory.createCompoundBorder(
            BorderFactory.createLineBorder(BEVEL_HIGHLIGHT, 1),
            BorderFactory.createLineBorder(SHADOW, 1));

    public static final Border BORDER_BEVELED_LOWERED = BorderFactory.createCompoundBorder(
            BorderFactory.createLineBorder(SHADOW, 1),
            BorderFactory.createLineBorder(BEVEL_HIGHLIGHT, 1));

    public static final Border BORDER_TACTICAL_PANEL = BorderFactory.createCompoundBorder(
            BorderFactory.createLineBorder(DEEP_BORDER, 1),
            BorderFactory.createEmptyBorder(2, 2, 2, 2));

    private TacticalTheme() {
        // Theme constants
    }
}
