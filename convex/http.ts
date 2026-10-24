import { httpRouter } from "convex/server"
import { auth } from "./auth"
import { askStream, askStreamOptions } from "./ai/ask"
import { mcpGet, mcpOptions, mcpPost } from "./mcp/server"

const http = httpRouter()

auth.addHttpRoutes(http)

http.route({
  path: "/ai/askStream",
  method: "POST",
  handler: askStream,
})

http.route({
  path: "/ai/askStream",
  method: "OPTIONS",
  handler: askStreamOptions,
})

// MCP server for outside models (docs/adr/0004), Streamable HTTP, stateless.
http.route({ path: "/mcp", method: "POST", handler: mcpPost })
http.route({ path: "/mcp", method: "OPTIONS", handler: mcpOptions })
http.route({ path: "/mcp", method: "GET", handler: mcpGet })

export default http
