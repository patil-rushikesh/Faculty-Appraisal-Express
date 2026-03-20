import express, { Application } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import mongoose from "mongoose";
import { config } from "./config";
import routes from "./routes";
import { errorHandler, notFoundHandler } from "./middleware/error.middleware";
import connectDB from "./config/database";
const app: Application = express();

// app.use(helmet());

app.use(
  cors({
    origin: config.allowedOrigins,
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());

app.use(morgan(config.nodeEnv === "development" ? "dev" : "combined"));

app.use("/", routes);


// app.get("/debug/env", (_req, res) => {
//   res.json({
//     hasDatabaseUrl: !!process.env.DATABASE_URL,
//     length: process.env.DATABASE_URL?.length ?? 0
//   });
// });
app.use(notFoundHandler);
app.use(errorHandler);

const startServer = async (): Promise<void> => {
  try {
    await connectDB();
    
    const server = app.listen(config.port, () => {
      console.log(`🚀 Server running on port: ${config.port}`);
      console.log(`📍 Environment: ${config.nodeEnv}`);
    });
    server.timeout = 15_000;
    server.keepAliveTimeout = 60_000;
    const gracefulShutdown = async (signal: string): Promise<void> => {
      console.log(`\n📤 Received ${signal}. Shutting down gracefully...`);

      server.close(async () => {
        console.log('🔌 HTTP server closed');

        try {
          await mongoose.disconnect();
          console.log('📤 Disconnected from MongoDB');
        } catch (err) {
          console.error('⚠️ Error disconnecting from MongoDB:', err);
        }
        process.exit(0);
      });
      setTimeout(() => {
        console.error('❌ Could not close connections in time. Forcefully shutting down.');
        process.exit(1);
      }, 10_000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

export default app;