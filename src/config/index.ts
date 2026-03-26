import dotenv from 'dotenv';

dotenv.config();



export const config = {
  // Server
  // Provide a sensible default port so containers start correctly when PORT is not set
  port: Number(process.env.PORT || 4000),
  
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Database
  databaseUrl: process.env.DATABASE_URL || '',
    
  // JWT
  jwtSecret: process.env.JWT_SECRET || 'your-secret-key',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
  
  // CORS
  allowedOrigins: (process.env.ALLOWED_ORIGINS)
};


export default config;
