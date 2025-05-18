import { useForm } from "react-hook-form";
import { useState, useEffect } from "react";
import { TextField, MenuItem, Button, Typography, Box, Grid, Paper } from "@mui/material";

const providers = ["OpenAI", "HuggingFace", "Local"];
const modelsByProvider: { [key: string]: string[] } = {
  OpenAI: ["gpt-4", "gpt-3.5", "gpt-3.5-turbo"],
  HuggingFace: ["BERT", "RoBERTa", "DistilBERT"],
  Local: ["Ollama", "Mistral", "Llama2"],
};

const modeOptions = ["api", "local"];

export default function AgentForm({ onSubmit, selectedAgent }: { onSubmit: (data: any) => void, selectedAgent: any }) {
  const { register, handleSubmit, reset, setValue, watch } = useForm();
  const selectedProvider = watch("provider");
  const selectedModel = watch("model");
  const selectedMode = watch("mode");
  const [config, setConfig] = useState({});

  useEffect(() => {
    if (selectedAgent) {
      // Prepopulate form fields when selectedAgent changes
      setValue("name", selectedAgent.name || "");
      setValue("description", selectedAgent.description || "");
      setValue("provider", selectedAgent.provider || "");
      setValue("model", selectedAgent.model || "");
      setValue("mode", selectedAgent.mode || "");
      setValue("query", selectedAgent.query || "");
    } else {
      reset(); // Reset form if no agent is selected
    }
  }, [selectedAgent, setValue, reset]);

  const submitHandler = (data: any) => {
    data.additional_info = config;
    onSubmit(data);
    reset();
    setConfig({});
    setValue("name", "");
    setValue("description", "");
    setValue("provider", "");
    setValue("model", "");
    setValue("mode", "");
    setValue("query", "");
  };

  const handleConfigChange = (key: string, value: string) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <Paper elevation={3} sx={{ padding: 4, maxWidth: 600, margin: "auto" }}>
      <Typography variant="h5" component="h2" gutterBottom textAlign="center">
        Configure Agent
      </Typography>
      <Box component="form" onSubmit={handleSubmit(submitHandler)} noValidate sx={{ mt: 2 }}>
        <Grid container spacing={3}>
          {/* Agent Name */}
          <Grid item xs={12}>
            <TextField
              label="Agent Name"
              fullWidth
              {...register("name", { required: true })}
              variant="outlined"
              placeholder="Enter agent name"
              InputLabelProps={{ shrink: true }}
              size="medium"
              helperText="Provide a unique name for the agent"
            />
          </Grid>

          {/* Agent Description */}
          <Grid item xs={12}>
            <TextField
              label="Agent Description"
              fullWidth
              {...register("description", { required: true })}
              variant="outlined"
              placeholder="Enter agent description"
              InputLabelProps={{ shrink: true }}
              size="medium"
              helperText="Provide a brief description of the agent"
            />
          </Grid>

          {/* Provider Dropdown */}
          <Grid item xs={12}>
            <TextField
              select
              label="LLM Provider"
              fullWidth
              {...register("provider", { required: true })}
              variant="outlined"
              InputLabelProps={{ shrink: true }}
              size="medium"
              helperText="Select the LLM provider"
            >
              {providers.map((provider) => (
                <MenuItem key={provider} value={provider}>
                  {provider}
                </MenuItem>
              ))}
            </TextField>
          </Grid>

          {/* Model Dropdown */}
          <Grid item xs={12}>
            <TextField
              select
              label="LLM Model"
              fullWidth
              {...register("model", { required: true })}
              variant="outlined"
              InputLabelProps={{ shrink: true }}
              size="medium"
              helperText="Select the model for the selected provider"
              disabled={!selectedProvider}
            >
              {(modelsByProvider[selectedProvider] || []).map((model) => (
                <MenuItem key={model} value={model}>
                  {model}
                </MenuItem>
              ))}
            </TextField>
          </Grid>

          {/* Mode Dropdown */}
          <Grid item xs={12}>
            <TextField
              select
              label="Mode"
              fullWidth
              {...register("mode", { required: true })}
              variant="outlined"
              InputLabelProps={{ shrink: true }}
              size="medium"
              helperText="Select the mode of operation"
            >
              {modeOptions.map((mode) => (
                <MenuItem key={mode} value={mode}>
                  {mode.toUpperCase()}
                </MenuItem>
              ))}
            </TextField>
          </Grid>

          {/* Query Input */}
          <Grid item xs={12}>
            <TextField
              label="Query"
              fullWidth
              {...register("query", { required: true })}
              variant="outlined"
              placeholder="Enter your query"
              InputLabelProps={{ shrink: true }}
              size="medium"
              helperText="Enter the query for the agent"
            />
          </Grid>

          {/* Additional Config Fields */}
          {(selectedMode === "api" && selectedProvider) && (
            <Grid item xs={12}>
              <Typography variant="subtitle1" gutterBottom>
                Additional Configuration
              </Typography>
              {selectedProvider === "OpenAI" && (
                <TextField
                  label="OpenAI API Key"
                  fullWidth
                  variant="outlined"
                  size="medium"
                  placeholder="Enter OpenAI API Key"
                  InputLabelProps={{ shrink: true }}
                  onChange={(e) => handleConfigChange("api_key", e.target.value)}
                  sx={{ mt: 2 }}
                  helperText="Provide the OpenAI API key for authentication"
                />
              )}
              {selectedProvider === "HuggingFace" && (
                <TextField
                  label="HuggingFace API Key"
                  fullWidth
                  variant="outlined"
                  size="medium"
                  placeholder="Enter HuggingFace API Key"
                  InputLabelProps={{ shrink: true }}
                  onChange={(e) => handleConfigChange("api_key", e.target.value)}
                  sx={{ mt: 2 }}
                  helperText="Provide the HuggingFace API key for authentication"
                />
              )}
            </Grid>
          )}

          {/* Submit Button */}
          <Grid item xs={12}>
            <Button
              type="submit"
              fullWidth
              variant="contained"
              color="primary"
              sx={{ padding: 1.5, fontWeight: "bold" }}
            >
              {selectedAgent ? "Update Agent" : "Add Agent"}
            </Button>
          </Grid>
        </Grid>
      </Box>
    </Paper>
  );
}
