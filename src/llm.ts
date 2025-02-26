import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
// import { AIMessage, HumanMessage, SystemMessage } from "langchain/schema";
import mysql from "mysql2/promise";

export async function getRelevantNews(query: string) {
  const connection = await mysql.createConnection({
    host: process.env.SINGLESTORE_HOST,
    user: process.env.SINGLESTORE_USER,
    password: process.env.SINGLESTORE_PASSWORD,
    database: process.env.SINGLESTORE_DB,
    port: Number(process.env.SINGLESTORE_PORT),
    ssl: {
        rejectUnauthorized: false,
      },
  });

//   const embeddings = new ChatOpenAI({ model: "text-embedding-ada-002" });
  const embeddings = new OpenAIEmbeddings({
    apiKey: process.env.OPENAI_API_KEY,
  });
  const queryEmbedding = await embeddings.embedQuery(query);
  console.log(`🧠 Query vector size: ${queryEmbedding.length}`);

  const [rows] = await connection.execute(
    `SELECT url, title, date, content, embedding FROM news_embeddings ORDER BY embedding <-> ? LIMIT 3`,
    [JSON.stringify(queryEmbedding)]
  );

  return rows as any[];
}

export async function generateAnswer(query: string) {
  const relevantNews = await getRelevantNews(query);
  const llm = new ChatOpenAI({ model: "gpt-4o-mini" });

  const response = await llm.invoke([
    new SystemMessage("You are a helpful AI that answers news-related queries."),
    new HumanMessage(`User Query: ${query}\nContext: ${JSON.stringify(relevantNews)}\nAnswer:`)
  ]);

  const answerText = response?.content || "No response generated.";

  return {
    answer: answerText,
    sources: relevantNews.map((news: any) => ({
      title: news.title,
      url: news.url,
      date: news.date,
    })),
  };
}
