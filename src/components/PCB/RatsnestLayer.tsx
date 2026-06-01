import React from 'react';
import { PCBRatsnest } from '../../types/pcb';

interface Props {
  ratnest: PCBRatsnest[];
  visibleIds: Set<string>;
}

export const RatsnestLayer: React.FC<Props> = React.memo(({ ratnest, visibleIds }) => {
  return (
    <g className="ratsnest-layer pointer-events-none">
      {ratnest.map((rat) => {
        if (!visibleIds.has(rat.id)) return null;
        return (
          <line
            key={rat.id}
            x1={rat.startX}
            y1={rat.startY}
            x2={rat.endX}
            y2={rat.endY}
            stroke="#a0a0b0"
            strokeWidth="0.5"
            strokeDasharray="2 2"
            opacity="0.6"
          />
        );
      })}
    </g>
  );
});
