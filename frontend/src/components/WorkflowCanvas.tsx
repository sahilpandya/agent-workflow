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
import { Box, TextField, Paper, Typography, Fab } from '@mui/material';
import NodeChat from './NodeChat';
import { motion, AnimatePresence } from 'framer-motion';
import SaveIcon from '@mui/icons-material/Save';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';

const edgeTypes = { custom: CustomEdge };

export default function WorkflowCanvas({ nodes, edges, setNodes, setEdges }) {
  const [workflowName, setWorkflowName] = useState('');
  const [executionResult, setExecutionResult] = useState(null);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);

  const onNodesChange = (changes: NodeChange[]) => {
    setNodes((nds) => {
      const updatedNodes = applyNodeChanges(changes, nds);
      console.log('Updated Nodes:', updatedNodes); // Debugging log
      return updatedNodes;
    });
  };

  const onEdgesChange = (changes: EdgeChange[]) => {
    setEdges((eds) => {
      const updatedEdges = applyEdgeChanges(changes, eds);
      console.log('Updated Edges:', updatedEdges); // Debugging log
      return updatedEdges;
    });
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
    if (!workflowName.trim()) {
      alert('Please enter workflow name!');
      return;
    }
    const agents = nodes.map((n) => ({
      model: n.data.model,
      query: n.data.query,
      mode: n.data.mode,
      additional_info: n.data.additional_info || {},
      name: n.data.name,
      description: n.data.description,
      provider: n.data.provider,
    }));
    console.log('Saving Workflow:', { name: workflowName, agents }); // Debugging log
    try {
      await axios.post('http://localhost:8000/workflow', { name: workflowName, agents });
      alert('Workflow saved!');
    } catch (err) {
      console.error('Error saving workflow:', err);
      alert('Failed to save workflow.');
    }
  };

  const handleRunWorkflow = async () => {
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
        name: current.data.name,
        description: current.data.description,
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

  const handleNodeClick = (event, node) => {
    event.stopPropagation();
    setSelectedNode(node);
  };

  const handleCanvasClick = () => {
    setSelectedNode(null);
  };

  const nodesWithControls = nodes.map((node, index) => ({
    ...node,
    type: 'default',
    position: node.position || { x: index * 200, y: 100 },
    data: {
      ...node.data,
      label: (
        <div className="bg-white p-2 rounded shadow-md">
          <div className="font-semibold text-blue-600">{node.data.model}</div>
          <div className="text-sm text-gray-700">{node.data.query}</div>
          <div className="mt-2 flex gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteNode(node.id);
              }}
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
    <Box sx={{ position: 'relative', height: '90vh' }}>
      <TextField
        label="Workflow Name"
        value={workflowName}
        onChange={(e) => setWorkflowName(e.target.value)}
        variant="outlined"
        fullWidth
        size="small"
        placeholder="Enter workflow name"
        sx={{ mb: 2 }}
      />

      <Box sx={{ height: '100%', border: '1px solid #ccc', borderRadius: 2 }} onClick={handleCanvasClick}>
        <ReactFlow
          nodes={nodesWithControls}
          edges={edgesWithDelete}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          edgeTypes={edgeTypes}
          onNodeClick={handleNodeClick}
          fitView
        >
          <MiniMap />
          <Controls />
          <Background color="#aaa" gap={16} />
        </ReactFlow>
      </Box>

      <AnimatePresence>
        {selectedNode && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.3 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100vh',
                background: 'black',
                zIndex: 999,
              }}
              onClick={handleCanvasClick}
            />
            <motion.div
              key="panel"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'tween', duration: 0.4 }}
              style={{
                position: 'fixed',
                top: 0,
                right: 0,
                width: '400px',
                height: '100vh',
                background: '#fff',
                boxShadow: '-2px 0 10px rgba(0,0,0,0.2)',
                zIndex: 1000,
              }}
            >
              <NodeChat
                node={selectedNode}
                agent={selectedNode.data}
                onClose={() => setSelectedNode(null)}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Floating action buttons */}
      <Box
        sx={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          zIndex: 1500,
        }}
      >
        <Fab color="secondary" onClick={handleRunWorkflow} aria-label="Run">
          <PlayArrowIcon />
        </Fab>
        <Fab color="primary" onClick={handleSaveWorkflow} aria-label="Save">
          <SaveIcon />
        </Fab>
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
