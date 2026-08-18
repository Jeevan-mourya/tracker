// TASK 1: src/org/opensourcephysics/cabrillo/tracker/Stereo3DState.java
package org.opensourcephysics.cabrillo.tracker;

import java.awt.geom.Point2D;
import org.opensourcephysics.controls.XML;
import org.opensourcephysics.controls.XMLControl;
import org.opensourcephysics.media.xuggle.math.StereoCalibrationManager;

public class Stereo3DState {
    private StereoCalibrationManager.CalibrationData calibrationData;
    private Point2D.Double leftClick;
    private Point2D.Double rightClick;

    public Stereo3DState() {
        this.calibrationData = null;
        this.leftClick = null;
        this.rightClick = null;
    }

    public StereoCalibrationManager.CalibrationData getCalibrationData() {
        return calibrationData;
    }

    public void setCalibrationData(StereoCalibrationManager.CalibrationData calibrationData) {
        this.calibrationData = calibrationData;
    }

    public Point2D.Double getLeftClick() {
        return leftClick;
    }

    public void setLeftClick(Point2D.Double leftClick) {
        this.leftClick = leftClick;
    }

    public Point2D.Double getRightClick() {
        return rightClick;
    }

    public void setRightClick(Point2D.Double rightClick) {
        this.rightClick = rightClick;
    }

    public void clearClicks() {
        this.leftClick = null;
        this.rightClick = null;
    }

    public static class Loader implements XML.ObjectLoader {
        @Override
        public void saveObject(XMLControl control, Object obj) {
            Stereo3DState state = (Stereo3DState) obj;
            if (state.calibrationData != null) {
                control.setValue("calibration_data", state.calibrationData);
            }
        }

        @Override
        public Object createObject(XMLControl control) {
            return new Stereo3DState();
        }

        @Override
        public Object loadObject(XMLControl control, Object obj) {
            Stereo3DState state = (Stereo3DState) obj;
            Object calibData = control.getObject("calibration_data");
            if (calibData instanceof StereoCalibrationManager.CalibrationData) {
                state.setCalibrationData((StereoCalibrationManager.CalibrationData) calibData);
            }
            return state;
        }
    }
}