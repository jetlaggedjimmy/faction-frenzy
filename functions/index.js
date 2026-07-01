const { onRequest } = require("firebase-functions/v2/https");
const app = require("./server");

exports.api = onRequest({ region: "us-central1", maxInstances: 1, memory: "256MiB", timeoutSeconds: 60 }, app);

// Version 1.20