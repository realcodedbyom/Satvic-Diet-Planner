const http = require("http")

http
  .request({ host: "localhost", port: process.env.PORT || 3000, path: "/api/health", method: "GET" }, (res) => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      process.exit(0)
    } else {
      process.exit(1)
    }
  })
  .on("error", () => process.exit(1))
  .end()

