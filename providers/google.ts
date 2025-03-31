import { createGoogleGenerativeAI } from '@ai-sdk/google';

export const googleProvider = createGoogleGenerativeAI({
  apiKey: process.env.NEXT_PUBLIC_GOOGLE_GENERATIVE_AI_API_KEY,
});
