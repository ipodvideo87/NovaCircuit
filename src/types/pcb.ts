export interface PCBComponent {
  id: string;
  x: number;
  y: number;
  rotation: number;
  name: string;
  type: string;
  schX?: number; // Schematic visual coordinate X
  schY?: number; // Schematic visual coordinate Y
  value?: string; // e.g. "10k", "0.1uF", "ESP32-S3"
}

export interface PCBTrace {
  id: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  width: number;
  netId: string;
}

export interface PCBRatsnest {
  id: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  netId: string;
}

export interface PCBBoard {
  components: PCBComponent[];
  traces: PCBTrace[];
  ratnest: PCBRatsnest[];
}
