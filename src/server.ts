import express, { Request, Response } from "express";
// import axios from "axios";
import mysql from "mysql2/promise";
import "dotenv/config";
import { startKafkaConsumer } from "./kafka";
import { connectDatabase } from "./database";
import { generateAnswer } from "./llm";

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

/** ✅ Health Check Endpoint */
app.get("/", (req: Request, res: Response) => {
    res.send({ message: "🚀 News Article Agent API is running!" });
  });

app.post("/agent", async (req: Request, res: Response): Promise<any> => {
    try {
      const { query } = req.body;
  
      if (!query) {
        return res.status(400).json({ error: "Missing query" });
      }
  
      console.log(`🔎 Processing user query: ${query}`);
  
      // Get the AI-generated response
      const response = await generateAnswer(query);
      return res.json(response);
    } catch (error) {
      console.error("❌ Error processing query:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

async function startServer() {
    try {
        await connectDatabase(); // Connect to SingleStore
        await startKafkaConsumer(); // Start Kafka Consumer (if required)

        app.listen(port, () => {
        console.log(`🚀 Server running on http://localhost:${port}`);
        });
    } catch (error) {
        console.error("❌ Server failed to start:", error);
        process.exit(1); // Exit process on failure
    }
}

// Run the startup function
startServer();

export default app;