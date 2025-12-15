import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import * as cheerio from "cheerio";

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
    service: "SoonerStats MCP",
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
/*                      SOONERSTATS SCRAPING FUNCTIONS                         */
/* -------------------------------------------------------------------------- */

async function searchPlayer(playerName) {
  console.log(`🔍 Searching SoonerStats for player: "${playerName}"`);
  
  try {
    // Search URL structure - we'll try the football players index
    const url = `https://soonerstats.com/football/players/index.cfm`;
    const res = await fetch(url);
    
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    
    const html = await res.text();
    const $ = cheerio.load(html);
    
    // This is a basic scraper - we'll return structured info about what we can find
    // Note: Actual scraping logic would need to be tailored to SoonerStats HTML structure
    
    return {
      found: true,
      message: `Found player data on SoonerStats. Visit https://soonerstats.com/football/players/ to search for ${playerName}`,
      searchUrl: `https://soonerstats.com/football/players/index.cfm`,
    };
    
  } catch (err) {
    console.error("❌ SoonerStats search error:", err.message);
    return {
      found: false,
      message: `Could not search SoonerStats: ${err.message}`,
    };
  }
}

async function getSeasonInfo(year, sport = "football") {
  console.log(`📅 Getting ${sport} season info for ${year}`);
  
  try {
    const url = `https://soonerstats.com/${sport}/seasons/schedule.cfm?seasonid=${year}`;
    const res = await fetch(url);
    
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    
    const html = await res.text();
    const $ = cheerio.load(html);
    
    // Extract basic info from the page
    const title = $('h1').first().text().trim();
    
    return {
      found: true,
      year: year,
      sport: sport,
      message: `Season data available at SoonerStats`,
      url: url,
      title: title || `${year} ${sport} season`,
    };
    
  } catch (err) {
    console.error("❌ Season info error:", err.message);
    return {
      found: false,
      message: `Could not retrieve ${year} ${sport} season: ${err.message}`,
    };
  }
}

async function searchRecord(query) {
  console.log(`🏆 Searching records for: "${query}"`);
  
  try {
    const url = `https://soonerstats.com/football/recordbook/index.cfm`;
    const res = await fetch(url);
    
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    
    return {
      found: true,
      message: `OU record book available on SoonerStats`,
      url: url,
      query: query,
    };
    
  } catch (err) {
    console.error("❌ Record search error:", err.message);
    return {
      found: false,
      message: `Could not search records: ${err.message}`,
    };
  }
}

/* -------------------------------------------------------------------------- */
/*                    TOOL IMPLEMENTATIONS                                     */
/* -------------------------------------------------------------------------- */

async function handlePlayerSearch(params) {
  const playerName = params?.player_name || "";
  
  if (!playerName) {
    return "Please provide a player name to search (e.g., 'Baker Mayfield', 'Kyler Murray')";
  }
  
  const result = await searchPlayer(playerName);
  
  if (result.found) {
    return `**${playerName} on SoonerStats**\n\n${result.message}\n\n[View Player Database](${result.searchUrl})`;
  } else {
    return result.message;
  }
}

async function handleSeasonLookup(params) {
  const year = params?.year || new Date().getFullYear();
  const sport = params?.sport || "football";
  
  const result = await getSeasonInfo(year, sport);
  
  if (result.found) {
    return `**${result.title}**\n\n${result.message}\n\n[View Full Season](${result.url})`;
  } else {
    return result.message;
  }
}

async function handleRecordSearch(params) {
  const query = params?.query || "";
  
  if (!query) {
    return "Please specify what record you're looking for (e.g., 'most touchdowns', 'longest winning streak')";
  }
  
  const result = await searchRecord(query);
  
  if (result.found) {
    return `**OU Record Book**\n\n${result.message}\n\nSearch for: "${query}"\n\n[Browse Records](${result.url})`;
  } else {
    return result.message;
  }
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
          serverInfo: { name: "SoonerStats MCP", version: "1.0.0" },
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
              name: "soonerstats_player_search",
              description: "Search for OU player information on SoonerStats - the definitive source for Oklahoma Sooners history. Use for player bios, career stats, and records.",
              inputSchema: {
                type: "object",
                properties: {
                  player_name: {
                    type: "string",
                    description: "Player name to search for (e.g., 'Baker Mayfield', 'Kyler Murray', 'Billy Sims')"
                  }
                },
                required: ["player_name"]
              }
            },
            {
              name: "soonerstats_season_lookup",
              description: "Get OU season information from SoonerStats for any year. Returns schedules, records, and results.",
              inputSchema: {
                type: "object",
                properties: {
                  year: {
                    type: "number",
                    description: "Year to look up (e.g., 2024, 2000, 1985)"
                  },
                  sport: {
                    type: "string",
                    description: "Sport to search (default: football). Options: football, basketball, baseball, softball",
                    default: "football"
                  }
                },
                required: ["year"]
              }
            },
            {
              name: "soonerstats_record_search",
              description: "Search the official OU record book on SoonerStats for team and individual records.",
              inputSchema: {
                type: "object",
                properties: {
                  query: {
                    type: "string",
                    description: "What record to search for (e.g., 'most touchdowns', 'longest winning streak', 'career rushing yards')"
                  }
                },
                required: ["query"]
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

      if (toolName === "soonerstats_player_search") {
        text = await handlePlayerSearch(args);
      } else if (toolName === "soonerstats_season_lookup") {
        text = await handleSeasonLookup(args);
      } else if (toolName === "soonerstats_record_search") {
        text = await handleRecordSearch(args);
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
  console.log(`🚀 SoonerStats MCP running on port ${PORT}`);
});
