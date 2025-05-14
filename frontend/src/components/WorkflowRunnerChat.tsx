import React, { useState } from 'react';
import axios from 'axios';
import { Box, TextField, Button, Typography, CircularProgress, Paper, Stack } from '@mui/material';

export default function WorkflowRunnerChat({ workflowId }: { workflowId: string }) {
  const [messages, setMessages] = useState<any[]>([]);
  const [userInput, setUserInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [pausedStep, setPausedStep] = useState<number | null>(null);
  const [promptText, setPromptText] = useState('');

  const addMessage = (role: 'user' | 'agent', content: string, agentName?: string) => {
    setMessages((prev) => [...prev, { role, content, agentName }]);
  };

  const runWorkflow = async () => {
    setLoading(true);
    setMessages([]);
    setPausedStep(null);
    setPromptText('');
    try {
      const res = await axios.post(`http://localhost:8000/workflow/${workflowId}/run_contextual`, {
        user_input: userInput,
      });
      const { status, context, prompt, step, final_output } = res.data;

      if (status === 'need_user_input') {
        setPausedStep(step);
        setPromptText(prompt);
        addMessage('agent', prompt, `Agent ${step + 1}`);
      } else {
        addMessage('agent', context.final_output?.output || 'Workflow completed.', 'Agent');
        if (final_output) {
          addMessage(
            'agent',
            `Final Output:\nAgent: ${final_output.agent}\nOutput: ${final_output.output}\nQuery: ${final_output.step_query}`,
            'Agent'
          );
        }
      }
    } catch (err) {
      console.error('Error running workflow', err);
      addMessage('agent', 'Error running workflow.', 'Agent');
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
      const { status, context, prompt, step, final_output } = res.data;

      addMessage('user', userInput);
      setUserInput('');

      if (status === 'need_user_input') {
        setPausedStep(step);
        setPromptText(prompt);
        addMessage('agent', prompt, `Agent ${step + 1}`);
      } else {
        setPausedStep(null);
        setPromptText('');
        addMessage('agent', context.final_output?.output || 'Workflow completed.', 'Agent');
        if (final_output) {
          addMessage(
            'agent',
            `Final Output:\nAgent: ${final_output.agent}\nOutput: ${final_output.output}\nQuery: ${final_output.step_query}`,
            'Agent'
          );
        }
      }
    } catch (err) {
      console.error('Error resuming workflow', err);
      addMessage('agent', 'Error resuming workflow.', 'Agent');
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pausedStep !== null) {
      await resumeWorkflow();
    } else {
      await runWorkflow();
    }
  };

  const handleRestart = () => {
    setMessages([]);
    setUserInput('');
    setPausedStep(null);
    setPromptText('');
  };

  return (
    <Paper elevation={3} sx={{ p: 2, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ flex: 1, overflowY: 'auto', mb: 2 }}>
        {messages.map((msg, idx) => (
          <Box
            key={idx}
            sx={{
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              mb: 1,
            }}
          >
            <Box
              sx={{
                p: 2,
                borderRadius: 2,
                bgcolor: msg.role === 'user' ? 'primary.light' : 'secondary.light',
                color: msg.role === 'user' ? 'primary.contrastText' : 'secondary.contrastText',
                maxWidth: '70%',
              }}
            >
              <Typography variant="caption" sx={{ fontWeight: 'bold', display: 'block', mb: 0.5 }}>
                {msg.role === 'user' ? 'You' : msg.agentName || 'Agent'}
              </Typography>
              <Typography variant="body2">{msg.content}</Typography>
            </Box>
          </Box>
        ))}
      </Box>
      <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
        <Button
          variant="outlined"
          color="secondary"
          onClick={handleRestart}
          disabled={loading}
        >
          Restart
        </Button>
      </Stack>
      <form onSubmit={handleSubmit} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <TextField
          fullWidth
          variant="outlined"
          placeholder={pausedStep !== null ? 'Enter your input...' : 'Start the workflow...'}
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          disabled={loading}
        />
        <Button
          type="submit"
          variant="contained"
          color="primary"
          disabled={loading || !userInput}
        >
          {loading ? <CircularProgress size={24} /> : pausedStep !== null ? 'Submit' : 'Run'}
        </Button>
      </form>
    </Paper>
  );
}
