import { useState } from "react";
import { Box, Typography, TextField, Button, Paper, IconButton } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { askAgent } from "../services/api";

interface NodeChatProps {
  node: any;
  agent: any;
  onClose: () => void;
}

const NodeChat: React.FC<NodeChatProps> = ({ node, agent, onClose }) => {
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<{ role: "user" | "agent"; text: string }[]>([]);

  const handleSend = async () => {
    if (!query.trim()) return;
    const newMessages = [...messages, { role: "user", text: query }];
    setMessages(newMessages);
    setQuery("");

    try {
      const response = await askAgent([{ ...agent, query }]);
      setMessages((prev) => [...prev, { role: "agent", text: JSON.stringify(response, null, 2) }]);
    } catch (error) {
      setMessages((prev) => [...prev, { role: "agent", text: "Error fetching response." }]);
    }
  };

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", p: 2, borderBottom: "1px solid #ddd" }}>
        <Typography variant="h6">Chat: {agent?.model}</Typography>
        <IconButton onClick={onClose}><CloseIcon /></IconButton>
      </Box>
      <Box sx={{ flex: 1, overflowY: "auto", p: 2, bgcolor: "#f9f9f9" }}>
        {messages.map((msg, index) => (
          <Paper key={index} sx={{ p: 1, mb: 1, bgcolor: msg.role === "user" ? "#e0f7fa" : "#fff9c4" }}>
            <Typography variant="body2" sx={{ fontWeight: "bold" }}>
              {msg.role === "user" ? "You" : "Agent"}
            </Typography>
            <Typography variant="body1">{msg.text}</Typography>
          </Paper>
        ))}
      </Box>
      <Box sx={{ p: 2, borderTop: "1px solid #ddd", display: "flex", gap: 1 }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Ask something..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Button variant="contained" onClick={handleSend}>
          Send
        </Button>
      </Box>
    </Box>
  );
};

export default NodeChat;
