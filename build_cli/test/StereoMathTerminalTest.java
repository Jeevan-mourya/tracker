package test;

import java.awt.geom.Point2D;

import org.bytedeco.javacpp.indexer.DoubleIndexer;
import org.bytedeco.opencv.global.opencv_core;
import org.bytedeco.opencv.opencv_core.Mat;

import org.opensourcephysics.media.xuggle.math.StereoCalibrationManager;

public class StereoMathTerminalTest {

    public static void main(String[] args) {
        System.out.println("=== StereoMathTerminalTest: headless JavaCV/OpenCV smoke test ===");

        Mat p1 = null;
        Mat p2 = null;
        try {
            p1 = buildProjectionMatrix(800.0, 320.0, 240.0, 0.0);
            p2 = buildProjectionMatrix(800.0, 320.0, 240.0, 100.0);

            System.out.println("Mock projection matrices constructed:");
            printMat("P1 (left camera)", p1);
            printMat("P2 (right camera, baseline=100)", p2);

            Point2D leftPoint = new Point2D.Double(350.0, 260.0);
            Point2D rightPoint = new Point2D.Double(300.0, 260.0);

            System.out.println("Mock correspondence points:");
            System.out.println("  Left  (u,v): (" + leftPoint.getX() + ", " + leftPoint.getY() + ")");
            System.out.println("  Right (u,v): (" + rightPoint.getX() + ", " + rightPoint.getY() + ")");

            StereoCalibrationManager calibrationManager = new StereoCalibrationManager();
            double[] point3D = calibrationManager.triangulateCoordinate(leftPoint, rightPoint, p1, p2);

            if (point3D == null) {
                System.err.println("FAIL: triangulateCoordinate() returned null.");
                System.exit(1);
            }
            if (point3D.length != 3) {
                System.err.println("FAIL: triangulateCoordinate() returned an array of unexpected length: " + point3D.length);
                System.exit(1);
            }

            double x = point3D[0];
            double y = point3D[1];
            double z = point3D[2];

            System.out.println("Triangulated 3D point:");
            System.out.println("  X: " + x);
            System.out.println("  Y: " + y);
            System.out.println("  Z (depth): " + z);

            if (Double.isNaN(x) || Double.isNaN(y) || Double.isNaN(z)) {
                System.err.println("FAIL: Triangulated coordinates contain NaN.");
                System.exit(1);
            }
            if (Double.isInfinite(x) || Double.isInfinite(y) || Double.isInfinite(z)) {
                System.err.println("FAIL: Triangulated coordinates contain Infinity.");
                System.exit(1);
            }

            System.out.println("PASS: JavaCV/OpenCV native bindings loaded and executed successfully!");

        } catch (UnsatisfiedLinkError err) {
            System.err.println("FAIL: Native OpenCV library failed to load (UnsatisfiedLinkError).");
            err.printStackTrace();
            System.exit(1);
        } catch (Throwable t) {
            System.err.println("FAIL: Unexpected exception during triangulation test.");
            t.printStackTrace();
            System.exit(1);
        } finally {
            if (p1 != null) p1.release();
            if (p2 != null) p2.release();
        }
    }

    private static Mat buildProjectionMatrix(double focalLength, double principalX,
                                              double principalY, double baseline) {
        Mat mat = new Mat(3, 4, opencv_core.CV_64F);
        DoubleIndexer indexer = mat.createIndexer();
        try {
            indexer.put(0, 0, focalLength);
            indexer.put(0, 1, 0.0);
            indexer.put(0, 2, principalX);
            indexer.put(0, 3, -focalLength * baseline);

            indexer.put(1, 0, 0.0);
            indexer.put(1, 1, focalLength);
            indexer.put(1, 2, principalY);
            indexer.put(1, 3, 0.0);

            indexer.put(2, 0, 0.0);
            indexer.put(2, 1, 0.0);
            indexer.put(2, 2, 1.0);
            indexer.put(2, 3, 0.0);
        } finally {
            indexer.close();
        }
        return mat;
    }

    private static void printMat(String label, Mat mat) {
        DoubleIndexer indexer = mat.createIndexer();
        try {
            StringBuilder sb = new StringBuilder();
            sb.append("  ").append(label).append(":\n");
            for (int row = 0; row < mat.rows(); row++) {
                sb.append("    [");
                for (int col = 0; col < mat.cols(); col++) {
                    sb.append(indexer.get(row, col));
                    if (col < mat.cols() - 1) {
                        sb.append(", ");
                    }
                }
                sb.append("]\n");
            }
            System.out.print(sb);
        } finally {
            indexer.close();
        }
    }
}
