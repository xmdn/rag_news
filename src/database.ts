import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import mysql from "mysql2/promise";

let connection: mysql.Connection;

/** ✅ Connect to SingleStore */
export async function connectDatabase() {
  connection = await mysql.createConnection({
    host: process.env.SINGLESTORE_HOST,
    user: process.env.SINGLESTORE_USER,
    password: process.env.SINGLESTORE_PASSWORD,
    database: process.env.SINGLESTORE_DB,
    port: Number(process.env.SINGLESTORE_PORT),
    ssl: {
        rejectUnauthorized: false,
    },
  });

  await connection.execute(`
    CREATE TABLE IF NOT EXISTS news_embeddings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      url TEXT,
      title TEXT,
      content TEXT,
      date DATETIME,
      embedding VECTOR(1536)
    );
  `);
  console.log("✅ Connected to SingleStore!");
}

/** ✅ Store News Embeddings */
export async function storeArticleEmbedding(article: any) {
  const embeddings = new OpenAIEmbeddings({
    apiKey: process.env.OPENAI_API_KEY, // Ensure API Key is used
  });

  // Generate embedding vector for article content
  const vector = await embeddings.embedQuery(article.content);
  console.log(`🧠 Generated vector size: ${vector.length}`);

  let articleDate: string | null = article.date ? new Date(article.date).toISOString().slice(0, 19).replace("T", " ") : null;

  await connection.execute(
    `INSERT INTO news_embeddings (url, title, content, date, embedding) VALUES (?, ?, ?, ?, ?);`,
    [article.url, article.title, article.content, articleDate, JSON.stringify(vector)]
  );
}

export async function isArticleInDatabase(url: string): Promise<boolean> {
    const [rows] = await connection.execute(
      `SELECT COUNT(*) AS count FROM news_embeddings WHERE url = ?`,
      [url]
    );
    const count = (rows as any[])[0]?.count || 0;
    return count > 0;
  }