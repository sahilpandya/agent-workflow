import React, { useState } from 'react';
import axios from 'axios';
import { Typography } from '@mui/material';

export default function WorkflowRunnerChat({ workflowId }: { workflowId: string }) {
  const [messages, setMessages] = useState<any[]>([]);
  const [pausedStep, setPausedStep] = useState<number | null>(null);
  const [promptText, setPromptText] = useState('');
  const [userInput, setUserInput] = useState('');
  const [finalOutput, setFinalOutput] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const runWorkflow = async () => {
    setLoading(true);
    setFinalOutput(null);
    setMessages([]);
    try {
      const res = await axios.post(`http://localhost:8000/workflow/${workflowId}/run`);
      const { status, trace, prompt, step, final_output } = res.data;

      setMessages(trace || []);
      setFinalOutput(status === 'success' ? final_output : null);

      if (status === 'need_user_input') {
        setPausedStep(step);
        setPromptText(prompt);
      } else {
        setPausedStep(null);
      }
    } catch (err) {
      console.error('Error running workflow', err);
    }
    setLoading(false);
  };

  const resumeWorkflow = async () => {
    if (!userInput) return;
    setLoading(true);
    try {
      const res = await axios.post(`http://localhost:8000/workflow/${workflowId}/resume`, {
        step_index: pausedStep,
        user_input: userInput,
      });

      const { status, trace, prompt, step, final_output } = res.data;

      setMessages(prev => [...prev, ...(trace || [])]);
      setUserInput('');
      setFinalOutput(status === 'success' ? final_output : null);

      if (status === 'need_user_input') {
        setPausedStep(step);
        setPromptText(prompt);
      } else {
        setPausedStep(null);
        setPromptText('');
      }
    } catch (err) {
      console.error('Error resuming workflow', err);
    }
    setLoading(false);
  };

  const handleEditLastResponse = (value: string) => {
    setMessages(prev => {
      const updated = [...prev];
      if (updated.length > 0) {
        updated[updated.length - 1].response = value;
      }
      return updated;
    });
  };

  return (
    <div className="bg-white p-4 rounded shadow w-full">
      <div className="flex gap-2 mb-4">
        <button
          onClick={runWorkflow}
          className="bg-blue-600 text-white px-4 py-2 rounded"
          disabled={loading}
          color="primary"
          style={{marginRight: "10px"}}
        >
          ▶️ Run Workflow
        </button>
        <button
          onClick={() => {
            setMessages([]);
            setFinalOutput(null);
            setPausedStep(null);
            setUserInput('');
            setPromptText('');
          }}
          className="bg-gray-400 text-white px-4 py-2 rounded"
          disabled={loading}
        >
          🔄 Restart
        </button>
      </div>

      {loading && <div className="text-sm text-gray-600 mb-2">⏳ Running...</div>}

      <div className="space-y-3" style={{ maxHeight: '400px', overflowY: 'auto', marginTop: '10px' }}>
        
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`p-3 rounded-lg max-w-xl ${
              msg.status === 'error'
                ? 'bg-red-100'
                : idx % 2 === 0
                ? 'bg-blue-100 self-start'
                : 'bg-green-100 self-end'
            }`}
          >
            <div className="text-sm text-gray-500 mb-1">
              <strong>{msg.model}</strong> - Step {msg.step || idx + 1}
            </div>
            <div className="text-sm"><strong>Query:</strong> {msg.query}</div>
            <div className="mt-1 text-sm">
              <strong>Response:</strong>{' '}
              {idx === messages.length - 1 && pausedStep === null ? (
                <input
                  type="text"
                  value={msg.response}
                  onChange={(e) => handleEditLastResponse(e.target.value)}
                  className="w-full mt-1 p-1 border rounded"
                />
              ) : (
                msg.response
              )}
            </div>
          </div>
        ))}
      </div>

      {pausedStep !== null && (
        <div className="mt-6 p-4 bg-yellow-100 rounded">
          <p className="mb-2 font-semibold">🔔 Input required: {promptText}</p>
          <input
            className="w-full p-2 border rounded mb-2"
            placeholder="Type your response..."
            value={userInput}
            onChange={e => setUserInput(e.target.value)}
          />
          <button
            onClick={resumeWorkflow}
            className="bg-green-600 text-white px-4 py-2 rounded"
            disabled={loading}
          >
            Submit & Continue
          </button>
        </div>
      )}

      {finalOutput && (
        <div className="mt-6 p-4 bg-green-200 border border-green-400 rounded">
          <p className="font-semibold text-green-800">✅ Final Output:</p>
          <p className="text-green-900 mt-1">{finalOutput}</p>
        </div>
      )}
    </div>
  );
}
