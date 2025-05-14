import React, { useState } from 'react';
import axios from 'axios';

export default function ChatPanel() {
  const [model, setModel] = useState('openai/gpt-4');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<{ role: string, content: string }[]>([]);

  const handleSend = async () => {
    if (!input.trim()) return;
    const newMessages = [...messages, { role: 'user', content: input }];
    setMessages(newMessages);

    try {
      const res = await axios.post('http://localhost:8000/ask', {
        agents: [{
          model,
          query: input,
          mode: 'default',
        }]
      });

      const result = res.data.results?.[0]?.response || 'No response';
      setMessages((prev) => [...prev, { role: 'assistant', content: result }]);
      setInput('');
    } catch (err) {
      console.error('Error:', err);
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Error calling API.' }]);
    }
  };

  return (
    <div className="w-full h-full flex flex-col border rounded shadow">
      <div className="p-3 border-b">
        <select
          className="border p-2 rounded w-full"
          value={model}
          onChange={(e) => setModel(e.target.value)}
        >
          <option value="openai/gpt-4">OpenAI GPT-4</option>
          <option value="local/ollama-llama3">Ollama LLaMA 3</option>
          <option value="huggingface/claude-3-opus">Claude 3 Opus</option>
        </select>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-gray-50">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`p-2 rounded ${
              msg.role === 'user' ? 'bg-blue-100 self-end' : 'bg-green-100 self-start'
            }`}
          >
            <div className="text-sm text-gray-600">{msg.role === 'user' ? 'You' : 'Agent'}</div>
            <div>{msg.content}</div>
          </div>
        ))}
      </div>
      <div className="p-3 border-t flex gap-2">
        <input
          className="border p-2 rounded flex-1"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message..."
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
        />
        <button onClick={handleSend} className="bg-blue-600 text-white px-4 rounded">
          Send
        </button>
      </div>
    </div>
  );
}
