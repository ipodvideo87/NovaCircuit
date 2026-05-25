import React, { useRef, useEffect, useState } from 'react';
import { ProjectGraph, Point } from '../types';
import { BoardLayer } from '../lib/board';
import { RenderPipeline } from '../lib/rendering/renderPipeline';
import { MultiplayerCursors } from './MultiplayerCursors';
import { UserPresence } from '../lib/collaborationRuntime';

interface GPUCanvasProps {
  graph: ProjectGraph;
  activeLayer: BoardLayer;
  pan: Point;
  zoom: number;
  presences?: UserPresence[];
  activeLocks?: Record<string, string>;
  aiHighlightPoints?: Point[];
  showMultiplayerCursors?: boolean;
}

export const GPUCanvas: React.FC<GPUCanvasProps> = ({
  graph,
  activeLayer,
  pan,
  zoom,
  presences = [],
  activeLocks = {},
  aiHighlightPoints = [],
  showMultiplayerCursors = true
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pipelineRef = useRef<RenderPipeline | null>(null);
  const [dims, setDims] = useState({ width: 800, height: 600 });

  // Handle Resize via ResizeObserver to make sure high density layout canvas matches
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setDims({ width: width || 800, height: height || 600 });
      }
    });

    observer.observe(containerRef.current);
    return () => {
      observer.disconnect();
    };
  }, []);

  // Initialize/Update the WebGL context & pipeline configuration
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      if (!pipelineRef.current) {
        pipelineRef.current = new RenderPipeline(canvas);
      }
    } catch (e) {
      console.warn("WebGL Renderer initialization failed. Falling back to SVG/CPU layers.", e);
    }

    return () => {
      if (pipelineRef.current) {
        pipelineRef.current.dispose();
        pipelineRef.current = null;
      }
    };
  }, []);

  // Sync board geometry meshes dynamically on change to optimize GPU cache transfers
  useEffect(() => {
    const pipeline = pipelineRef.current;
    if (!pipeline) return;

    pipeline.syncGeometryBuffers(graph, activeLayer);
  }, [graph, activeLayer]);

  // Perform render pass whenever dependencies fluctuate (pan, zoom, active state revisions)
  useEffect(() => {
    const pipeline = pipelineRef.current;
    if (!pipeline) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Direct resolution setup matching physical screen retina pixels
    const dpr = window.devicePixelRatio || 1;
    canvas.width = dims.width * dpr;
    canvas.height = dims.height * dpr;

    pipeline.render(
      graph,
      activeLayer,
      dims.width,
      dims.height,
      pan,
      zoom
    );
  }, [graph, activeLayer, dims, pan, zoom]);

  return (
    <div 
      ref={containerRef} 
      className="absolute inset-0 w-full h-full select-none overflow-hidden bg-[#121214] z-0"
    >
      {/* 1. Underlying Accelerated WebGL Canvas */}
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block' }}
        className="pointer-events-none absolute inset-0 z-0"
      />

      {/* 2. Embedded AI Scanning and Path Overlays */}
      {aiHighlightPoints.length > 0 && (
        <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
          <svg className="w-full h-full overflow-visible">
            {aiHighlightPoints.map((pt, idx) => (
              <circle
                key={`ai_hl_${idx}`}
                cx={(pt.x * 20 + 1000 + pan.x) * zoom}
                cy={(pt.y * 20 + 1000 + pan.y) * zoom}
                r={10 * zoom}
                className="fill-cyan-500/20 stroke-cyan-400 stroke-2 animate-pulse"
              />
            ))}
          </svg>
        </div>
      )}

      {/* 3. Multiplayer Cursor Overlays */}
      {showMultiplayerCursors && presences.length > 0 && (
        <div className="absolute inset-0 pointer-events-none z-20">
          <MultiplayerCursors presences={presences} activeLocks={activeLocks} scale={zoom} />
        </div>
      )}

      {/* 4. Layer HUD Coordinates helper */}
      <div className="absolute bottom-4 right-4 bg-black/80 backdrop-blur border border-white/10 rounded-lg px-3 py-1.5 font-mono text-[9px] text-[#8e8e93] pointer-events-none z-30 select-none flex gap-3 shadow-xl">
        <div>
          LAYER: <span className="font-bold text-white uppercase">{activeLayer}</span>
        </div>
        <div>
          ZOOM: <span className="font-bold text-emerald-400">{Math.round(zoom * 100)}%</span>
        </div>
        <div>
          ENGINE: <span className="font-black text-rose-500">WEBGL 2D</span>
        </div>
      </div>
    </div>
  );
};
