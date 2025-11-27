import React, { useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  Connection,
  Edge,
  Node,
  NodeChange,
  EdgeChange,
} from 'reactflow';

import 'reactflow/dist/style.css';
import CustomEdge from './CustomEdge';
import axios from 'axios';
import { Box, Button, TextField, Typography, Paper } from '@mui/material';

const edgeTypes = { custom: CustomEdge };

export default function WorkflowCanvas({ nodes, edges, setNodes, setEdges }) {
  const [workflowName, setWorkflowName] = useState('');
  const [executionResult, setExecutionResult] = useState(null);

  const onNodesChange = (changes: NodeChange[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
  };

  const onEdgesChange = (changes: EdgeChange[]) => {
    setEdges((eds) => applyEdgeChanges(changes, eds));
  };

  const onConnect = (params: Connection) => {
    setEdges((eds) => addEdge({ ...params, type: 'custom', data: { onDelete: handleDeleteEdge } }, eds));
  };

  const handleDeleteEdge = (id: string) => {
    setEdges((eds) => eds.filter((e) => e.id !== id));
  };

  const handleDeleteNode = (id: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== id));
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
  };

  const handleSaveWorkflow = async () => {
    const agents = nodes.map((n) => ({
      model: n.data.model,
      query: n.data.query,
      mode: n.data.mode,
      provider: n.data.provider,
      additional_info: n.data.additional_info || {},
    }));
    await axios.post('http://localhost:8000/workflow', { name: workflowName, agents });
    alert('Workflow saved!');
    setWorkflowName('');
    setNodes([]);
    setEdges([]);
    setExecutionResult(null);
    window.location.reload(); // reloads the entire page
  };

  const handleRunWorkflow = async () => {
    const agents = [];
    const nodeMap = Object.fromEntries(nodes.map((n) => [n.id, n]));
    const incomingEdges = edges.reduce((acc, e) => {
      acc[e.target] = e.source;
      return acc;
    }, {});
    let current = nodes.find((n) => !incomingEdges[n.id]);
    let lastResult = '';

    while (current) {
      let updatedQuery = current.data.query.replace('{{input}}', lastResult);

      const agentConfig = {
        model: current.data.model,
        query: updatedQuery,
        mode: current.data.mode,
        additional_info: current.data.additional_info || {},
        provider: current.data.provider,
      };

      try {
        const res = await axios.post('http://localhost:8000/ask', { agents: [agentConfig] });
        const result = res.data.results[0];

        if (result.status === 'need_user_input') {
          const userInput = window.prompt(result.prompt || 'Please enter input:');
          if (!userInput) {
            alert('User input required to continue.');
            return;
          }

          agentConfig.query = agentConfig.query.replace('{{user_input}}', userInput);

          const retryRes = await axios.post('http://localhost:8000/ask', { agents: [agentConfig] });
          lastResult = retryRes.data.results[0].response;
        } else {
          lastResult = result.response;
        }
      } catch (err) {
        console.error('Error running agent:', err);
        lastResult = 'Error';
      }

      const nextId = edges.find((e) => e.source === current.id)?.target;
      current = nextId ? nodeMap[nextId] : null;
    }

    setExecutionResult(lastResult || 'No output');
  };

  const nodesWithControls = nodes.map((node, index) => ({
    ...node,
    type: 'default',
    position: node.position || { x: index * 200, y: 100 }, // Ensure unique positions for each node
    data: {
      ...node.data,
      label: (
        <div className="bg-white p-2 rounded shadow-md">
          <div className="font-semibold text-blue-600">{node.data.model}</div>
          <div className="text-sm text-gray-700">{node.data.query}</div>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => handleDeleteNode(node.id)}
              className="px-2 py-1 text-xs bg-red-400 rounded text-white"
            >
              Delete
            </button>
          </div>
        </div>
      ),
    },
  }));

  const edgesWithDelete = edges.map((e) => ({
    ...e,
    type: 'custom',
    data: { onDelete: handleDeleteEdge },
  }));

  return (
    <Box>
      <Paper elevation={3} sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Workflow Configuration
        </Typography>
        <Box display="flex" gap={2} alignItems="center">
          <TextField
            label="Workflow Name"
            value={workflowName}
            onChange={(e) => setWorkflowName(e.target.value)}
            variant="outlined"
            fullWidth
            size="small"
            placeholder="Enter workflow name"
          />
          <Button
            variant="contained"
            color="primary"
            onClick={handleSaveWorkflow}
          >
            Save
          </Button>
          <Button
            variant="contained"
            color="secondary"
            onClick={handleRunWorkflow}
          >
            Run
          </Button>
        </Box>
      </Paper>
      <Box sx={{ height: "80vh", border: "1px solid #ccc", borderRadius: 2 }}>
        <ReactFlow
          nodes={nodesWithControls}
          edges={edgesWithDelete}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          edgeTypes={edgeTypes}
          fitView
        >
          <MiniMap />
          <Controls />
          <Background color="#aaa" gap={16} />
        </ReactFlow>
      </Box>
      {executionResult && (
        <Paper elevation={3} sx={{ mt: 3, p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Final Output
          </Typography>
          <pre>{executionResult}</pre>
        </Paper>
      )}
    </Box>
  );
}
