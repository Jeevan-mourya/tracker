package test;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.awt.geom.Point2D;

import org.opensourcephysics.media.xuggle.math.StereoCalibrationManager;

/**
 * Unit test for StereoCalibrationManager.findCalibrationPattern using a synthetic chessboard.
 */
public class CalibrationPatternTest {

    /**
     * Create a synthetic chessboard BufferedImage with a white border.
     * @param rows inner corner rows (e.g. 6)
     * @param cols inner corner cols (e.g. 9)
     */
    public static BufferedImage createChessboard(int rows, int cols, int squareSize, int border) {
        int squaresX = cols + 1;
        int squaresY = rows + 1;
        int w = squaresX * squareSize + border * 2;
        int h = squaresY * squareSize + border * 2;
        BufferedImage img = new BufferedImage(w, h, BufferedImage.TYPE_3BYTE_BGR);
        Graphics2D g = img.createGraphics();
        try {
            // White background (ensures a thick white border)
            g.setColor(Color.WHITE);
            g.fillRect(0, 0, w, h);

            // Draw the checkerboard starting at (border, border)
            for (int y = 0; y < squaresY; y++) {
                for (int x = 0; x < squaresX; x++) {
                    if (((x + y) & 1) == 0) { // black square
                        int px = border + x * squareSize;
                        int py = border + y * squareSize;
                        g.setColor(Color.BLACK);
                        g.fillRect(px, py, squareSize, squareSize);
                    }
                }
            }
        } finally {
            g.dispose();
        }
        return img;
    }

    public static void main(String[] args) {
        int rows = 6; // inner corners
        int cols = 9; // inner corners
        int squareSize = 40;
        int border = squareSize; // thick white border as required

        BufferedImage chess = createChessboard(rows, cols, squareSize, border);

        StereoCalibrationManager mgr = new StereoCalibrationManager();
        Point2D[] corners = new Point2D[rows * cols];
        boolean found = false;
        try {
            found = mgr.findCalibrationPattern(chess, rows, cols, corners);
        } catch (Throwable t) {
            System.err.println("Exception while running findCalibrationPattern: ");
            t.printStackTrace();
            System.exit(3);
        }

        int filled = 0;
        for (Point2D p : corners) {
            if (p != null) filled++;
        }

        System.out.println("findCalibrationPattern returned: " + found);
        System.out.println("Corners filled: " + filled + " (expected " + (rows * cols) + ")");

        if (found && filled == rows * cols) {
            System.out.println("SUCCESS: Pattern detected and corners populated.");
            System.exit(0);
        } else {
            System.err.println("FAIL: Pattern not detected correctly.");
            System.exit(2);
        }
    }
}
