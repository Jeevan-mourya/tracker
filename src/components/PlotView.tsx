import React, { useState, useMemo } from 'react';
import { Track, PlotVariable, FitType, FitResult } from '../types';
import { fitLinear, fitParabolic, fitCubic } from '../utils/physics';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceDot,
} from 'recharts';
import { TrendingUp, Activity, Calculator, CheckCircle2 } from 'lucide-react';

interface PlotViewProps {
  tracks: Track[];
  activeTrackId: string;
  currentFrame: number;
  onSelectFrame: (frame: number) => void;
}

export const PlotView: React.FC<PlotViewProps> = ({
  tracks,
  activeTrackId,
  currentFrame,
  onSelectFrame,
}) => {
  const [varY, setVarY] = useState<PlotVariable>('y');
  const [varX, setVarX] = useState<'t' | 'x' | 'z'>('t');
  const [fitType, setFitType] = useState<FitType>('parabolic');

  const activeTrack = tracks.find((t) => t.id === activeTrackId) || tracks[0];

  // Prepare data points for chart
  const { chartData, fitResult, activePoint } = useMemo(() => {
    if (!activeTrack || activeTrack.steps.length === 0) {
      return { chartData: [], fitResult: null, activePoint: null };
    }

    // Extract valid (x, y) pairs for the selected variables
    const rawPoints = activeTrack.steps
      .map((step) => {
        let xVal = varX === 't' ? step.time : varX === 'x' ? step.x : (step.z ?? 0);
        let yVal: number | null | undefined = null;

        switch (varY) {
          case 'y': yVal = step.y; break;
          case 'x': yVal = step.x; break;
          case 'z': yVal = step.z; break;
          case 'vx': yVal = step.vx; break;
          case 'vy': yVal = step.vy; break;
          case 'vz': yVal = step.vz; break;
          case 'v': yVal = step.v; break;
          case 'ax': yVal = step.ax; break;
          case 'ay': yVal = step.ay; break;
          case 'az': yVal = step.az; break;
          case 'a': yVal = step.a; break;
          case 'kineticEnergy': yVal = step.kineticEnergy; break;
          case 'potentialEnergy': yVal = step.potentialEnergy; break;
          case 'totalEnergy': yVal = step.totalEnergy; break;
        }

        return {
          frame: step.frame,
          x: xVal,
          y: yVal,
          time: step.time,
        };
      })
      .filter((p) => p.y !== null && p.y !== undefined && !isNaN(p.y)) as {
        frame: number;
        x: number;
        y: number;
        time: number;
      }[];

    // Compute curve fit if enabled
    let fit: FitResult | null = null;
    if (fitType === 'linear' && rawPoints.length >= 2) {
      fit = fitLinear(rawPoints);
    } else if (fitType === 'parabolic' && rawPoints.length >= 3) {
      fit = fitParabolic(rawPoints);
    } else if (fitType === 'cubic' && rawPoints.length >= 4) {
      fit = fitCubic(rawPoints);
    }

    // Generate fitted line values
    const dataWithFit = rawPoints.map((p) => {
      let fitY: number | null = null;
      if (fit && fit.type === 'linear' && fit.params.slope !== undefined) {
        fitY = fit.params.slope * p.x + fit.params.intercept;
      } else if (fit && fit.type === 'parabolic' && fit.params.A !== undefined) {
        fitY = fit.params.A * p.x * p.x + fit.params.B * p.x + fit.params.C;
      } else if (fit && fit.type === 'cubic' && fit.params.A !== undefined) {
        fitY = fit.params.A * Math.pow(p.x, 3) + fit.params.B * Math.pow(p.x, 2) + fit.params.C * p.x + fit.params.D;
      }

      return {
        ...p,
        dataY: Number(p.y.toFixed(4)),
        fitY: fitY !== null ? Number(fitY.toFixed(4)) : null,
      };
    });

    const activePt = dataWithFit.find((p) => p.frame === currentFrame) || null;

    return { chartData: dataWithFit, fitResult: fit, activePoint: activePt };
  }, [activeTrack, varX, varY, fitType, currentFrame]);

  // Labels
  const getUnit = (v: PlotVariable) => {
    switch (v) {
      case 'x':
      case 'y':
      case 'z': return 'm';
      case 'vx':
      case 'vy':
      case 'vz':
      case 'v': return 'm/s';
      case 'ax':
      case 'ay':
      case 'az':
      case 'a': return 'm/s²';
      case 'kineticEnergy':
      case 'potentialEnergy':
      case 'totalEnergy': return 'J';
    }
  };

  const yLabel = `${varY} (${getUnit(varY)})`;
  const xLabel = varX === 't' ? 't (s)' : varX === 'x' ? 'x (m)' : 'z (m)';

  return (
    <div id="plot-view-container" className="flex flex-col h-full bg-white text-xs">
      {/* Top Header: Variable Selectors & Fit Controls */}
      <div className="bg-[#d4d0c8] border-b border-[#808080] px-3 py-2 flex flex-wrap items-center justify-between gap-2">
        {/* Variables */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-white border border-[#808080] rounded-[2px] px-2 py-1">
            <span className="text-[11px] text-black font-bold">Y:</span>
            <select
              id="plot-y-var-select"
              value={varY}
              onChange={(e) => setVarY(e.target.value as PlotVariable)}
              className="bg-transparent text-black font-semibold focus:outline-none cursor-pointer text-xs"
            >
              <optgroup label="3D Position">
                <option value="y">y (Vertical Position)</option>
                <option value="x">x (Horizontal Position)</option>
                <option value="z">z (Lateral 3D Position)</option>
              </optgroup>
              <optgroup label="3D Velocity">
                <option value="vy">vy (Vertical Velocity)</option>
                <option value="vx">vx (Horizontal Velocity)</option>
                <option value="vz">vz (Lateral Velocity)</option>
                <option value="v">v (3D Speed magnitude)</option>
              </optgroup>
              <optgroup label="3D Acceleration">
                <option value="ay">ay (Vertical Accel)</option>
                <option value="ax">ax (Horizontal Accel)</option>
                <option value="az">az (Lateral Accel)</option>
                <option value="a">a (3D Total Accel)</option>
              </optgroup>
              <optgroup label="Energy">
                <option value="kineticEnergy">Kinetic Energy (K)</option>
                <option value="potentialEnergy">Potential Energy (U)</option>
                <option value="totalEnergy">Total Mechanical (E)</option>
              </optgroup>
            </select>
          </div>

          <span className="text-black font-bold">vs</span>

          <div className="flex items-center gap-1 bg-white border border-[#808080] rounded-[2px] px-2 py-1">
            <span className="text-[11px] text-black font-bold">X:</span>
            <select
              id="plot-x-var-select"
              value={varX}
              onChange={(e) => setVarX(e.target.value as 't' | 'x' | 'z')}
              className="bg-transparent text-black font-semibold focus:outline-none cursor-pointer text-xs"
            >
              <option value="t">t (Time)</option>
              <option value="x">x (Horizontal Position)</option>
              <option value="z">z (Lateral 3D Position)</option>
            </select>
          </div>
        </div>

        {/* Fitting model */}
        <div className="flex items-center gap-1.5">
          <Calculator className="w-3.5 h-3.5 text-black" />
          <span className="text-[11px] text-black font-semibold">Fit:</span>
          <select
            id="plot-fit-type-select"
            value={fitType}
            onChange={(e) => setFitType(e.target.value as FitType)}
            className="bg-white border border-[#808080] rounded-[2px] px-2 py-1 text-xs text-black font-semibold focus:outline-none cursor-pointer"
          >
            <option value="none">None</option>
            <option value="linear">Linear (y = mt + c)</option>
            <option value="parabolic">Parabolic (y = At² + Bt + C)</option>
            <option value="cubic">Cubic (y = At³ + Bt² + Ct + D)</option>
          </select>
        </div>
      </div>

      {/* Regression Results Banner */}
      {fitResult && fitType !== 'none' && (
        <div className="bg-[#e0e0e0] border-b border-[#808080] px-3 py-1.5 flex flex-wrap items-center justify-between text-[11px] font-mono text-black">
          <div className="flex items-center gap-2">
            <span className="text-black font-bold">Fit Eq:</span>
            <span className="text-black font-medium">{fitResult.equation}</span>
          </div>
          <div className="flex items-center gap-3">
            <span>
              R²: <strong className="text-black font-bold">{fitResult.rSquared.toFixed(4)}</strong>
            </span>
            {fitResult.rmse !== undefined && (
              <span>
                RMSE: <strong className="text-black font-bold">{fitResult.rmse.toFixed(4)}</strong>
              </span>
            )}
            {fitResult.params.acceleration !== undefined && (
              <span className="text-black font-bold bg-white border border-[#808080] px-1.5 py-0.5 rounded-[2px]">
                g (2A) = {fitResult.params.acceleration.toFixed(2)} m/s²
              </span>
            )}
          </div>
        </div>
      )}

      {/* Chart Canvas Area */}
      <div className="flex-1 w-full p-2 min-h-0 bg-white">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 12, right: 20, left: -10, bottom: 20 }}
              onClick={(e) => {
                if (e && e.activePayload && e.activePayload[0]) {
                  const pt = e.activePayload[0].payload;
                  if (pt && pt.frame !== undefined) {
                    onSelectFrame(pt.frame);
                  }
                }
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#cccccc" />
              <XAxis
                dataKey="x"
                stroke="#000000"
                fontSize={10}
                tickFormatter={(val) => Number(val).toFixed(2)}
                label={{
                  value: xLabel,
                  position: 'insideBottom',
                  offset: -12,
                  fill: '#000000',
                  fontSize: 11,
                }}
              />
              <YAxis
                dataKey="dataY"
                stroke="#000000"
                fontSize={10}
                tickFormatter={(val) => Number(val).toFixed(2)}
                label={{
                  value: yLabel,
                  angle: -90,
                  position: 'insideLeft',
                  offset: 15,
                  fill: '#000000',
                  fontSize: 11,
                }}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-white border border-[#808080] rounded-[2px] p-2 text-xs font-mono text-black">
                        <div className="text-[#333333] mb-1 font-semibold">
                          Frame {data.frame} (t: {data.time?.toFixed(3)}s)
                        </div>
                        <div className="text-black font-bold">
                          {varY}: <strong>{data.dataY}</strong> {getUnit(varY)}
                        </div>
                        {data.fitY !== null && (
                          <div className="text-[#555555] text-[10px] font-medium">
                            Fit: {data.fitY}
                          </div>
                        )}
                      </div>
                    );
                  }
                  return null;
                }}
              />

              {/* Fitted Curve Line */}
              {fitType !== 'none' && (
                <Line
                  type="monotone"
                  dataKey="fitY"
                  stroke="#b45309"
                  strokeWidth={2}
                  dot={false}
                  name="Fitted Curve"
                  isAnimationActive={false}
                />
              )}

              {/* Experimental Discrete Data Points */}
              <Line
                type="linear"
                dataKey="dataY"
                stroke={activeTrack?.color || '#1e3a5f'}
                strokeWidth={1.5}
                dot={{
                  r: 3.5,
                  fill: activeTrack?.color || '#1e3a5f',
                  stroke: '#000000',
                  strokeWidth: 1,
                }}
                activeDot={{ r: 6, stroke: '#1e3a5f', strokeWidth: 2 }}
                name="Track Points"
                isAnimationActive={false}
              />

              {/* Active frame highlight dot */}
              {activePoint && (
                <ReferenceDot
                  x={activePoint.x}
                  y={activePoint.dataY}
                  r={6}
                  fill="#b91c1c"
                  stroke="#000000"
                  strokeWidth={1.5}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-[#555555] text-xs">
            <Activity className="w-8 h-8 text-[#808080] mb-2 stroke-1" />
            <p className="font-medium text-black">No tracking points yet</p>
            <p className="text-[11px] text-[#555555] mt-1">
              Click on the video frame or press Shift+Click to record kinematic points
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
