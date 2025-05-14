import React, { useState } from 'react';
import axios from 'axios';

export default function WorkflowRunner({ workflowId }: { workflowId: string }) {
  const [steps, setSteps] = useState<any[]>([]);
  const [pausedStep, setPausedStep] = useState<number | null>(null);
  const [userInput, setUserInput] = useState('');
  const [promptText, setPromptText] = useState('');

  const runWorkflow = async () => {
    const res = await axios.post(`http://localhost:8000/workflow/${workflowId}/run`);
    if (res.data.status === "need_user_input") {
      setPausedStep(res.data.step);
      setPromptText(res.data.prompt);
      setSteps(res.data.trace);
    } else {
      setSteps(res.data.trace || []);
    }
  };

  const resumeWorkflow = async () => {
    const res = await axios.post(`http://localhost:8000/workflow/${workflowId}/resume`, {
      step_index: pausedStep,
      user_input: userInput,
    });

    setSteps((prev) => [...prev, ...(res.data.trace || [])]);
    setPausedStep(null);
    setPromptText('');
    setUserInput('');
  };

  return (
    <div className="p-4 border rounded shadow">
      <button
        onClick={runWorkflow}
        className="bg-blue-600 text-white px-4 py-2 rounded mb-4"
      >
        Run Workflow
      </button>

      {steps.map((step, idx) => (
        <div key={idx} className="bg-gray-100 p-3 my-2 rounded shadow-sm">
          <div className="text-sm text-gray-500">Step {idx + 1} - {step.model}</div>
          <div><strong>Query:</strong> {step.query}</div>
          <div><strong>Status:</strong> {step.status}</div>
          <div><strong>Response:</strong> {step.response || '[Waiting...]'}</div>
        </div>
      ))}

      {pausedStep !== null && (
        <div className="mt-4 bg-yellow-100 p-4 rounded">
          <p className="mb-2 font-medium">Input required: {promptText}</p>
          <input
            className="p-2 border w-full mb-2"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            placeholder="Type your input..."
          />
          <button
            onClick={resumeWorkflow}
            className="bg-green-600 text-white px-4 py-2 rounded"
          >
            Continue
          </button>
        </div>
      )}
    </div>
  );
}
