// import { Kafka } from "kafkajs";
import KafkaJS from "kafkajs";
import fetch, { AbortError } from "node-fetch";
import * as cheerio from "cheerio";
import fs from "fs";
import csvParser from "csv-parser";
import { storeArticleEmbedding, isArticleInDatabase } from "./database";
import path from "path";

const kafka = new KafkaJS.Kafka({
    clientId: process.env.KAFKA_CLIENT_ID || "news-agent",
    brokers: [process.env.KAFKA_BROKER || "pkc-ewzgj.europe-west4.gcp.confluent.cloud:9092"],
    sasl: {
      mechanism: "plain", // ✅ Use "plain" for Confluent Cloud
      username: process.env.KAFKA_USERNAME!,
      password: process.env.KAFKA_PASSWORD!,
    },
    retry: {
        retries: 0
    }
  });

const consumer = kafka.consumer({ groupId: "news-group" });

const csvFilePath = "articles_dataset.csv";

export async function startKafkaConsumer() {
    try {
      console.log("⏳ Connecting to Kafka...");
      await consumer.connect();
      console.log("✅ Connected to Kafka!");
  
      await consumer.subscribe({ topic: "news-articles", fromBeginning: true });
  
      await consumer.run({
        eachMessage: async ({ message }) => {
          if (message.value) {
            const url = message.value.toString();
            console.log(`📥 Processing URL from Kafka: ${url}`);
            await scrapeAndStoreArticle(url);
          }
        },
      });
    } catch (error) {
      console.error("❌ Kafka connection failed. Falling back to CSV...");
      await processArticlesFromCSV();
    }
  }

async function fetchWithRetry(url: string, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(`🌍 Fetching (attempt ${attempt}): ${url}`);
  
        const controller = new AbortController(); // ✅ Corrected type
        const timeout = setTimeout(() => controller.abort(), 15000);
  
        const response = await fetch(url);
        clearTimeout(timeout);
  
        if (!response.ok) {
          console.warn(`⚠️ Attempt ${attempt}: ${url} returned ${response.status} - ${response.statusText}`);
        } else {
          return response.text();
        }
      } catch (error) {
        if (error instanceof AbortError) {
          console.error(`⏳ Timeout exceeded for ${url}`);
        } else {
          console.error(`⚠️ Attempt ${attempt} failed: ${error.message}`);
        }
  
        if (attempt === retries) throw error;
      }
    }
    return null;
  }

  async function processArticlesFromCSV() {
    return new Promise<void>((resolve, reject) => {
      console.log(`📂 Looking for CSV at: ${csvFilePath}`);
  
      if (!fs.existsSync(csvFilePath)) {
        console.error("❌ CSV file not found at:", csvFilePath);
        reject(new Error("CSV file missing"));
        return;
      }
  
      fs.createReadStream(csvFilePath)
        .pipe(csvParser())
        .on("data", async (row) => {
          const url = row.URL?.trim();
          if (!url) {
            console.warn("⚠️ Skipping row with missing URL:", row);
            return;
          }
  
          console.log(`📄 Checking if article exists: ${url}`);
          const exists = await isArticleInDatabase(url);
  
          if (!exists) {
            console.log(`🆕 New article detected. Storing: ${url}`);
            await scrapeAndStoreArticle(url);
          } else {
            console.log(`✅ Article already exists in the database: ${url}`);
          }
        })
        .on("end", () => {
          console.log("✅ Finished processing articles from CSV.");
          resolve();
        })
        .on("error", (error) => {
          console.error("❌ Error reading CSV:", error);
          reject(error);
        });
    });
  }

async function scrapeAndStoreArticle(url: string) {
    const html = await fetchWithRetry(url);

    if (!html) {
        console.error(`❌ Failed to fetch after retries: ${url}`);
        return;
      }
    
    const $ = cheerio.load(html);
  
    const title = $("head title").text();
    const content = $("article").text().trim();
  
    if (!content) {
      console.log(`❌ No article content found for ${url}`);
      return;
    }
  
    const articleData = {
      title,
      content,
      url,
      date: new Date().toISOString(),
    };
  
    await storeArticleEmbedding(articleData);
  }