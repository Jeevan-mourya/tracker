package org.opensourcephysics.cabrillo.tracker.stereo.integration;

import java.io.File;
import java.io.StringReader;
import java.io.StringWriter;
import java.util.List;
import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.transform.OutputKeys;
import javax.xml.transform.Transformer;
import javax.xml.transform.TransformerFactory;
import javax.xml.transform.dom.DOMSource;
import javax.xml.transform.stream.StreamResult;
import org.opensourcephysics.cabrillo.tracker.stereo.math.DLT11;
import org.opensourcephysics.cabrillo.tracker.stereo.ui.StereoTrackPoint;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;
import org.xml.sax.InputSource;

/**
 * Open Source Physics (OSP) Tracker .trk (XML) Project Serializer & Deserializer.
 *
 * <p>Conforms to the OSP XML persistence specification. Encapsulates stereoscopic
 * workstation state inside a clean, backward-compatible {@code <stereo_workstation>} block:
 * <ul>
 *   <li>Camera 1 and Camera 2 11-parameter DLT calibration matrices (L1 to L11).</li>
 *   <li>Brown-Conrady lens distortion coefficients (k1, k2, k3, p1, p2).</li>
 *   <li>Synchronized 2D observations (u1, v1, u2, v2) and reconstructed 3D positions (X, Y, Z).</li>
 *   <li>Aerospace kinematics and telemetry metrics.</li>
 * </ul>
 *
 * Legacy or single-camera OSP Tracker viewers safely ignore the {@code <stereo_workstation>}
 * child element while preserving standard 2D track data.
 */
public final class StereoXMLSerializer {

    private StereoXMLSerializer() {
        // Static serialization utility
    }

    /**
     * Serializes a complete stereoscopic workstation state into Tracker-compatible XML.
     *
     * @param track the active StereoPointTrack containing 2D/3D step observations
     * @param dlt1 Camera 1 calibrated DLT11 model
     * @param dlt2 Camera 2 calibrated DLT11 model
     * @param k1 radial coefficient 1
     * @param k2 radial coefficient 2
     * @param p1 tangential coefficient 1
     * @param p2 tangential coefficient 2
     * @return formatted XML string conforming to OSP Tracker .trk format
     * @throws Exception if XML DOM generation fails
     */
    public static String serializeToTrkXML(
            StereoPointTrack track,
            DLT11 dlt1, DLT11 dlt2,
            double k1, double k2, double p1, double p2) throws Exception {

        DocumentBuilderFactory docFactory = DocumentBuilderFactory.newInstance();
        DocumentBuilder docBuilder = docFactory.newDocumentBuilder();
        Document doc = docBuilder.newDocument();

        // Root Tracker Project Element
        Element rootElement = doc.createElement("object");
        rootElement.setAttribute("class", "org.opensourcephysics.cabrillo.tracker.TrackerPanel");
        doc.appendChild(rootElement);

        // Standard OSP Tracker metadata
        Element propTitle = doc.createElement("property");
        propTitle.setAttribute("name", "title");
        propTitle.setAttribute("type", "string");
        propTitle.setTextContent(track.getName() + " - Stereo 3D Workstation");
        rootElement.appendChild(propTitle);

        // Custom Backward-Compatible Stereoscopic Extension Block
        Element stereoBlock = doc.createElement("stereo_workstation");
        stereoBlock.setAttribute("version", "1.0");
        stereoBlock.setAttribute("app", "Tracker Stereo 3D Workstation");

        // 1. Camera 1 DLT Matrix
        if (dlt1 != null) {
            Element cam1Elem = doc.createElement("camera");
            cam1Elem.setAttribute("id", "cam1");
            cam1Elem.setAttribute("label", "Camera 1 (Primary)");
            for (int i = 0; i < 11; i++) {
                Element param = doc.createElement("L" + (i + 1));
                param.setTextContent(Double.toString(dlt1.l[i]));
                cam1Elem.appendChild(param);
            }
            stereoBlock.appendChild(cam1Elem);
        }

        // 2. Camera 2 DLT Matrix
        if (dlt2 != null) {
            Element cam2Elem = doc.createElement("camera");
            cam2Elem.setAttribute("id", "cam2");
            cam2Elem.setAttribute("label", "Camera 2 (Secondary)");
            for (int i = 0; i < 11; i++) {
                Element param = doc.createElement("L" + (i + 1));
                param.setTextContent(Double.toString(dlt2.l[i]));
                cam2Elem.appendChild(param);
            }
            stereoBlock.appendChild(cam2Elem);
        }

        // 3. Lens Distortion Coefficients
        Element distElem = doc.createElement("lens_distortion");
        distElem.setAttribute("model", "Brown-Conrady");
        distElem.setAttribute("k1", Double.toString(k1));
        distElem.setAttribute("k2", Double.toString(k2));
        distElem.setAttribute("p1", Double.toString(p1));
        distElem.setAttribute("p2", Double.toString(p2));
        stereoBlock.appendChild(distElem);

        // 4. Track Steps Sequence
        Element stepsElem = doc.createElement("stereo_steps");
        List<StereoTrackPoint> pts = track.getPoints();
        for (StereoTrackPoint p : pts) {
            Element stepElem = doc.createElement("step");
            stepElem.setAttribute("frame", Integer.toString(p.frame));
            stepElem.setAttribute("time", String.format("%.6f", p.time));

            if (p.hasCam1) {
                stepElem.setAttribute("u1", String.format("%.3f", p.u1));
                stepElem.setAttribute("v1", String.format("%.3f", p.v1));
            }
            if (p.hasCam2) {
                stepElem.setAttribute("u2", String.format("%.3f", p.u2));
                stepElem.setAttribute("v2", String.format("%.3f", p.v2));
            }
            if (p.has3D) {
                stepElem.setAttribute("x", String.format("%.6f", p.x));
                stepElem.setAttribute("y", String.format("%.6f", p.y));
                stepElem.setAttribute("z", String.format("%.6f", p.z));
                stepElem.setAttribute("vx", String.format("%.5f", p.vx));
                stepElem.setAttribute("vy", String.format("%.5f", p.vy));
                stepElem.setAttribute("vz", String.format("%.5f", p.vz));
                stepElem.setAttribute("speed", String.format("%.5f", p.speed));
                stepElem.setAttribute("mach", String.format("%.3f", p.machNumber));
                stepElem.setAttribute("gForce", String.format("%.3f", p.gForce));
                stepElem.setAttribute("slantRange", String.format("%.5f", p.slantRange));
                stepElem.setAttribute("azimuth", String.format("%.2f", p.azimuthDeg));
                stepElem.setAttribute("elevation", String.format("%.2f", p.elevationDeg));
                stepElem.setAttribute("rayAngle", String.format("%.2f", p.rayAngleDeg));
                stepElem.setAttribute("residual", String.format("%.4f", p.combinedResidualPx));
                stepElem.setAttribute("status", p.gateStatus);
            }
            stepsElem.appendChild(stepElem);
        }
        stereoBlock.appendChild(stepsElem);
        rootElement.appendChild(stereoBlock);

        // Transform DOM to XML String
        TransformerFactory transformerFactory = TransformerFactory.newInstance();
        Transformer transformer = transformerFactory.newTransformer();
        transformer.setOutputProperty(OutputKeys.INDENT, "yes");
        transformer.setOutputProperty("{http://xml.apache.org/xslt}indent-amount", "2");

        StringWriter writer = new StringWriter();
        transformer.transform(new DOMSource(doc), new StreamResult(writer));
        return writer.toString();
    }

    /**
     * Deserializes a stereoscopic workstation project from Tracker XML content.
     *
     * @param xmlContent XML string content
     * @param outTrack destination track to populate
     * @param outDlt1 destination DLT11 for Camera 1
     * @param outDlt2 destination DLT11 for Camera 2
     * @throws Exception if XML parsing fails
     */
    public static void deserializeFromTrkXML(
            String xmlContent,
            StereoPointTrack outTrack,
            DLT11 outDlt1, DLT11 outDlt2) throws Exception {

        DocumentBuilderFactory dbFactory = DocumentBuilderFactory.newInstance();
        DocumentBuilder dBuilder = dbFactory.newDocumentBuilder();
        Document doc = dBuilder.parse(new InputSource(new StringReader(xmlContent)));
        doc.getDocumentElement().normalize();

        NodeList stereoNodes = doc.getElementsByTagName("stereo_workstation");
        if (stereoNodes.getLength() == 0) {
            // Not a stereoscopic project file
            return;
        }

        Element stereoElem = (Element) stereoNodes.item(0);

        // 1. Parse Camera DLT matrices
        NodeList cameraNodes = stereoElem.getElementsByTagName("camera");
        for (int i = 0; i < cameraNodes.getLength(); i++) {
            Element camElem = (Element) cameraNodes.item(i);
            String id = camElem.getAttribute("id");
            DLT11 targetDLT = "cam1".equals(id) ? outDlt1 : ("cam2".equals(id) ? outDlt2 : null);

            if (targetDLT != null) {
                for (int l = 1; l <= 11; l++) {
                    NodeList paramList = camElem.getElementsByTagName("L" + l);
                    if (paramList.getLength() > 0) {
                        targetDLT.l[l - 1] = Double.parseDouble(paramList.item(0).getTextContent());
                    }
                }
            }
        }

        // 2. Parse Step Sequences
        outTrack.clear();
        NodeList stepNodes = stereoElem.getElementsByTagName("step");
        for (int i = 0; i < stepNodes.getLength(); i++) {
            Element stepElem = (Element) stepNodes.item(i);
            int frame = Integer.parseInt(stepElem.getAttribute("frame"));
            double time = Double.parseDouble(stepElem.getAttribute("time"));

            StereoTrackPoint pt = outTrack.getOrCreatePoint(frame, time);

            if (stepElem.hasAttribute("u1") && stepElem.hasAttribute("v1")) {
                pt.setCam1(Double.parseDouble(stepElem.getAttribute("u1")),
                           Double.parseDouble(stepElem.getAttribute("v1")));
            }
            if (stepElem.hasAttribute("u2") && stepElem.hasAttribute("v2")) {
                pt.setCam2(Double.parseDouble(stepElem.getAttribute("u2")),
                           Double.parseDouble(stepElem.getAttribute("v2")));
            }

            if (stepElem.hasAttribute("x") && stepElem.hasAttribute("y") && stepElem.hasAttribute("z")) {
                pt.x = Double.parseDouble(stepElem.getAttribute("x"));
                pt.y = Double.parseDouble(stepElem.getAttribute("y"));
                pt.z = Double.parseDouble(stepElem.getAttribute("z"));
                pt.has3D = true;

                if (stepElem.hasAttribute("vx")) pt.vx = Double.parseDouble(stepElem.getAttribute("vx"));
                if (stepElem.hasAttribute("vy")) pt.vy = Double.parseDouble(stepElem.getAttribute("vy"));
                if (stepElem.hasAttribute("vz")) pt.vz = Double.parseDouble(stepElem.getAttribute("vz"));
                if (stepElem.hasAttribute("speed")) pt.speed = Double.parseDouble(stepElem.getAttribute("speed"));
                if (stepElem.hasAttribute("mach")) pt.machNumber = Double.parseDouble(stepElem.getAttribute("mach"));
                if (stepElem.hasAttribute("gForce")) pt.gForce = Double.parseDouble(stepElem.getAttribute("gForce"));
                if (stepElem.hasAttribute("slantRange")) pt.slantRange = Double.parseDouble(stepElem.getAttribute("slantRange"));
                if (stepElem.hasAttribute("azimuth")) pt.azimuthDeg = Double.parseDouble(stepElem.getAttribute("azimuth"));
                if (stepElem.hasAttribute("elevation")) pt.elevationDeg = Double.parseDouble(stepElem.getAttribute("elevation"));
                if (stepElem.hasAttribute("rayAngle")) pt.rayAngleDeg = Double.parseDouble(stepElem.getAttribute("rayAngle"));
                if (stepElem.hasAttribute("residual")) pt.combinedResidualPx = Double.parseDouble(stepElem.getAttribute("residual"));
                if (stepElem.hasAttribute("status")) pt.gateStatus = stepElem.getAttribute("status");
            }
        }
    }
}
