import express from "express";
import cors from "cors";
import fetch from "node-fetch";

/* -------------------------------------------------------------------------- */
/*                               EXPRESS SETUP                                */
/* -------------------------------------------------------------------------- */

const app = express();
app.use(cors());
app.use(express.json());

/* -------------------------------------------------------------------------- */
/*                          PORT (Railway Compatible)                         */
/* -------------------------------------------------------------------------- */

const PORT = process.env.PORT ?? 8080;

/* -------------------------------------------------------------------------- */
/*                                HEALTHCHECK                                 */
/* -------------------------------------------------------------------------- */

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "Wikipedia MCP",
    uptime: process.uptime(),
  });
});

app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

/* -------------------------------------------------------------------------- */
/*                            KEEP-ALIVE HEARTBEAT                             */
/* -------------------------------------------------------------------------- */

setInterval(async () => {
  try {
    const response = await fetch(`http://localhost:${PORT}/health`);
    console.log("💓 Keep-alive ping:", response.ok ? "OK" : "FAILED");
  } catch (err) {
    console.log("💓 Keep-alive ping failed (server might be starting)");
  }
}, 5 * 60 * 1000);

/* -------------------------------------------------------------------------- */
/*                      WIKIPEDIA API HELPER FUNCTIONS                         */
/* -------------------------------------------------------------------------- */

async function searchWikipedia(query) {
  const url = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=3&format=json`;
  
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Wikipedia API error: ${res.status}`);
    const data = await res.json();
    
    // OpenSearch returns: [query, [titles], [descriptions], [urls]]
    const titles = data[1] || [];
    const descriptions = data[2] || [];
    const urls = data[3] || [];
    
    return titles.map((title, i) => ({
      title,
      description: descriptions[i] || "",
      url: urls[i] || "",
    }));
  } catch (err) {
    console.error("❌ Wikipedia search error:", err.message);
    return [];
  }
}

async function getWikipediaContent(title) {
  const url = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=true&explaintext=true&titles=${encodeURIComponent(title)}&format=json`;
  
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Wikipedia API error: ${res.status}`);
    const data = await res.json();
    
    const pages = data.query?.pages || {};
    const pageId = Object.keys(pages)[0];
    
    if (pageId === "-1") return null;
    
    return pages[pageId]?.extract || null;
  } catch (err) {
    console.error("❌ Wikipedia content error:", err.message);
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/*                    TOOL: wikipedia_search IMPLEMENTATION                    */
/* -------------------------------------------------------------------------- */

async function handleWikipediaSearch(params) {
  const query = params?.query || "";
  console.log(`🔍 wikipedia_search: "${query}"`);

  if (!query) {
    return "Please provide a search query for Wikipedia.";
  }

  const results = await searchWikipedia(query);

  if (results.length === 0) {
    return `No Wikipedia articles found for "${query}". Try different keywords.`;
  }

  let response = `Found ${results.length} Wikipedia article(s) for "${query}":\n\n`;

  for (const result of results) {
    response += `**${result.title}**\n`;
    if (result.description) {
      response += `${result.description}\n`;
    }
    response += `[Read more](${result.url})\n\n`;
  }

  return response;
}

/* -------------------------------------------------------------------------- */
/*                  TOOL: wikipedia_get_content IMPLEMENTATION                 */
/* -------------------------------------------------------------------------- */

async function handleWikipediaGetContent(params) {
  const title = params?.title || "";
  console.log(`📖 wikipedia_get_content: "${title}"`);

  if (!title) {
    return "Please provide an article title to retrieve content.";
  }

  const content = await getWikipediaContent(title);

  if (!content) {
    return `Could not retrieve content for "${title}". Make sure the title is correct.`;
  }

  // Truncate to first 1500 characters to avoid overwhelming responses
  const truncated = content.length > 1500 ? content.substring(0, 1500) + "..." : content;

  return `**${title}** (from Wikipedia)\n\n${truncated}`;
}

/* -------------------------------------------------------------------------- */
/*                                MCP ENDPOINT                                 */
/* -------------------------------------------------------------------------- */

app.post("/mcp", async (req, res) => {
  try {
    // AUTH CHECK
    const authHeader = req.headers.authorization;
    const expectedAuth = `Bearer ${process.env.MCP_AUTH_KEY}`;
    
    if (!authHeader || authHeader !== expectedAuth) {
      return res.status(401).json({
        jsonrpc: "2.0",
        id: req.body?.id || null,
        error: { code: -32600, message: "Unauthorized" }
      });
    }

    const { jsonrpc, method, id, params } = req.body || {};

    console.log(`🔧 MCP: ${method}`);

    // ---- JSON-RPC VERSION CHECK ----
    if (jsonrpc !== "2.0") {
      return res.json({
        jsonrpc: "2.0",
        id,
        error: { code: -32600, message: "Invalid JSON-RPC version" },
      });
    }

    // ---- INITIALIZE ----
    if (method === "initialize") {
      return res.json({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          serverInfo: { name: "Wikipedia MCP", version: "1.0.0" },
          capabilities: { tools: {} },
        },
      });
    }

    if (method === "notifications/initialized") {
      return res.status(200).end();
    }

    // ---- LIST TOOLS ----
    if (method === "tools/list") {
      return res.json({
        jsonrpc: "2.0",
        id,
        result: {
          tools: [
            {
              name: "wikipedia_search",
              description: "Search Wikipedia articles and return titles, descriptions, and URLs. Use this to find relevant Wikipedia articles about OU football, players, games, history.",
              inputSchema: {
                type: "object",
                properties: {
                  query: {
                    type: "string",
                    description: "Search query for Wikipedia (e.g. 'Oklahoma Sooners football', 'Baker Mayfield', '2024 college football')"
                  }
                },
                required: ["query"]
              }
            },
            {
              name: "wikipedia_get_content",
              description: "Get the introductory content of a specific Wikipedia article by exact title. Use after searching to get detailed information.",
              inputSchema: {
                type: "object",
                properties: {
                  title: {
                    type: "string",
                    description: "Exact Wikipedia article title (e.g. 'Oklahoma Sooners football')"
                  }
                },
                required: ["title"]
              }
            }
          ]
        }
      });
    }

    // ---- CALL TOOL ----
    if (method === "tools/call") {
      const toolName = params?.name;
      const args = params?.arguments || {};
      let text = "";

      if (toolName === "wikipedia_search") {
        text = await handleWikipediaSearch(args);
      } else if (toolName === "wikipedia_get_content") {
        text = await handleWikipediaGetContent(args);
      } else {
        return res.json({
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `Unknown tool: ${toolName}` },
        });
      }

      return res.json({
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text }],
        },
      });
    }

    // ---- UNKNOWN METHOD ----
    return res.json({
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: `Unknown method: ${method}` },
    });
  } catch (err) {
    console.error("❌ MCP Error:", err.message);
    return res.json({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32603, message: "Internal error" },
    });
  }
});

/* -------------------------------------------------------------------------- */
/*                              START THE SERVER                               */
/* -------------------------------------------------------------------------- */

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Wikipedia MCP running on port ${PORT}`);
});
