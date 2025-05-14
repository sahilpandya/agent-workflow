import { Handle, Position, NodeProps } from 'reactflow';

type CustomNodeData = {
  label: string;
  onDelete: (id: string) => void;
  onEdit: (id: string) => void;
};

export default function CustomNode({ id, data }: NodeProps<CustomNodeData>) {
  return (
    <div className="bg-white border border-gray-300 rounded shadow p-2 relative">
      <div className="text-sm font-medium">{data.label}</div>
      <div className="flex gap-1 mt-1">
        <button
          className="text-xs bg-blue-500 text-white px-2 py-0.5 rounded"
          onClick={() => data.onEdit(id)}
        >
          Edit
        </button>
        <button
          className="text-xs bg-red-500 text-white px-2 py-0.5 rounded"
          onClick={() => data.onDelete(id)}
        >
          Delete
        </button>
      </div>

      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
