// WorkflowList.tsx
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import WorkflowRunnerChat from './WorkflowRunnerChat';
import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Card,
  Typography,
  Button,
  TextField,
  Box,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Paper
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

export default function WorkflowList() {
  const [workflows, setWorkflows] = useState([]);
  const [results, setResults] = useState<any>(null);
  const [needsInput, setNeedsInput] = useState(false);
  const [userPrompt, setUserPrompt] = useState('');
  const [userInput, setUserInput] = useState('');
  const [resumeStep, setResumeStep] = useState<number | null>(null);
  const [activeWorkflowId, setActiveWorkflowId] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<any>(null);
  const [agentTestInput, setAgentTestInput] = useState('');
  const [agentTestOutput, setAgentTestOutput] = useState('');
  const [chatMessages, setChatMessages] = useState<{ sender: string; text: string }[]>([]);

  useEffect(() => {
    axios.get('http://localhost:8000/workflow').then(res => {
      setWorkflows(res.data);
    });
  }, []);

  const runWorkflow = async (id: string) => {
    setActiveWorkflowId(id);
    const res = await axios.post(`http://localhost:8000/workflow/${id}/run`);

    if (res.data.status === "need_user_input") {
      setNeedsInput(true);
      setUserPrompt(res.data.prompt);
      setResumeStep(res.data.step);
      setResults(res.data.trace);
    } else {
      setResults(res.data);
    }
  };

  const resumeWorkflow = async () => {
    if (!activeWorkflowId || resumeStep === null) return;

    try {
      const res = await axios.post(`http://localhost:8000/workflow/${activeWorkflowId}/resume`, {
        step_index: resumeStep,
        user_input: userInput,
      });

      setNeedsInput(false);
      setUserInput('');
      setResumeStep(null);
      setResults(res.data);
    } catch (err) {
      console.error('Error resuming workflow:', err);
      alert('Failed to resume workflow. Please try again.');
    }
  };

  const testAgent = async () => {
    if (!selectedAgent) return;

    const userMessage = { sender: 'user', text: agentTestInput };
    setChatMessages(prev => [...prev, userMessage]);

    try {
      let query = selectedAgent.query;

      if (query.includes('{{input}}')) {
        query = query.replace('{{input}}', agentTestInput);
      } else if (query.includes('[USER_INPUT_REQUEST]')) {
        query = query.replace('[USER_INPUT_REQUEST]', agentTestInput);
      } else if (agentTestInput) {
        query = `${query}\n${agentTestInput}`; // append input at the end
      }

      const res = await axios.post('http://localhost:8000/agent/test', {
        agents: [
          {
            model: selectedAgent.model,
            query: query,
            mode: selectedAgent.mode || "local", // ensure this is included
            additional_info: selectedAgent.additional_info || {}
          }
        ]
      });
      
      // Check if the response is an array (in case of multiple results)
    const responseText = Array.isArray(res.data.results) && res.data.results.length > 0
    ? res.data.results[0].response // Or handle it differently based on your backend structure
    : res.data.response; // For a single response

      const botMessage = { sender: 'agent', text: responseText };
      setChatMessages(prev => [...prev, botMessage]);
    } catch (err) {
      const errorMsg = { sender: 'agent', text: 'Error testing agent' };
      setChatMessages(prev => [...prev, errorMsg]);
    }
  };

  return (
    <Box p={4} display="flex" flexDirection={{ xs: 'column', md: 'row' }} gap={4} bgcolor="#f5f5f5">
      <Box flex={2}>
        <Typography variant="h5" gutterBottom fontStyle={{color: "#f00"}}>Saved Workflows</Typography>
        {workflows.map((w: any) => (
          <Accordion key={w._id} sx={{ mb: 2 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="subtitle1">{w.name}</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Card variant="outlined" sx={{ p: 2, mb: 2 }}>
                <Typography variant="h6">Agents</Typography>
                {w.agents && w.agents.length > 0 ? (
                  <ul>
                    {w.agents.map((agent: any, index: number) => (
                      <li key={index}>
                        <Typography variant="body2">[{index + 1}] {agent.model} - {agent.query}</Typography>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Typography variant="body2">No agents configured.</Typography>
                )}
              </Card>

              {/* <Button variant="contained" color="primary" onClick={() => runWorkflow(w._id)}>
                ▶️ Run Workflow
              </Button> */}

              <WorkflowRunnerChat workflowId={w._id} />
            </AccordionDetails>
          </Accordion>
        ))}
        {workflows.length === 0 && (
          <Typography variant="body2">No workflows available. Please create one.</Typography>
        )}
        {results && (
          <Box mt={4}>
            <Typography variant="h6">Execution Result:</Typography>
            <Card variant="outlined" sx={{ mt: 2, p: 2, bgcolor: '#f9f9f9' }}>
              <pre>{JSON.stringify(results, null, 2)}</pre>
            </Card>
          </Box>
        )}

        {needsInput && (
          <Card variant="outlined" sx={{ mt: 4, p: 3, bgcolor: '#fff3cd' }}>
            <Typography variant="body1" gutterBottom><strong>🔔 Input required:</strong> {userPrompt}</Typography>
            <TextField
              fullWidth
              label="Enter your response"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              sx={{ mb: 2 }}
            />
            <Button variant="contained" color="success" onClick={resumeWorkflow}>
              Continue
            </Button>
          </Card>
        )}
      </Box>

      <Box flex={1}>
        <Typography variant="h6" fontStyle={{color: "#f00"}} gutterBottom>💬 Agent Chat Test</Typography>
        <Paper variant="outlined" sx={{ p: 2, bgcolor: 'white', mb: 2 }}>
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Select Agent</InputLabel>
            <Select
              value={selectedAgent || ''}
              onChange={(e) => {setSelectedAgent(e.target.value); setChatMessages([]); setAgentTestInput('')}}
              label="Select Agent"
            >
              {workflows.flatMap(w => w.agents || []).map((agent, idx) => (
                <MenuItem key={idx} value={agent}>{agent.model} - {agent.query}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            fullWidth
            label="Type a message"
            value={agentTestInput}
            onChange={(e) => setAgentTestInput(e.target.value)}
            sx={{ mb: 2 }}
          />

          <Button variant="contained" onClick={testAgent}>Send</Button>

          <Box mt={2} maxHeight="300px" overflow="auto">
            {chatMessages.map((msg, idx) => (
              <Box
                key={idx}
                sx={{
                  bgcolor: msg.sender === 'user' ? '#e0f7fa' : '#f1f8e9',
                  p: 1.5,
                  borderRadius: 2,
                  mb: 1,
                  alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start'
                }}
              >
                <Typography variant="body2"><strong>{msg.sender === 'user' ? 'You' : 'Agent'}:</strong> {msg.text}</Typography>
              </Box>
            ))}
          </Box>
        </Paper>
      </Box>
    </Box>
  );
}
