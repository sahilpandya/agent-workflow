import { useState } from "react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import {
  CssBaseline, Box, Button, Typography, Paper, List, ListItem, ListItemText,
} from "@mui/material";
import AgentForm from "./components/AgentForm";
import WorkflowCanvas from "./components/WorkflowCanvas";
import WorkflowList from "./components/WorkflowList";
import { askAgent } from "./services/api";
import { Node, Edge } from "reactflow";
import NodeChat from "./components/NodeChat";

const theme = createTheme({
  palette: {
    background: { default: "#ffffff" },
    text: { primary: "#333333", secondary: "#555555" },
    primary: { main: "#1976d2" },
    secondary: { main: "#dc004e" },
  },
  typography: { fontFamily: "Roboto, Arial, sans-serif" },
});

export default function App() {
  const [agents, setAgents] = useState<any[]>([]);
  const [response, setResponse] = useState<any>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [nodeId, setNodeId] = useState(2);
  const [selectedAgent, setSelectedAgent] = useState<any>(null);
  const [currentScreen, setCurrentScreen] = useState<"list" | "builder">("list");

  const [selectedNode, setSelectedNode] = useState<Node | null>(null); // ✅ For Node Chat

  const handleAddAgent = (data: any) => {
    if (selectedAgent) {
      setAgents((prev) =>
        prev.map((agent) => (agent.id === selectedAgent.id ? { ...data, id: agent.id } : agent))
      );
      setNodes((prev) =>
        prev.map((node) =>
          node.id === selectedAgent.id
            ? { ...node, data: { label: `${data.model}: ${data.query}`, model: data.model, query: data.query, mode: data.mode, provider: data.provider, name: data.name, description: data.description } }
            : node
        )
      );
      setSelectedAgent(null);
    } else {
      const id = nodeId.toString();
      const newNode: Node = {
        id,
        data: { label: `${data.model}: ${data.query}`, model: data.model, query: data.query, mode: data.mode, provider: data.provider, name: data.name, description: data.description },
        position: { x: Math.random() * 400, y: Math.random() * 400 },
        type: "default",
      };

      setNodes((prev) => [...prev, newNode]);
      setNodeId((prev) => prev + 1);
      setAgents((prev) => [...prev, { ...data, id }]);
    }
  };

  const handleSubmit = async () => {
    const adjList: { [key: string]: string[] } = {};
    const inDegree: { [key: string]: number } = {};
    nodes.forEach((node) => {
      adjList[node.id] = [];
      inDegree[node.id] = 0;
    });
    edges.forEach((edge) => {
      adjList[edge.source].push(edge.target);
      inDegree[edge.target] += 1;
    });
    const queue = Object.keys(inDegree).filter((id) => inDegree[id] === 0);
    const sortedNodeIds: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      sortedNodeIds.push(current);
      for (const neighbor of adjList[current]) {
        inDegree[neighbor] -= 1;
        if (inDegree[neighbor] === 0) {
          queue.push(neighbor);
        }
      }
    }

    const nodeIdToAgent = agents.reduce((map, agent) => {
      map[agent.id] = agent;
      return map;
    }, {} as { [key: string]: any });

    const orderedAgents = sortedNodeIds.map((id) => nodeIdToAgent[id]).filter(Boolean);
    const res = await askAgent(orderedAgents);
    setResponse(res);
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ height: "100vh", display: "flex", flexDirection: "column" }}>
        {currentScreen === "list" ? (
          <Box sx={{ flex: 1, overflow: "auto" }}>
            <Typography variant="h4" gutterBottom textAlign="center" sx={{ mt: 2 }}>
              Workflow List
            </Typography>
            <WorkflowList />
            <Box textAlign="center" mt={4}>
              <Button variant="contained" color="primary" onClick={() => setCurrentScreen("builder")}>
                Go to Workflow Builder
              </Button>
            </Box>
          </Box>
        ) : (
          <Box sx={{ flex: 1, display: "flex", flexDirection: "row", overflow: "hidden" }}>
            <Box sx={{ width: "25%", overflowY: "auto", p: 2 }}>
              <Typography variant="h4" gutterBottom textAlign="center">
                Agent Workflow Builder
              </Typography>
              <AgentForm onSubmit={handleAddAgent} selectedAgent={selectedAgent} />
              <Paper elevation={3} sx={{ mt: 4, p: 3 }}>
                <Button variant="contained" color="primary" fullWidth onClick={handleSubmit}>
                  Run Workflow
                </Button>
              </Paper>
              <Paper elevation={3} sx={{ mt: 4, p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Agents
                </Typography>
                <List>
                  {agents.map((a) => (
                    <ListItem key={a.id} disablePadding>
                      <ListItemText primary={`${a.model}: ${a.query}`} secondary={`Mode: ${a.mode}`} />
                      <Button variant="text" color="primary" onClick={() => setSelectedAgent(a)}>
                        Edit
                      </Button>
                    </ListItem>
                  ))}
                </List>
              </Paper>
              {response && (
                <Paper elevation={3} sx={{ mt: 4, p: 3 }}>
                  <Typography variant="h6" gutterBottom>
                    Response
                  </Typography>
                  <pre style={{ backgroundColor: "#f9f9f9", padding: "16px", borderRadius: "4px" }}>
                    {JSON.stringify(response, null, 2)}
                  </pre>
                </Paper>
              )}
              <Box textAlign="center" mt={4}>
                <Button variant="contained" color="secondary" onClick={() => setCurrentScreen("list")}>
                  Back to Workflow List
                </Button>
              </Box>
            </Box>
            <Box sx={{ flex: 1, overflow: "hidden", position: "relative" }}>
              <WorkflowCanvas
                nodes={nodes}
                edges={edges}
                setEdges={setEdges}
                setNodes={setNodes}
                onNodeClick={(node) => setSelectedNode(node)} // ✅ Select node on click
              />
            </Box>
            {/* Node Chat Panel */}
            {selectedNode && (
              <Box sx={{ width: "25%", borderLeft: "1px solid #ddd", display: "flex", flexDirection: "column" }}>
                <NodeChat
                  node={selectedNode}
                  agent={agents.find((a) => a.id === selectedNode.id)}
                  onClose={() => setSelectedNode(null)}
                />
              </Box>
            )}
          </Box>
        )}
      </Box>
    </ThemeProvider>
  );
}
