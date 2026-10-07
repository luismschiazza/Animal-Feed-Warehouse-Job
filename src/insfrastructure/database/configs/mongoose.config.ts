import { ConfigService } from '@nestjs/config';
import { MongooseModuleFactoryOptions } from '@nestjs/mongoose';

export const MongooseConfig = async (
  configService: ConfigService,
): Promise<MongooseModuleFactoryOptions> => {
  const uri = configService.get<string>('MONGO_URL');

  if (!uri) {
    throw new Error('MONGO_URL must be configured');
  }

  return {
    uri,
    retryAttempts: 30,
    retryDelay: 2000,
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    family: 4,
  };
};
