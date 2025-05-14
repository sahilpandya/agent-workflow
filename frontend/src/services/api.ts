import axios from "axios";

const API_BASE = "http://localhost:8000"; // Adjust if hosted elsewhere

export const askAgent = async (agents: any[]) => {
  try {
    const response = await axios.post(`${API_BASE}/ask`, { agents });
    return response.data;
  } catch (err) {
    console.error("API Error:", err);
    return { error: "Failed to get response from backend" };
  }
};
