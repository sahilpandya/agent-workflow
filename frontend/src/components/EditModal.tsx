import { useState } from 'react';

type Props = {
  isOpen: boolean;
  initialData: { model: string; query: string };
  onSave: (data: { model: string; query: string }) => void;
  onClose: () => void;
};

export default function EditModal({ isOpen, initialData, onSave, onClose }: Props) {
  const [form, setForm] = useState(initialData);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded shadow-lg w-96">
        <h2 className="text-lg font-semibold mb-4">Edit Agent</h2>
        <input
          name="model"
          value={form.model}
          onChange={handleChange}
          className="w-full border p-2 rounded mb-3"
          placeholder="Model name"
        />
        <input
          name="query"
          value={form.query}
          onChange={handleChange}
          className="w-full border p-2 rounded mb-3"
          placeholder="Query"
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1 bg-gray-300 rounded hover:bg-gray-400"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(form)}
            className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
