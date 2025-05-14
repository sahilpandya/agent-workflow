// components/CustomEdge.tsx
import { EdgeProps, getBezierPath } from 'reactflow';

export default function CustomEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style = {},
  markerEnd,
  data
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
  });

  return (
    <>
      <path id={id} style={style} className="react-flow__edge-path" d={edgePath} markerEnd={markerEnd} />
      <foreignObject width={40} height={40} x={labelX - 20} y={labelY - 20} requiredExtensions="http://www.w3.org/1999/xhtml">
        <div className="flex justify-center items-center w-full h-full">
          <button
            onClick={() => data?.onDelete(id)}
            className="bg-red-500 text-white text-xs rounded px-2 py-1 hover:bg-red-700"
          >
            X
          </button>
        </div>
      </foreignObject>
    </>
  );
}
